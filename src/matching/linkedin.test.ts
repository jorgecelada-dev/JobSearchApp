import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { linkedinSearches, linkedinSearchUrl, parseLinkedInJobUrl } from "./linkedin.js";

const dir = mkdtempSync(path.join(tmpdir(), "jsa-li-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
const { prisma } = await import("../db/client.js");
const { addManualLinkedInOffer, ManualOfferError } = await import("./manualOffer.js");

before(async () => {
  execSync("npx prisma migrate deploy", { stdio: "ignore" });
  for (const slug of ["web_designer", "extracurricular_teacher", "sales"]) {
    await prisma.profile.create({ data: { slug, name: slug, description: "d", tone: "t", cvPath: `cvs/${slug}.pdf` } });
  }
});
after(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test("enlace de búsqueda: palabras, zona y filtro de fecha bien codificados", () => {
  const u = new URL(linkedinSearchUrl("diseñador gráfico", "Tres Cantos, España", 24));
  assert.equal(u.origin + u.pathname, "https://www.linkedin.com/jobs/search/");
  assert.equal(u.searchParams.get("keywords"), "diseñador gráfico");
  assert.equal(u.searchParams.get("location"), "Tres Cantos, España");
  assert.equal(u.searchParams.get("f_TPR"), "r86400");
  assert.equal(new URL(linkedinSearchUrl("x", "y", 168)).searchParams.get("f_TPR"), "r604800");
  assert.equal(new URL(linkedinSearchUrl("x", "y", 0)).searchParams.has("f_TPR"), false);
  assert.equal(linkedinSearches("Madrid").length, 3);
});

test("solo acepta enlaces de oferta de LinkedIn y los limpia de rastreadores", () => {
  const ok = parseLinkedInJobUrl("https://es.linkedin.com/jobs/view/disenador-grafico-at-acme-3912345678?trackingId=abc&refId=xyz");
  assert.deepEqual(ok, { url: "https://www.linkedin.com/jobs/view/3912345678/", externalId: "3912345678" });
  assert.equal(parseLinkedInJobUrl("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3999999999")?.externalId, "3999999999");
  assert.equal(parseLinkedInJobUrl("https://evil.com/jobs/view/3912345678"), null);
  assert.equal(parseLinkedInJobUrl("https://linkedin.com.evil.com/jobs/view/3912345678"), null);
  assert.equal(parseLinkedInJobUrl("https://www.linkedin.com/in/alguien"), null);
  assert.equal(parseLinkedInJobUrl("javascript:alert(1)"), null);
  assert.equal(parseLinkedInJobUrl("no es url"), null);
});

const base = { url: "https://www.linkedin.com/jobs/view/3912345678/", title: "Diseñador/a gráfico", company: "Acme", description: "Maquetación y Figma" };

test("añade la oferta: perfil automático, método manual, borrador sin CV adjunto", async () => {
  const app = await addManualLinkedInOffer(base);
  assert.equal(app.method, "manual");
  assert.equal(app.status, "pendiente_revision");
  assert.equal(app.profile.slug, "web_designer");
  assert.equal(app.jobPosting.source, "linkedin_manual");
  assert.equal(app.jobPosting.url, "https://www.linkedin.com/jobs/view/3912345678/");
  assert.match(app.draftContent, /Estimado equipo de Acme/);
  assert.doesNotMatch(app.draftContent, /Adjunto mi CV/);
});

test("rechaza duplicados, enlaces ajenos y títulos sin perfil claro; permite elegir perfil a mano", async () => {
  await assert.rejects(addManualLinkedInOffer(base), (e: Error) => e instanceof ManualOfferError && e.status === 409);
  await assert.rejects(addManualLinkedInOffer({ ...base, url: "https://evil.com/jobs/view/1234567" }), /enlace debe ser/);
  const odd = { ...base, url: "https://www.linkedin.com/jobs/view/4000000001/", title: "Gestor de operaciones", description: "" };
  await assert.rejects(addManualLinkedInOffer(odd), /elige uno en el desplegable/);
  const app = await addManualLinkedInOffer({ ...odd, profileSlug: "sales" });
  assert.equal(app.profile.slug, "sales");
  await assert.rejects(addManualLinkedInOffer({ ...odd, url: "https://www.linkedin.com/jobs/view/4000000002/", profileSlug: "no_existe" }), /Perfil no encontrado/);
});
