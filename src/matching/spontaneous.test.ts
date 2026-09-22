import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { profileForCategory } from "./categoryProfile.js";

const dir = mkdtempSync(path.join(tmpdir(), "jsa-sp-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
const { prisma } = await import("../db/client.js");
const { createSpontaneousApplications } = await import("./spontaneous.js");

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

test("perfil según la categoría de búsqueda", () => {
  assert.equal(profileForCategory("academia de música"), "extracurricular_teacher");
  assert.equal(profileForCategory("Agencia de diseño"), "web_designer");
  assert.equal(profileForCategory("tienda"), "sales");
  assert.equal(profileForCategory("taller mecánico"), null);
  assert.equal(profileForCategory(null), null);
});

test("crea una candidatura espontánea por empresa fiable, solo una vez, y salta el resto", async () => {
  const mk = (name: string, o: object) => prisma.company.create({ data: { name, website: `https://${name}.es`, zone: "Tres Cantos", ...o } });
  await mk("buena", { category: "academia", contactEmail: "rrhh@buena.es", contactEmailScore: 12, contactEmailNote: "alta: buzón de RR. HH. · https://buena.es/empleo" });
  await mk("dudosa", { category: "academia", contactEmail: "info@dudosa.es", contactEmailScore: 1 });
  await mk("sinemail", { category: "academia" });
  await prisma.company.create({ data: { name: "publico", website: "https://www.educa.madrid.org/cp.x", category: "colegio", contactEmail: "cp.x@educa.madrid.org", contactEmailScore: 12 } });
  await mk("sinperfil", { category: "taller", contactEmail: "rrhh@sinperfil.es", contactEmailScore: 12 });

  const r = await createSpontaneousApplications();
  assert.deepEqual(r, { created: 1, existing: 0, noEmail: 1, lowConfidence: 1, noProfile: 1, publicSector: 1 });

  const app = await prisma.application.findFirstOrThrow({ include: { jobPosting: true, profile: true } });
  assert.equal(app.status, "pendiente_revision");
  assert.equal(app.method, "email");
  assert.equal(app.profile.slug, "extracurricular_teacher");
  assert.equal(app.jobPosting.contactEmail, "rrhh@buena.es");
  assert.equal(app.draftSubject, "Candidatura espontánea");
  assert.match(app.draftContent, /por si en algún momento necesitáis/);
  assert.match(app.draftContent, /Estimado equipo de buena/);
  assert.match(app.notes ?? "", /rrhh@buena\.es.*buzón de RR\. HH\./);

  const again = await createSpontaneousApplications();
  assert.equal(again.created, 0);
  assert.equal(again.existing, 1);
  assert.equal(await prisma.application.count(), 1);
});
