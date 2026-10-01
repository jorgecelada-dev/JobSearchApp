import { getSetting } from "../db/settings.js";
import { allSearchTerms } from "../matching/searchTerms.js";
import { scanAll } from "../scrapers/companies/scan.js";
import { searchAdzuna, searchInfoJobs, searchJooble } from "../scrapers/portals/apis.js";
import { savePortalJobs, uniqueJobs, type PortalJob } from "../scrapers/portals/portals.js";
import { deleteSecret, getSecret, setSecret } from "../secrets/keychain.js";

export interface CredentialField {
  name: string;
  label: string;
  /** Variable del .env que sirve de alternativa (para quien ya la tenía ahí). */
  env: string;
}

export interface RunResult {
  found: number;
  created: number;
  note?: string;
}

export interface SourceDef {
  key: string;
  label: string;
  description: string;
  /** Dónde conseguir las claves, si hacen falta. */
  signupUrl?: string;
  fields: CredentialField[];
  /** Encendida si aún no la has tocado. */
  defaultEnabled: boolean;
  run(creds: Record<string, string>): Promise<RunResult>;
}

export const DEFAULT_LOCATION = "Madrid";
export const searchLocation = async () => (await getSetting("searchLocation"))?.trim() || DEFAULT_LOCATION;

/** Lanza una búsqueda por término y junta lo encontrado. Un término que falla no tumba los demás. */
async function portalRun(
  source: "infojobs" | "adzuna" | "jooble",
  search: (term: string, location: string) => Promise<PortalJob[]>,
): Promise<RunResult> {
  const location = await searchLocation();
  const lists: PortalJob[][] = [];
  const errors: string[] = [];
  for (const term of allSearchTerms()) {
    try {
      lists.push(await search(term, location));
    } catch (e) {
      errors.push(`«${term}»: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!lists.length && errors.length) throw new Error(errors[0]);
  const jobs = uniqueJobs(lists);
  return {
    found: jobs.length,
    created: await savePortalJobs(source, jobs),
    note: errors.length ? `${errors.length} búsquedas fallaron (${errors[0]})` : undefined,
  };
}

export const SOURCES: SourceDef[] = [
  {
    key: "companies",
    label: "Webs de empresas",
    description: "Revisa la página de empleo de cada empresa de tu lista (OpenStreetMap, Places, a mano) y busca su email de RR. HH.",
    fields: [],
    defaultEnabled: true,
    async run() {
      const reports = await scanAll();
      const errors = reports.filter((r) => r.method === "error").length;
      return {
        found: reports.reduce((n, r) => n + r.found, 0),
        created: reports.reduce((n, r) => n + r.created, 0),
        note: `${reports.length} empresas revisadas${errors ? `, ${errors} con error` : ""}`,
      };
    },
  },
  {
    key: "infojobs",
    label: "InfoJobs",
    description: "API oficial de InfoJobs: ofertas de los últimos 7 días en tu provincia.",
    signupUrl: "https://developer.infojobs.net",
    fields: [
      { name: "clientId", label: "Client ID", env: "INFOJOBS_CLIENT_ID" },
      { name: "clientSecret", label: "Client Secret", env: "INFOJOBS_CLIENT_SECRET" },
    ],
    defaultEnabled: false,
    run: (c) => portalRun("infojobs", (q, loc) => searchInfoJobs({ clientId: c.clientId!, clientSecret: c.clientSecret! }, q, loc)),
  },
  {
    key: "adzuna",
    label: "Adzuna",
    description: "Agregador con API gratuita: reúne ofertas de muchos portales españoles.",
    signupUrl: "https://developer.adzuna.com",
    fields: [
      { name: "appId", label: "App ID", env: "ADZUNA_APP_ID" },
      { name: "appKey", label: "App Key", env: "ADZUNA_APP_KEY" },
    ],
    defaultEnabled: false,
    run: (c) => portalRun("adzuna", (q, loc) => searchAdzuna({ appId: c.appId!, appKey: c.appKey! }, q, loc)),
  },
  {
    key: "jooble",
    label: "Jooble",
    description: "Agregador con API gratuita (se pide la clave con un formulario).",
    signupUrl: "https://jooble.org/api/about",
    fields: [{ name: "apiKey", label: "Clave de la API", env: "JOOBLE_API_KEY" }],
    defaultEnabled: false,
    run: (c) => portalRun("jooble", (q, loc) => searchJooble({ apiKey: c.apiKey! }, q, loc)),
  },
];

export const findSource = (key: string) => SOURCES.find((s) => s.key === key);

// ---------- Claves de cada fuente: almacén de secretos, con el .env como alternativa ----------
const secretName = (key: string) => `source-${key}`;

export async function getCredentials(def: SourceDef): Promise<Record<string, string> | null> {
  if (!def.fields.length) return {};
  const stored = await getSecret(secretName(def.key));
  if (stored) return JSON.parse(stored) as Record<string, string>;
  const fromEnv = Object.fromEntries(def.fields.map((f) => [f.name, process.env[f.env]?.trim() ?? ""]));
  return Object.values(fromEnv).every(Boolean) ? fromEnv : null;
}

export async function saveCredentials(def: SourceDef, values: Record<string, string>) {
  const clean = Object.fromEntries(def.fields.map((f) => [f.name, (values[f.name] ?? "").trim()]));
  if (Object.values(clean).some((v) => !v)) throw new Error(`Faltan datos: ${def.fields.map((f) => f.label).join(", ")}`);
  await setSecret(secretName(def.key), JSON.stringify(clean));
}

export const forgetCredentials = (def: SourceDef) => deleteSecret(secretName(def.key));
