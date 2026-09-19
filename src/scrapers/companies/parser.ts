import * as cheerio from "cheerio";
import { htmlToText, hashUrl } from "./text.js";
import type { RawJob } from "./types.js";

export interface ParseResult {
  method: "json-ld" | "heuristic" | "none";
  jobs: RawJob[];
}

function* walk(node: unknown): Generator<any> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === "object") {
    yield node;
    yield* walk((node as any)["@graph"]);
  }
}

function jsonLdJobs(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }
    for (const n of walk(data)) {
      const type = ([] as string[]).concat(n["@type"] ?? []);
      if (!type.includes("JobPosting") || !n.title) continue;
      const loc = ([] as any[]).concat(n.jobLocation ?? [])[0]?.address;
      const url = typeof n.url === "string" ? new URL(n.url, pageUrl).toString() : pageUrl;
      const ident = n.identifier?.value ?? n.identifier;
      jobs.push({
        externalId: typeof ident === "string" || typeof ident === "number" ? String(ident) : hashUrl(url + n.title),
        title: String(n.title),
        description: n.description ? htmlToText(String(n.description)) : undefined,
        url,
        location: [loc?.addressLocality, loc?.addressRegion].filter(Boolean).join(", ") || undefined,
        publishedAt: n.datePosted ? new Date(n.datePosted) : undefined,
      });
    }
  });
  return jobs;
}

// Enlaces tipo /ofertas/disenador-web: una palabra de empleo seguida de un "slug".
const JOB_HREF = /\/(?:oferta|ofertas|vacante|vacantes|puesto|puestos|empleo|job|jobs|position|positions)\/[^/?#]{4,}/i;
const NOT_A_JOB = /ver (?:todas|mas)|volver|politica|privacidad|aviso legal|cookies|suscri|enviar cv|candidatura espontanea/i;
// Botones y llamadas a la acción ("See open positions", "Conoce más"), no ofertas.
const CTA_START = /^(?:see|view|learn|read|more|discover|explore|browse|check|find|apply|ver|conoce|descubre|lee|leer|saber|consulta|accede|entra|inscribete|encuentra|mas info)\b/;
// Secciones genéricas colgando de /jobs/, /empleo/… que no son una oferta concreta.
const GENERIC_SLUG = /all-?jobs|accessib|faq|proceso|process|benefits|beneficios|cultura|culture|equipo|team|values|valores|about|sobre|contact|search|buscar/;

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function heuristicJobs(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  const host = new URL(pageUrl).host;
  const seen = new Map<string, RawJob>();
  $("a[href]").each((_, el) => {
    const title = $(el).text().replace(/\s+/g, " ").trim();
    if (title.length < 8 || title.length > 100) return;
    let url: URL;
    try {
      url = new URL($(el).attr("href")!, pageUrl);
    } catch {
      return;
    }
    if (url.host !== host || !JOB_HREF.test(url.pathname)) return;
    const t = fold(title);
    if (NOT_A_JOB.test(t) || CTA_START.test(t) || /[.:!?]$/.test(title)) return;
    if (GENERIC_SLUG.test(fold(url.pathname))) return;
    url.hash = "";
    seen.set(url.toString(), { externalId: hashUrl(url.toString()), title, url: url.toString() });
  });
  return [...seen.values()];
}

/**
 * Extrae ofertas de una página SIN IA: primero datos estructurados JSON-LD
 * (fiables); si no hay, enlaces con pinta de oferta (menos fiables).
 * Las páginas que cargan sus ofertas con JavaScript no se ven con fetch.
 */
export function extractJobs(html: string, pageUrl: string): ParseResult {
  const structured = jsonLdJobs(html, pageUrl);
  if (structured.length) return { method: "json-ld", jobs: structured };
  const heuristic = heuristicJobs(html, pageUrl);
  return heuristic.length ? { method: "heuristic", jobs: heuristic } : { method: "none", jobs: [] };
}
