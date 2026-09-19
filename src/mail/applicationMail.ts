import path from "node:path";
import { access } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { getSetting } from "../db/settings.js";
import { NAME_PLACEHOLDER } from "../matching/templates.js";
import { getSmtp } from "../secrets/accounts.js";
import { transportFor } from "./send.js";

export class SendError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 502 = 400) {
    super(message);
  }
}

const ROOT = path.resolve(import.meta.dirname, "../..");
export const CV_DIR = path.join(ROOT, "cvs");

/** Ruta absoluta del CV, siempre dentro de cvs/ (nada de `../`). */
export function cvFile(cvPath: string): string {
  const abs = path.resolve(ROOT, cvPath);
  if (!abs.startsWith(CV_DIR + path.sep)) throw new SendError("Ruta de CV no válida");
  return abs;
}

const include = { profile: true, jobPosting: { include: { company: true } } } as const;

/**
 * Envía una candidatura por email con el CV de su perfil. Solo se llama desde el
 * clic explícito del usuario. Marca la candidatura como enviada ANTES de mandar
 * (operación atómica) para que un doble clic no envíe dos veces, y la revierte si falla.
 */
export async function sendApplication(id: number, toRaw: string) {
  const to = z.string().trim().email().safeParse(toRaw);
  if (!to.success) throw new SendError("El destinatario no es un email válido");

  const app = await prisma.application.findUnique({ where: { id }, include });
  if (!app) throw new SendError("Candidatura no encontrada", 404);
  if (app.status !== "pendiente_revision") throw new SendError("Esta candidatura ya no está pendiente", 409);
  if (app.method !== "email") throw new SendError("Es una candidatura de formulario, no de email");
  if (app.jobPosting.title.startsWith("[DEMO]")) throw new SendError("Es una candidatura de demostración: no se envía");
  if (app.draftContent.includes(NAME_PLACEHOLDER)) throw new SendError(`Falta tu nombre en la firma (${NAME_PLACEHOLDER})`);

  const smtp = await getSmtp();
  if (!smtp) throw new SendError("Conecta tu email en «Cuentas y CV» antes de enviar");

  const cv = cvFile(app.profile.cvPath);
  try {
    await access(cv);
  } catch {
    throw new SendError(`Falta el CV del perfil «${app.profile.name}»: súbelo en «Cuentas y CV»`);
  }

  const claimed = await prisma.application.updateMany({
    where: { id, status: "pendiente_revision" },
    data: { status: "enviada", sentAt: new Date() },
  });
  if (claimed.count === 0) throw new SendError("Esta candidatura ya no está pendiente", 409);

  const name = await getSetting("applicantName");
  const fromAddress = smtp.from || smtp.user;
  try {
    await transportFor(smtp).sendMail({
      from: name ? { name, address: fromAddress } : fromAddress,
      to: to.data,
      subject: app.draftSubject || `Candidatura: ${app.jobPosting.title}`,
      text: app.draftContent,
      attachments: [{ filename: `CV ${(name ?? app.profile.name).replace(/[^\p{L}\p{N} ._-]/gu, "")}.pdf`, path: cv }],
    });
  } catch (e) {
    await prisma.application.update({ where: { id }, data: { status: "pendiente_revision", sentAt: null } });
    throw new SendError(`No se pudo enviar: ${e instanceof Error ? e.message : e}`, 502);
  }

  await prisma.jobPosting.update({ where: { id: app.jobPostingId }, data: { contactEmail: to.data } });
  return prisma.application.findUniqueOrThrow({ where: { id }, include });
}
