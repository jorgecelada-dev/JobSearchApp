import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

// BD y almacén de secretos de prueba: no tocan tus datos ni tus claves.
const dir = mkdtempSync(path.join(tmpdir(), "jsa-leads-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.KEYCHAIN_SERVICE = "jobsearchapp-test";

const { prisma } = await import("../db/client.js");
const { mapAdzuna, mapInfoJobs, mapJooble } = await import("../scrapers/portals/apis.js");
const { savePortalJobs, uniqueJobs } = await import("../scrapers/portals/portals.js");
const { redact, refreshLeads, refreshStatus, setSourceEnabled, sourceRows } = await import("./refresh.js");
const { forgetCredentials, getCredentials, saveCredentials } = await import("./sources.js");
type SourceDef = import("./sources.js").SourceDef;

before(() => {
  execSync("npx prisma migrate deploy", { stdio: "ignore" });
});
after(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test("lee las respuestas de InfoJobs, Adzuna y Jooble", () => {
  const ij = mapInfoJobs({ offers: [{ id: "abc", title: "Diseñador web", link: "https://www.infojobs.net/x", city: "Tres Cantos", province: { value: "Madrid" }, author: { name: "Acme" }, published: "2026-09-30T10:00:00Z" }] });
  assert.deepEqual(ij[0], { externalId: "abc", title: "Diseñador web", description: undefined, url: "https://www.infojobs.net/x", location: "Tres Cantos, Madrid", companyName: "Acme", publishedAt: new Date("2026-09-30T10:00:00Z") });

  const az = mapAdzuna({ results: [{ id: 42, title: "<strong>Comercial</strong> ventas", description: "Venta en tienda", redirect_url: "https://adzuna.es/r/42", location: { display_name: "Madrid" }, company: { display_name: "Tienda S.L." }, created: "2026-09-29T08:00:00Z" }] });
  assert.equal(az[0]!.externalId, "42");
  assert.equal(az[0]!.title, "Comercial ventas");
  assert.equal(az[0]!.companyName, "Tienda S.L.");

  const jb = mapJooble({ jobs: [{ id: -77, title: "Profesor particular", snippet: "&nbsp;Clases de <b>matemáticas</b>", link: "https://jooble.org/desc/-77", location: "Madrid", company: "", updated: "no-es-fecha" }] });
  assert.equal(jb[0]!.externalId, "-77");
  assert.equal(jb[0]!.description, "Clases de matemáticas");
  assert.equal(jb[0]!.companyName, undefined);
  assert.equal(jb[0]!.publishedAt, undefined);
  assert.deepEqual(mapJooble({}), []);
});

test("quita repetidas entre búsquedas y no duplica al guardar", async () => {
  const job = { externalId: "1", title: "Diseñador", url: "https://a.es/1" };
  const jobs = uniqueJobs([[job], [job, { externalId: "2", title: "Otro", url: "https://a.es/2" }], [{ externalId: "3", title: "", url: "x" }]]);
  assert.equal(jobs.length, 2);
  assert.equal(await savePortalJobs("adzuna", jobs), 2);
  assert.equal(await savePortalJobs("adzuna", jobs), 0);
  assert.equal(await savePortalJobs("jooble", jobs), 2); // otra fuente, otra oferta
});

test("las claves nunca aparecen en un error", () => {
  assert.equal(redact("HTTP 401 en https://api/?app_id=ID123&app_key=SECRETO", { appId: "ID123", appKey: "SECRETO" }), "HTTP 401 en https://api/?app_id=***&app_key=***");
});

test("claves: se guardan cifradas, se leen y se olvidan", async () => {
  const def = { key: "prueba", fields: [{ name: "apiKey", label: "Clave", env: "JSA_TEST_KEY" }] } as unknown as SourceDef;
  assert.equal(await getCredentials(def), null);
  await assert.rejects(saveCredentials(def, { apiKey: " " }), /Faltan datos/);
  await saveCredentials(def, { apiKey: "  k-1234 " });
  assert.deepEqual(await getCredentials(def), { apiKey: "k-1234" });
  await forgetCredentials(def);
  assert.equal(await getCredentials(def), null);
});

test("solo busca en las fuentes encendidas y guarda el resultado de cada una", async () => {
  const calls: string[] = [];
  const fake = (key: string, run: SourceDef["run"], fields: SourceDef["fields"] = [], defaultEnabled = true): SourceDef =>
    ({ key, label: key, description: "", fields, defaultEnabled, run: async (c) => (calls.push(key), run(c)) });
  const defs = [
    fake("buena", async () => ({ found: 3, created: 2 })),
    fake("apagada", async () => ({ found: 9, created: 9 })),
    fake("rota", async () => { throw new Error("HTTP 500 en https://x/?key=ZZZZ-SECRETA"); }, [{ name: "key", label: "Clave", env: "JSA_TEST_ROTA" }]),
    fake("sinclaves", async () => ({ found: 1, created: 1 }), [{ name: "key", label: "Clave", env: "JSA_TEST_NADA" }]),
  ];
  process.env.JSA_TEST_ROTA = "ZZZZ-SECRETA";
  await setSourceEnabled("companies", true); // las desconocidas se rechazan
  await assert.rejects(setSourceEnabled("apagada", false), /desconocida/);
  await prisma.leadSource.create({ data: { key: "apagada", enabled: false } });

  assert.equal(await refreshLeads(defs), true);
  assert.deepEqual(calls, ["buena", "rota"]);

  const s = refreshStatus();
  assert.equal(s.running, false);
  assert.deepEqual(s.sources.map((x) => [x.key, x.state]), [["buena", "ok"], ["rota", "error"], ["sinclaves", "sin-claves"]]);
  assert.doesNotMatch(JSON.stringify(s), /ZZZZ-SECRETA/);

  const rows = await sourceRows(defs);
  const buena = rows.find((r) => r.key === "buena")!;
  assert.equal(buena.lastFound, 3);
  assert.equal(buena.lastCreated, 2);
  assert.match(rows.find((r) => r.key === "rota")!.lastError ?? "", /\*\*\*/);
  assert.equal(rows.find((r) => r.key === "apagada")!.lastRunAt, null);
});
