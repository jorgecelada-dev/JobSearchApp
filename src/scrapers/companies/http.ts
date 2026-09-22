export class HttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} en ${url}`);
  }
}

const lastHit = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch educado: identifica la app, tiene timeout y espera un mínimo entre
 * peticiones al mismo host para no saturar servidores pequeños.
 */
export async function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const minDelay = Number(process.env.COMPANY_MIN_DELAY_MS ?? 2000);
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + minDelay - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());

  const res = await fetch(url, {
    ...init,
    redirect: "follow",
    signal: init.signal ?? AbortSignal.timeout(15_000),
    headers: { "User-Agent": "JobSearchApp/1.0 (busqueda de empleo personal)", ...init.headers },
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res;
}

/** Solo páginas de texto: un PDF o una imagen leídos como texto producen basura (falsos emails, etc.). */
export async function fetchText(url: string): Promise<string> {
  const res = await politeFetch(url);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type && !/^text\/|xml|json/.test(type)) throw new Error(`No es una página web (${type}): ${url}`);
  return res.text();
}
export const fetchJson = async <T>(url: string) =>
  (await politeFetch(url, { headers: { Accept: "application/json" } })).json() as Promise<T>;
