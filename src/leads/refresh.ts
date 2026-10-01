import { prisma } from "../db/client.js";
import { processNewPostings } from "../matching/process.js";
import { SOURCES, findSource, getCredentials, type SourceDef } from "./sources.js";

export interface SourceRunStatus {
  key: string;
  label: string;
  state: "pendiente" | "buscando" | "ok" | "error" | "sin-claves";
  found?: number;
  created?: number;
  note?: string;
}

export interface RefreshStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  sources: SourceRunStatus[];
  /** Candidaturas creadas al clasificar lo nuevo. */
  drafted: number | null;
  error: string | null;
}

let status: RefreshStatus = { running: false, startedAt: null, finishedAt: null, sources: [], drafted: null, error: null };
export const refreshStatus = (): RefreshStatus => structuredClone(status);

/** Las claves nunca deben acabar en un mensaje de error (las URL de algunas APIs las llevan). */
export function redact(text: string, creds: Record<string, string> | null): string {
  let out = text;
  for (const v of Object.values(creds ?? {})) if (v && v.length >= 4) out = out.split(v).join("***");
  return out;
}

/** Estado guardado de cada fuente (interruptor y última búsqueda), con los valores por defecto. */
export async function sourceRows(defs: SourceDef[] = SOURCES) {
  const rows = new Map((await prisma.leadSource.findMany()).map((r) => [r.key, r]));
  return Promise.all(
    defs.map(async (d) => {
      const row = rows.get(d.key);
      return {
        key: d.key,
        label: d.label,
        description: d.description,
        signupUrl: d.signupUrl ?? null,
        fields: d.fields.map((f) => ({ name: f.name, label: f.label })),
        enabled: row?.enabled ?? d.defaultEnabled,
        configured: !!(await getCredentials(d)),
        lastRunAt: row?.lastRunAt ?? null,
        lastFound: row?.lastFound ?? null,
        lastCreated: row?.lastCreated ?? null,
        lastError: row?.lastError ?? null,
      };
    }),
  );
}

export async function setSourceEnabled(key: string, enabled: boolean) {
  if (!findSource(key)) throw new Error("Fuente desconocida");
  await prisma.leadSource.upsert({ where: { key }, update: { enabled }, create: { key, enabled } });
}

/**
 * Busca leads en las fuentes ENCENDIDAS, una tras otra, y clasifica lo nuevo. Solo una
 * búsqueda a la vez: si ya hay una en marcha devuelve false. `defs` es para las pruebas.
 */
export async function refreshLeads(defs: SourceDef[] = SOURCES): Promise<boolean> {
  if (status.running) return false;
  const active = (await sourceRows(defs)).filter((s) => s.enabled);
  status = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    drafted: null,
    error: null,
    sources: active.map((s) => ({ key: s.key, label: s.label, state: "pendiente" })),
  };
  try {
    for (const entry of status.sources) {
      const def = defs.find((d) => d.key === entry.key)!;
      const creds = await getCredentials(def);
      if (!creds) {
        Object.assign(entry, { state: "sin-claves", note: "Faltan las claves de acceso" });
        continue;
      }
      entry.state = "buscando";
      let data: { lastFound: number | null; lastCreated: number | null; lastError: string | null };
      try {
        const r = await def.run(creds);
        Object.assign(entry, { state: "ok", found: r.found, created: r.created, note: r.note && redact(r.note, creds) });
        data = { lastFound: r.found, lastCreated: r.created, lastError: null };
      } catch (e) {
        const note = redact(e instanceof Error ? e.message : String(e), creds);
        Object.assign(entry, { state: "error", note });
        data = { lastFound: null, lastCreated: null, lastError: note };
      }
      const row = { lastRunAt: new Date(), ...data };
      await prisma.leadSource.upsert({ where: { key: def.key }, update: row, create: { key: def.key, enabled: true, ...row } });
    }
    status.drafted = (await processNewPostings()).drafted;
  } catch (e) {
    status.error = e instanceof Error ? e.message : String(e);
  } finally {
    status.running = false;
    status.finishedAt = new Date().toISOString();
  }
  return true;
}
