import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { getSetting, setSetting } from "../db/settings.js";
import { CV_DIR, SendError, cvFile, sendApplication } from "../mail/applicationMail.js";
import { verifySmtp } from "../mail/send.js";
import { getSmtp, publicSmtp, removeSmtp, saveSmtp } from "../secrets/accounts.js";

const app = new Hono();

// Solo se acepta tráfico local: evita que otra web abierta en tu navegador
// (DNS rebinding / CSRF) o un equipo de tu red toque tus candidaturas.
const LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
const isLocalOrigin = (origin: string) => {
  try {
    return LOCAL.test(new URL(origin).host);
  } catch {
    return false;
  }
};
app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  if (!LOCAL.test(c.req.header("host") ?? "") || (origin && !isLocalOrigin(origin))) {
    return c.text("Forbidden", 403);
  }
  await next();
});

const include = {
  profile: true,
  jobPosting: { include: { company: true } },
} as const;

app.get("/api/applications", async (c) => {
  const applications = await prisma.application.findMany({
    include,
    orderBy: [{ jobPosting: { matchScore: "desc" } }, { createdAt: "desc" }],
  });
  return c.json(applications);
});

const patchSchema = z.object({
  draftSubject: z.string().nullable().optional(),
  draftContent: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  status: z
    .enum(["pendiente_revision", "enviada", "rechazada", "entrevista"])
    .optional(),
});

app.patch("/api/applications/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = patchSchema.safeParse(await c.req.json());
  if (!Number.isInteger(id) || !parsed.success) {
    return c.json({ error: "Datos no válidos" }, 400);
  }
  const { status, ...rest } = parsed.data;
  try {
    const updated = await prisma.application.update({
      where: { id },
      data: {
        ...rest,
        ...(status && {
          status,
          sentAt: status === "enviada" ? new Date() : null,
        }),
      },
      include,
    });
    return c.json(updated);
  } catch {
    return c.json({ error: "Candidatura no encontrada" }, 404);
  }
});

// ---------- Cuentas (los secretos van al llavero y nunca se devuelven) ----------
const smtpSchema = z.object({
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().trim().min(1),
  pass: z.string().optional(), // vacío = conservar la guardada
  from: z.string().trim().email().optional().or(z.literal("")),
});

app.get("/api/accounts", async (c) => c.json({ smtp: await publicSmtp() }));

app.put("/api/accounts/smtp", async (c) => {
  const parsed = smtpSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Revisa host, puerto y usuario" }, 400);
  const { pass, from, ...rest } = parsed.data;
  const password = pass || (await getSmtp())?.pass;
  if (!password) return c.json({ error: "Falta la contraseña" }, 400);
  await saveSmtp({ ...rest, pass: password, ...(from && { from }) });
  return c.json(await publicSmtp());
});

app.post("/api/accounts/smtp/test", async (c) => {
  const smtp = await getSmtp();
  if (!smtp) return c.json({ error: "Aún no has conectado ningún email" }, 400);
  try {
    await verifySmtp(smtp);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "No se pudo conectar" }, 502);
  }
});

app.delete("/api/accounts/smtp", async (c) => {
  await removeSmtp();
  return c.json(await publicSmtp());
});

// ---------- Ajustes y CV ----------
app.get("/api/settings", async (c) => c.json({ applicantName: (await getSetting("applicantName")) ?? "" }));

app.put("/api/settings", async (c) => {
  const parsed = z.object({ applicantName: z.string().trim().max(100) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos no válidos" }, 400);
  await setSetting("applicantName", parsed.data.applicantName);
  return c.json(parsed.data);
});

app.get("/api/profiles", async (c) => {
  const profiles = await prisma.profile.findMany({ orderBy: { id: "asc" } });
  return c.json(
    await Promise.all(
      profiles.map(async (p) => {
        const info = await stat(cvFile(p.cvPath)).catch(() => null);
        return { slug: p.slug, name: p.name, hasCv: !!info, cvBytes: info?.size ?? 0 };
      }),
    ),
  );
});

const MAX_CV = 10 * 1024 * 1024;
app.put("/api/profiles/:slug/cv", bodyLimit({ maxSize: MAX_CV + 64 * 1024, onError: (c) => c.json({ error: "El CV pesa más de 10 MB" }, 413) }), async (c) => {
  const profile = await prisma.profile.findUnique({ where: { slug: c.req.param("slug") } });
  if (!profile) return c.json({ error: "Perfil no encontrado" }, 404);
  const file = (await c.req.parseBody())["file"];
  if (!(file instanceof File)) return c.json({ error: "Falta el archivo" }, 400);
  if (file.size > MAX_CV) return c.json({ error: "El CV pesa más de 10 MB" }, 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return c.json({ error: "El archivo no es un PDF" }, 400);
  await mkdir(CV_DIR, { recursive: true });
  const target = path.join(CV_DIR, `${profile.slug}.pdf`); // el nombre lo decide el servidor, no el cliente
  await writeFile(target, bytes);
  await prisma.profile.update({ where: { id: profile.id }, data: { cvPath: `cvs/${profile.slug}.pdf` } });
  return c.json({ slug: profile.slug, hasCv: true, cvBytes: bytes.length });
});

// ---------- Envío (solo con clic explícito del usuario) ----------
app.post("/api/applications/:id/send", async (c) => {
  const body = z.object({ to: z.string() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Falta el destinatario" }, 400);
  try {
    return c.json(await sendApplication(Number(c.req.param("id")), body.data.to));
  } catch (e) {
    if (e instanceof SendError) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () =>
  console.log(`API en http://127.0.0.1:${port} (solo local)`),
);
