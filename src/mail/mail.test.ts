import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { SMTPServer } from "smtp-server";

// BD y llavero de prueba: no tocan tus datos ni tus secretos.
const dir = mkdtempSync(path.join(tmpdir(), "jsa-mail-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.KEYCHAIN_SERVICE = "jobsearchapp-test";

const { prisma } = await import("../db/client.js");
const { sendApplication, SendError, CV_DIR } = await import("./applicationMail.js");
const { saveSmtp, removeSmtp } = await import("../secrets/accounts.js");
const { setSetting } = await import("../db/settings.js");

const received: { to: string[]; raw: string }[] = [];
const server = new SMTPServer({
  authOptional: true,
  allowInsecureAuth: true,
  disabledCommands: ["STARTTLS"],
  onAuth: (_auth, _s, cb) => cb(null, { user: 1 }),
  onData(stream, session, cb) {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => {
      received.push({ to: session.envelope.rcptTo.map((r) => r.address), raw: Buffer.concat(chunks).toString("utf8") });
      cb();
    });
  },
});
const cvPath = path.join(CV_DIR, "__test_cv.pdf");
let port = 0;

before(async () => {
  execSync("npx prisma migrate deploy", { stdio: "ignore" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.server.address() as AddressInfo).port;
  writeFileSync(cvPath, "%PDF-1.4 contenido de prueba");
  await saveSmtp({ host: "127.0.0.1", port, user: "yo@ejemplo.com", pass: "x" });
  await setSetting("applicantName", "Jorge Prueba");
});

after(async () => {
  await removeSmtp();
  server.close();
  rmSync(cvPath, { force: true });
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
async function makeApp(over: { title?: string; draft?: string; method?: "email" | "autofill"; cv?: string } = {}) {
  n++;
  const profile = await prisma.profile.upsert({
    where: { slug: "sales" },
    update: { cvPath: over.cv ?? "cvs/__test_cv.pdf" },
    create: { slug: "sales", name: "Ventas", description: "d", tone: "t", cvPath: over.cv ?? "cvs/__test_cv.pdf" },
  });
  const job = await prisma.jobPosting.create({
    data: { source: "infojobs", externalId: `t${n}`, title: over.title ?? "Dependiente", url: "https://x.test/" + n },
  });
  return prisma.application.create({
    data: { jobPostingId: job.id, profileId: profile.id, method: over.method ?? "email", draftContent: over.draft ?? "Hola,\n\nQuiero el puesto.\n\nUn saludo,\nJorge Prueba", draftSubject: "Candidatura: Dependiente" },
  });
}
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => e instanceof SendError && re.test(e.message));

test("envía el email con asunto, cuerpo y CV adjunto, y marca la candidatura", async () => {
  const app = await makeApp();
  const done = await sendApplication(app.id, "rrhh@empresa.es");
  assert.equal(done.status, "enviada");
  assert.ok(done.sentAt);
  assert.equal(done.jobPosting.contactEmail, "rrhh@empresa.es");
  const mail = received.at(-1)!;
  assert.deepEqual(mail.to, ["rrhh@empresa.es"]);
  assert.match(mail.raw, /Subject: Candidatura: Dependiente/);
  assert.match(mail.raw, /From: "?Jorge Prueba"? <yo@ejemplo.com>/);
  assert.match(mail.raw, /Quiero el puesto/);
  assert.match(mail.raw, /filename="?CV Jorge Prueba\.pdf"?/);
  assert.match(mail.raw, new RegExp(Buffer.from("%PDF-1.4 contenido").toString("base64").slice(0, 16)));
});

test("no se envía dos veces la misma candidatura", async () => {
  const app = await makeApp();
  const before = received.length;
  await sendApplication(app.id, "a@b.es");
  await rejects(sendApplication(app.id, "a@b.es"), /ya no está pendiente/);
  assert.equal(received.length, before + 1);
});

test("dos clics simultáneos envían un solo correo", async () => {
  const app = await makeApp();
  const before = received.length;
  const results = await Promise.allSettled([sendApplication(app.id, "a@b.es"), sendApplication(app.id, "a@b.es")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(received.length, before + 1);
});

test("rechaza destinatario inválido, demo, firma sin rellenar y formulario", async () => {
  await rejects(sendApplication((await makeApp()).id, "no-es-un-email"), /no es un email válido/);
  await rejects(sendApplication((await makeApp({ title: "[DEMO] Algo" })).id, "a@b.es"), /demostración/);
  await rejects(sendApplication((await makeApp({ draft: "Un saludo,\n[Tu nombre]" })).id, "a@b.es"), /Falta tu nombre/);
  await rejects(sendApplication((await makeApp({ method: "autofill" })).id, "a@b.es"), /formulario/);
  await rejects(sendApplication(999999, "a@b.es"), /no encontrada/);
});

test("rechaza un CV inexistente o fuera de cvs/, sin marcar la candidatura como enviada", async () => {
  const missing = await makeApp({ cv: "cvs/no_existe.pdf" });
  await rejects(sendApplication(missing.id, "a@b.es"), /Falta el CV/);
  const evil = await makeApp({ cv: "../.env" });
  await rejects(sendApplication(evil.id, "a@b.es"), /Ruta de CV no válida/);
  for (const a of [missing, evil]) assert.equal((await prisma.application.findUniqueOrThrow({ where: { id: a.id } })).status, "pendiente_revision");
});

test("si el SMTP falla, la candidatura vuelve a pendiente", async () => {
  await saveSmtp({ host: "127.0.0.1", port: 1, user: "yo@ejemplo.com", pass: "x" }); // puerto cerrado
  const app = await makeApp();
  await rejects(sendApplication(app.id, "a@b.es"), /No se pudo enviar/);
  const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
  assert.equal(after.status, "pendiente_revision");
  assert.equal(after.sentAt, null);
  await saveSmtp({ host: "127.0.0.1", port, user: "yo@ejemplo.com", pass: "x" });
});

test("sin cuenta de email conectada avisa antes de tocar nada", async () => {
  await removeSmtp();
  const app = await makeApp();
  await rejects(sendApplication(app.id, "a@b.es"), /Conecta tu email/);
  assert.equal((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status, "pendiente_revision");
});
