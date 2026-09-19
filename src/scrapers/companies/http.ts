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

export const fetchText = async (url: string) => (await politeFetch(url)).text();
export const fetchJson = async <T>(url: string) =>
  (await politeFetch(url, { headers: { Accept: "application/json" } })).json() as Promise<T>;
