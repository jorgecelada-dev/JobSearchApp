import * as cheerio from "cheerio";
import { normalize } from "../../matching/classifier.js";
import { findLinksByTerms } from "./careers.js";
import { fetchText } from "./http.js";

export type PageKind = "home" | "careers" | "contact" | "legal";
export interface Page {
  url: string;
  html: string;
  kind: PageKind;
}
export interface EmailCandidate {
  email: string;
  /** Más alto = más adecuado para enviar un CV. */
  score: number;
  reasons: string[];
  sourceUrl: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const ASSET_TLD = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "css", "js", "woff", "woff2", "ico", "mp4"]);
const JUNK_DOMAIN = /(^|\.)(example\.(com|org)|wixpress\.com|sentry\.io|domain\.com|email\.com|tudominio\.(com|es)|dominio\.(com|es)|yoursite\.com)$/;

/** Correos ofuscados por Cloudflare: el primer byte es la clave XOR de los demás. */
export function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

/** "info [arroba] empresa (punto) es" -> "info@empresa.es" */
const deobfuscate = (t: string) =>
  t
    .replace(/\s*[[({]\s*(?:at|arroba)\s*[\])}]\s*/gi, "@")
    .replace(/\s*[[({]\s*(?:dot|punto)\s*[\])}]\s*/gi, ".");

function clean(raw: string): string | null {
  const email = raw.trim().toLowerCase().replace(/^mailto:/, "").replace(/[.,;:)>\]]+$/, "");
  const m = /^[a-z0-9._%+-]{2,}@((?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])(?:\.(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9]))*)\.([a-z]{2,24})$/.exec(email);
  if (!m || email.length > 80 || email.includes("..")) return null;
  if (ASSET_TLD.has(m[2]!) || JUNK_DOMAIN.test(`${m[1]}.${m[2]}`)) return null;
  return email;
}

/** Emails de una página con el texto que los rodea (sirve para puntuarlos). */
export function extractEmails(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const found = new Map<string, string>();
  const add = (raw: string, context: string) => {
    const email = clean(raw);
    if (email && !found.has(email)) found.set(email, context.replace(/\s+/g, " ").trim().slice(0, 240));
  };

  $('a[href^="mailto:" i]').each((_, el) => {
    const href = decodeURIComponent($(el).attr("href")!.slice(7).split("?")[0]!);
    for (const addr of href.split(",")) add(addr, `${$(el).text()} ${$(el).parent().text()}`);
  });
  $("[data-cfemail]").each((_, el) => add(decodeCfEmail($(el).attr("data-cfemail")!), $(el).parent().text()));
  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) =>
    add(decodeCfEmail($(el).attr("href")!.split("#")[1] ?? ""), $(el).parent().text()),
  );

  $("script, style, noscript").remove();
  // Cada etiqueta se sustituye por un espacio: `.text()` pega párrafos contiguos
  // ("info@a.es" + "ventas@a.es" -> "info@a.esventas@a.es") y fabricaría emails falsos.
  const spaced = ($("body").html() ?? "").replace(/<[^>]*>/g, " ");
  const text = deobfuscate(cheerio.load(`<p>${spaced}</p>`).text());
  for (const m of text.matchAll(EMAIL_RE)) add(m[0], text.slice(Math.max(0, m.index! - 110), m.index! + m[0].length + 110));
  return found;
}

const ROLE_JOBS = /(rrhh|recursoshumanos|recursos-humanos|^rh$|^hr$|empleo|trabajo|trabaja|talent|seleccion|reclutamiento|career|^jobs?$|curricul|^cv|candidatur|^people$)/;
const ROLE_GENERAL = /^(info|informacion|contacto|contact|hola|hello|administracion|admin|secretaria|recepcion|oficina|general|atencion|comunicacion)$/;
const ROLE_BAD = /(^web$|^www$|no-?reply|donotreply|privacidad|privacy|dpo|lopd|rgpd|gdpr|gdrp|legal|abuse|webmaster|postmaster|soporte|support|factura|pedidos?|reclamacion|prensa|press|marketing|ventas|comercial|compras|proveedor)/;
const JOB_CONTEXT = /curricul|curriculo|\bcv\b|empleo|trabaj|candidatur|rrhh|recursos humanos|seleccion|talento|vacante|unete/;

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

export function scoreEmail(email: string, context: string, kind: PageKind, companySite: string): { score: number; reasons: string[] } {
  const [local = "", domain = ""] = email.split("@");
  const reasons: string[] = [];
  let score = 0;
  const add = (n: number, why: string) => ((score += n), reasons.push(why));

  if (ROLE_BAD.test(local)) add(-8, "buzón para otro fin (privacidad, ventas, soporte…)");
  else if (ROLE_JOBS.test(local)) add(10, "buzón de RR. HH. / empleo");
  else if (ROLE_GENERAL.test(local)) add(1, "buzón general");

  if (JOB_CONTEXT.test(normalize(context))) add(5, "aparece junto a «currículum / empleo»");
  if (kind === "careers") add(4, "está en su página de empleo");
  if (kind === "contact") add(1, "está en su página de contacto");
  const h = host(companySite);
  if (domain === h || domain.endsWith(`.${h}`) || h.endsWith(`.${domain}`)) add(2, "del dominio de la empresa");
  return { score, reasons };
}

export const confidence = (score: number) => (score >= 10 ? "alta" : score >= 4 ? "media" : "baja");

/** Une los emails de varias páginas y los ordena por idoneidad (mejor primero). Solo score > 0. */
export function rankEmails(pages: Page[], companySite: string): EmailCandidate[] {
  const best = new Map<string, EmailCandidate>();
  for (const page of pages) {
    for (const [email, context] of extractEmails(page.html)) {
      const { score, reasons } = scoreEmail(email, context, page.kind, companySite);
      const prev = best.get(email);
      if (!prev || score > prev.score) best.set(email, { email, score, reasons, sourceUrl: page.url });
    }
  }
  return [...best.values()].filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
}

const CONTACT_TERMS = ["contacto", "contactanos", "contacta", "contact", "donde estamos", "como llegar"];
const LEGAL_TERMS = ["aviso legal", "legal notice", "informacion legal"];

/**
 * Busca el mejor email para enviar un CV. Parte de las páginas ya descargadas y solo
 * descarga más (contacto, aviso legal) si aún no hay un candidato fiable: como mucho 3 peticiones.
 */
export async function findCompanyEmail(website: string, known: Page[]): Promise<{ best: EmailCandidate | null; reached: boolean }> {
  const pages = [...known];
  const have = (url: string) => pages.some((p) => p.url === url);
  const load = async (url: string, kind: PageKind) => {
    if (have(url)) return;
    try {
      pages.push({ url, kind, html: await fetchText(url) });
    } catch {
      /* una página que no carga no impide usar las demás */
    }
  };

  if (!pages.some((p) => p.kind === "home")) await load(website, "home");
  let ranked = rankEmails(pages, website);

  for (const [terms, kind] of [[CONTACT_TERMS, "contact"], [LEGAL_TERMS, "legal"]] as const) {
    if ((ranked[0]?.score ?? 0) >= (kind === "contact" ? 10 : 4)) break;
    const home = pages.find((p) => p.kind === "home");
    const link = home && findLinksByTerms(home.html, home.url, [...terms])[0];
    if (link && new URL(link.url).host === new URL(website).host) {
      await load(link.url, kind);
      ranked = rankEmails(pages, website);
    }
  }
  // `reached` distingue «no hay email» de «la web no cargó» (bloqueo, caída): esto último se reintenta.
  return { best: ranked[0] ?? null, reached: pages.length > 0 };
}
