import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const service = () => process.env.KEYCHAIN_SERVICE ?? "jobsearchapp";

// Base64: el llavero devuelve en hexadecimal los valores con caracteres no ASCII (ñ, tildes),
// y un valor que empiece por "-" se confundiría con una opción. En base64 nada de eso ocurre.
const encode = (v: string) => Buffer.from(v, "utf8").toString("base64");
const decode = (v: string) => Buffer.from(v, "base64").toString("utf8");

function assertMac() {
  if (process.platform !== "darwin") {
    throw new Error("El almacén de secretos usa el llavero de macOS; en otros sistemas aún no está soportado.");
  }
}

/**
 * Secretos en el llavero de macOS (cifrado por el sistema, no en .env ni en la BD).
 * Limitación: `security` recibe el valor como argumento, que otro usuario del mismo
 * Mac podría ver en `ps` durante unos milisegundos. En un Mac personal no es un riesgo real.
 */
export async function setSecret(account: string, value: string): Promise<void> {
  assertMac();
  await run("security", ["add-generic-password", "-a", account, "-s", service(), "-w", encode(value), "-U"]);
}

export async function getSecret(account: string): Promise<string | null> {
  assertMac();
  try {
    const { stdout } = await run("security", ["find-generic-password", "-a", account, "-s", service(), "-w"]);
    return decode(stdout.replace(/\n$/, ""));
  } catch (e) {
    if ((e as { code?: number }).code === 44) return null; // item no encontrado
    throw e;
  }
}

export async function deleteSecret(account: string): Promise<void> {
  assertMac();
  try {
    await run("security", ["delete-generic-password", "-a", account, "-s", service()]);
  } catch (e) {
    if ((e as { code?: number }).code !== 44) throw e;
  }
}
