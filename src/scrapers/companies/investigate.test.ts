import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "jsa-inv-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.COMPANY_MIN_DELAY_MS = "0";
const { prisma } = await import("../../db/client.js");
const { investigateCompany, normalizeWebsite, InvestigateError } = await import("./investigate.js");

const pages: Record<string, string> = {
  "/": `<html><title>Academia Test</title><nav><a href="/contacto">Contacto</a> <a href="/trabaja-con-nosotros">Trabaja con nosotros</a></nav></html>`,
  "/trabaja-con-nosotros": `<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Profesor de guitarra","description":"<p>Clases para niños</p>","identifier":{"value":"G-1"},"jobLocation":{"address":{"addressLocality":"Tres Cantos"}}}</script></head>
    <body><p>¿Quieres trabajar con nosotros? Envía tu currículum a rrhh@academia-test.es</p></body></html>`,
};
let server: Server;
let site = "";

before(async () => {
  execSync("npx prisma migrate deploy", { stdio: "ignore" });
  for (const slug of ["web_designer", "extracurricular_teacher", "sales"]) {
    await prisma.profile.create({ data: { slug, name: slug, description: "d", tone: "t", cvPath: `cvs/${slug}.pdf` } });
  }
  server = createServer((req, res) => {
    const body = pages[req.url ?? ""];
    res.writeHead(body ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" }).end(body ?? "no");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test("normaliza la web y rechaza direcciones no públicas o inválidas", () => {
  assert.deepEqual(normalizeWebsite("empresa.com"), { origin: "https://empresa.com", careersUrl: null });
  assert.equal(normalizeWebsite("https://empresa.com/careers?x=1").careersUrl, "https://empresa.com/careers?x=1");
  for (const bad of ["localhost", "http://127.0.0.1:3001", "http://192.168.1.5", "http://10.0.0.1/x", "ftp://empresa.com", "sin punto", "http://[::1]/"]) {
    assert.throws(() => normalizeWebsite(bad), InvestigateError, bad);
  }
});

test("investiga una empresa: página de empleo, oferta, email y borrador", async () => {
  const r = await investigateCompany({ name: "Academia Test", website: site }, { allowPrivateHosts: true });
  assert.equal(r.report.method, "json-ld");
  assert.equal(r.report.found, 1);
  assert.equal(r.report.created, 1);
  assert.equal(r.report.careersUrl, `${site}/trabaja-con-nosotros`);
  assert.equal(r.drafted, 1);
  assert.equal(r.email?.address, "rrhh@academia-test.es");
  assert.equal(r.email?.confidence, "alta");
  assert.equal(r.spontaneous, null);
  const app = await prisma.application.findFirstOrThrow({ include: { profile: true, jobPosting: true } });
  assert.equal(app.profile.slug, "extracurricular_teacher");
  assert.equal(app.jobPosting.companyName, "Academia Test");
});

test("con perfil elegido crea la candidatura espontánea una sola vez y no duplica la empresa", async () => {
  const again = await investigateCompany({ name: "Academia Test", website: site, profileSlug: "extracurricular_teacher" }, { allowPrivateHosts: true });
  assert.equal(again.spontaneous, "created");
  assert.equal(again.report.created, 0); // la oferta ya estaba guardada
  const third = await investigateCompany({ name: "Academia Test", website: site, profileSlug: "extracurricular_teacher" }, { allowPrivateHosts: true });
  assert.equal(third.spontaneous, "existing");
  assert.equal(await prisma.company.count(), 1);
  const sp = await prisma.application.findFirstOrThrow({ where: { jobPosting: { externalId: { startsWith: "spontaneous:" } } }, include: { jobPosting: true } });
  assert.equal(sp.jobPosting.contactEmail, "rrhh@academia-test.es");
  assert.equal(sp.method, "email");
});

test("una web sin email avisa en lugar de inventar una candidatura", async () => {
  await prisma.company.deleteMany(); // empresa nueva, con una web que SÍ carga pero no tiene contacto
  pages["/"] = "<html><p>Web de prueba sin datos de contacto</p></html>";
  const r = await investigateCompany({ name: "Otra", website: site, profileSlug: "sales" }, { allowPrivateHosts: true });
  assert.equal(r.report.method, "none");
  assert.notEqual(r.report.method, "error"); // la web cargó: la ausencia de email es real, no un fallo de red
  assert.equal(r.email, null);
  assert.equal(r.spontaneous, "no-email");
  await assert.rejects(investigateCompany({ name: "X", website: site, profileSlug: "no_existe" }, { allowPrivateHosts: true }), /Perfil no encontrado/);
});

test("una empresa ya guardada con otra web (otro subdominio) se reconoce por su nombre y no se duplica", async () => {
  await prisma.company.deleteMany();
  const existing = await prisma.company.create({ data: { name: "Zeta Corp", website: "https://www.zetacorp.example.com" } });
  const r = await investigateCompany({ name: "Zeta Corp", website: site }, { allowPrivateHosts: true });
  assert.equal(r.companyId, existing.id);
  assert.equal(await prisma.company.count(), 1);
});
