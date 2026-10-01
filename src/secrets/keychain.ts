import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const service = () => process.env.KEYCHAIN_SERVICE ?? "jobsearchapp";

// Base64: el llavero devuelve en hexadecimal los valores con caracteres no ASCII (ñ, tildes),
// y un valor que empiece por "-" se confundiría con una opción. En base64 nada de eso ocurre.
const encode = (v: string) => Buffer.from(v, "utf8").toString("base64");
const decode = (v: string) => Buffer.from(v, "base64").toString("utf8");

function assertSupported() {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    throw new Error("El almacén de secretos usa el llavero de macOS o el cifrado de Windows; en otros sistemas aún no está soportado.");
  }
}

// ---------- Windows: DPAPI ----------
// El secreto se cifra con tu usuario de Windows (DPAPI, lo mismo que usan Chrome o Edge para
// tus contraseñas) y se guarda en %APPDATA%\<servicio>\. Otro usuario del PC, o el archivo
// copiado a otro equipo, no puede descifrarlo. Nunca va a .env, a la BD ni a git.
// El valor viaja por stdin, no como argumento: no aparece en la lista de procesos.
const winDir = () => path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), service());
const winFile = (account: string) => {
  if (!/^[a-z0-9_-]+$/i.test(account)) throw new Error(`Nombre de secreto no válido: ${account}`);
  return path.join(winDir(), `${account}.dpapi`);
};

async function dpapi(op: "Protect" | "Unprotect", input: string): Promise<string> {
  const script =
    "Add-Type -AssemblyName System.Security;" +
    "$in = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());" +
    `$out = [Security.Cryptography.ProtectedData]::${op}($in, $null, 'CurrentUser');` +
    "[Console]::Out.Write([Convert]::ToBase64String($out))";
  const child = execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
  const result = new Promise<string>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout!.on("data", (d) => (stdout += d));
    child.stderr!.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout.trim()) : reject(new Error(`No se pudo ${op === "Protect" ? "cifrar" : "descifrar"} el secreto: ${stderr.trim()}`))));
  });
  child.stdin!.end(input);
  return result;
}

/**
 * Secretos en el almacén del sistema: llavero de macOS, o cifrado DPAPI en Windows.
 * Limitación en Mac: `security` recibe el valor como argumento, que otro usuario del mismo
 * Mac podría ver en `ps` durante unos milisegundos. En un Mac personal no es un riesgo real.
 */
export async function setSecret(account: string, value: string): Promise<void> {
  assertSupported();
  if (process.platform === "win32") {
    await mkdir(winDir(), { recursive: true });
    await writeFile(winFile(account), await dpapi("Protect", encode(value)));
    return;
  }
  await run("security", ["add-generic-password", "-a", account, "-s", service(), "-w", encode(value), "-U"]);
}

export async function getSecret(account: string): Promise<string | null> {
  assertSupported();
  if (process.platform === "win32") {
    let stored: string;
    try {
      stored = await readFile(winFile(account), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
    return decode(await dpapi("Unprotect", stored));
  }
  try {
    const { stdout } = await run("security", ["find-generic-password", "-a", account, "-s", service(), "-w"]);
    return decode(stdout.replace(/\n$/, ""));
  } catch (e) {
    if ((e as { code?: number }).code === 44) return null; // item no encontrado
    throw e;
  }
}

export async function deleteSecret(account: string): Promise<void> {
  assertSupported();
  if (process.platform === "win32") {
    await rm(winFile(account), { force: true });
    return;
  }
  try {
    await run("security", ["delete-generic-password", "-a", account, "-s", service()]);
  } catch (e) {
    if ((e as { code?: number }).code !== 44) throw e;
  }
}
