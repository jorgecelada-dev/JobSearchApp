import { access } from "node:fs/promises";
import { chromium, type Browser, type Frame, type Page } from "playwright";
import { normalize } from "../matching/classifier.js";

/**
 * Abre la oferta en un navegador VISIBLE y rellena lo que reconoce del formulario: nombre,
 * email, carta de presentación y CV. NUNCA pulsa «Enviar»: revisas la página y la envías tú.
 * Usa el Edge de Windows o el Chrome instalado; si no hay ninguno, el Chromium de Playwright.
 */
export type FieldKind = "fullName" | "firstName" | "lastName" | "email" | "coverLetter" | "cv";

export interface Applicant {
  name: string | null;
  email: string | null;
  coverLetter: string;
  cvPath: string | null;
}

export interface AutofillReport {
  url: string;
  filled: FieldKind[];
  /** Lo que conviene rellenar a mano (teléfono, preguntas propias de la empresa…). */
  missing: string[];
  note?: string;
}

const RULES: [FieldKind, RegExp][] = [
  // El orden importa: «Nombre y apellidos» es nombre completo, no apellidos.
  ["email", /e-?mail|correo/],
  ["fullName", /full.?name|nombre (y apellidos|completo)|^name$|tu nombre|your name/],
  ["lastName", /apellido|last.?name|surname|family.?name/],
  ["firstName", /first.?name|given.?name|^nombre$|^name.?first/],
  ["coverLetter", /cover|carta|presentacion|motivacion|mensaje|message|comment|sobre ti|about you/],
  ["cv", /\bcv\b|curricul|resume|^file$|archivo|adjunt/],
];

/** Decide qué es un campo a partir de su etiqueta, name, id, placeholder y tipo. */
export function classifyField(f: { type: string; tag: string; text: string }): FieldKind | null {
  const text = normalize(f.text).replace(/[_\-[\]]+/g, " ").trim();
  if (f.type === "file") return RULES.find(([k]) => k === "cv")![1].test(text) || !text ? "cv" : null;
  if (f.type === "email") return "email";
  if (["hidden", "submit", "button", "checkbox", "radio", "password", "search"].includes(f.type)) return null;
  for (const [kind, re] of RULES) {
    if (kind === "cv") continue;
    if (kind === "coverLetter" && f.tag !== "textarea") continue;
    if (re.test(text)) return kind;
  }
  return null;
}

// Etiqueta, name, id, placeholder y aria-label de cada campo, en todos los frames (Greenhouse usa un iframe).
async function describeFields(frame: Frame) {
  return frame.$$eval("input, textarea", (els) =>
    els.map((el, i) => {
      const e = el as HTMLInputElement;
      const label = (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent) || e.closest("label")?.textContent || "";
      e.setAttribute("data-jsa-field", String(i));
      const visible = e.type === "file" || !!(e.offsetWidth || e.offsetHeight);
      return { index: i, tag: e.tagName.toLowerCase(), type: (e.type || "text").toLowerCase(), visible, empty: !e.value, text: [label, e.name, e.id, e.placeholder, e.getAttribute("aria-label")].filter(Boolean).join(" ") };
    }),
  );
}

async function launch(headless: boolean): Promise<Browser> {
  for (const channel of process.platform === "win32" ? ["msedge", "chrome"] : ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless });
    } catch {
      /* ese navegador no está instalado: se prueba el siguiente */
    }
  }
  try {
    return await chromium.launch({ headless });
  } catch {
    throw new Error("No encuentro Edge ni Chrome. Instala uno, o ejecuta: npx playwright install chromium");
  }
}

let browser: Browser | null = null;

export async function autofill(url: string, who: Applicant, opts: { headless?: boolean } = {}): Promise<AutofillReport & { page: Page }> {
  if (!/^https?:\/\//i.test(url)) throw new Error("La oferta no tiene un enlace web que abrir");
  if (!browser || !browser.isConnected()) browser = await launch(!!opts.headless);
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});

  const values: Record<Exclude<FieldKind, "cv">, string | null> = {
    fullName: who.name,
    firstName: who.name?.split(/\s+/)[0] ?? null,
    lastName: who.name?.split(/\s+/).slice(1).join(" ") || null,
    email: who.email,
    coverLetter: who.coverLetter,
  };
  const cv = who.cvPath && (await access(who.cvPath).then(() => who.cvPath, () => null));

  const found = [];
  for (const frame of page.frames()) {
    for (const f of await describeFields(frame).catch(() => [])) found.push({ frame, f, kind: classifyField(f) });
  }
  // Un «Nombre» suelto, sin campo de apellidos al lado, recibe el nombre completo.
  if (!found.some((x) => x.kind === "lastName")) {
    for (const x of found) if (x.kind === "firstName") x.kind = "fullName";
  }

  const filled = new Set<FieldKind>();
  const fields = found.length;
  for (const { frame, f, kind } of found) {
    if (!kind || !f.visible || (filled.has(kind) && kind !== "email")) continue;
    const el = frame.locator(`[data-jsa-field="${f.index}"]`);
    try {
      if (kind === "cv") {
        if (!cv) continue;
        await el.setInputFiles(cv);
      } else {
        const value = values[kind];
        if (!value || !f.empty) continue;
        await el.fill(value);
      }
      filled.add(kind);
    } catch {
      /* un campo que no se deja rellenar no impide los demás */
    }
  }

  const missing: string[] = [];
  if (!who.name) missing.push("tu nombre (ponlo en «Cuentas y CV»)");
  if (!who.email) missing.push("tu email (conecta tu cuenta en «Cuentas y CV»)");
  if (!cv) missing.push("el CV de este perfil (súbelo en «Cuentas y CV»)");
  const note = fields === 0
    ? "No hay formulario en esta página: suele aparecer tras pulsar «Inscribirme» o «Apply». Hazlo en la ventana abierta y rellénalo a mano."
    : "Revisa la página: teléfono y preguntas propias de la empresa se rellenan a mano. El envío lo haces tú.";
  return { url, filled: [...filled], missing, note, page };
}

export async function closeAutofillBrowser() {
  await browser?.close().catch(() => {});
  browser = null;
}
