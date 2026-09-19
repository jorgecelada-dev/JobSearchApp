import nodemailer from "nodemailer";
import type { SmtpAccount } from "../secrets/accounts.js";

export const transportFor = (a: SmtpAccount) =>
  nodemailer.createTransport({
    host: a.host,
    port: a.port,
    secure: a.port === 465,
    auth: { user: a.user, pass: a.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

/** Comprueba host, puerto y credenciales SIN enviar ningún correo. */
export async function verifySmtp(a: SmtpAccount): Promise<void> {
  await transportFor(a).verify();
}
