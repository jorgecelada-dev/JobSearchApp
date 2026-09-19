import { deleteSecret, getSecret, setSecret } from "./keychain.js";

export interface SmtpAccount {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Dirección remitente; por defecto, el usuario. */
  from?: string;
}

/** Lo que el dashboard puede ver: nunca la contraseña. */
export type PublicSmtp = { connected: false } | { connected: true; host: string; port: number; user: string; from?: string };

const SMTP = "smtp";

export async function getSmtp(): Promise<SmtpAccount | null> {
  const raw = await getSecret(SMTP);
  return raw ? (JSON.parse(raw) as SmtpAccount) : null;
}

export const saveSmtp = (a: SmtpAccount) => setSecret(SMTP, JSON.stringify(a));
export const removeSmtp = () => deleteSecret(SMTP);

export async function publicSmtp(): Promise<PublicSmtp> {
  const a = await getSmtp();
  return a ? { connected: true, host: a.host, port: a.port, user: a.user, from: a.from } : { connected: false };
}
