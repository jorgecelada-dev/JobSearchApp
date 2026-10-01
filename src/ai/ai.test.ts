import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

// BD y almacén de secretos de prueba; la IA real nunca se llama (no gasta dinero).
const dir = mkdtempSync(path.join(tmpdir(), "jsa-ai-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.KEYCHAIN_SERVICE = "jobsearchapp-test";
delete process.env.ANTHROPIC_API_KEY;

const { prisma } = await import("../db/client.js");
const { processNewPostings } = await import("../matching/process.js");
const { classifyWithAi, setAiEnabled } = await import("./classify.js");

before(async () => {
  execSync("npx prisma migrate deploy", { stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { stdio: "ignore", env: process.env });
});
after(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
const posting = (title: string, description?: string) =>
  prisma.jobPosting.create({ data: { source: "adzuna", externalId: String(++n), title, description, url: `https://x.es/${n}` } });

test("sin clave de API la IA no se usa", async () => {
  await setAiEnabled(true);
  assert.equal(await classifyWithAi({ title: "Diseñador" }, [{ slug: "web_designer", name: "Diseño", description: "" }]), null);
});

test("solo pregunta a la IA por las dudosas y respeta su veredicto", async () => {
  const clara = await posting("Diseñador gráfico web", "Maquetación, Figma, Photoshop e identidad visual");
  const dudosa = await posting("Se busca persona creativa", "Carteles y redes para un gimnasio");
  const ajena = await posting("Conductor de reparto", "Carnet C");
  const caida = await posting("Educador/a", "Buscamos profesor para tardes"); // 50 puntos: dudosa

  const asked: string[] = [];
  const r = await processNewPostings(40, async (job) => {
    asked.push(job.title);
    if (job.title === "Se busca persona creativa") return { slug: "web_designer", score: 82, reason: "Pide diseño de carteles" };
    if (job.title === "Conductor de reparto") return { slug: null, score: 5, reason: "No encaja" };
    return null; // la IA falló: decide el clasificador por palabras clave
  });

  assert.ok(!asked.includes("Diseñador gráfico web"));
  assert.ok(asked.includes("Educador/a"));
  assert.equal(r.askedAi, 2); // la que falló no cuenta

  const app = (id: number) => prisma.application.findUnique({ where: { jobPostingId: id }, include: { profile: true } });
  assert.equal((await app(clara.id))?.profile.slug, "web_designer");
  const d = await app(dudosa.id);
  assert.equal(d?.profile.slug, "web_designer");
  assert.equal(d?.notes, "IA: Pide diseño de carteles");
  assert.equal(await app(ajena.id), null);
  assert.equal((await app(caida.id))?.profile.slug, "extracurricular_teacher"); // por palabras clave
});
