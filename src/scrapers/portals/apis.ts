import { normalize } from "../../matching/classifier.js";
import { fetchJson, politeFetch } from "../companies/http.js";
import { cleanText, toDate, type PortalJob } from "./portals.js";

// Escritos según la documentación pública de cada API (octubre 2026) y probados con
// respuestas de ejemplo; la primera búsqueda real con tus claves es la prueba definitiva.

// --- InfoJobs: GET https://api.infojobs.net/api/9/offer (Basic con client_id:client_secret)
export function mapInfoJobs(json: any): PortalJob[] {
  return (json?.offers ?? []).map((o: any) => ({
    externalId: String(o.id),
    title: String(o.title ?? ""),
    description: cleanText(o.requirementMin),
    url: o.link,
    location: [o.city, o.province?.value].filter(Boolean).join(", ") || undefined,
    companyName: o.author?.name || undefined,
    publishedAt: toDate(o.published),
  }));
}

export async function searchInfoJobs(creds: { clientId: string; clientSecret: string }, q: string, location: string) {
  const u = new URL("https://api.infojobs.net/api/9/offer");
  u.searchParams.set("q", q);
  u.searchParams.set("province", normalize(location).replace(/\s+/g, "-"));
  u.searchParams.set("sinceDate", "_7_DAYS");
  u.searchParams.set("maxResults", "50");
  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await politeFetch(u.toString(), { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
  return mapInfoJobs(await res.json());
}

// --- Adzuna: GET https://api.adzuna.com/v1/api/jobs/es/search/1
export function mapAdzuna(json: any): PortalJob[] {
  return (json?.results ?? []).map((r: any) => ({
    externalId: String(r.id),
    title: cleanText(r.title) ?? "",
    description: cleanText(r.description),
    url: r.redirect_url,
    location: r.location?.display_name || undefined,
    companyName: r.company?.display_name || undefined,
    publishedAt: toDate(r.created),
  }));
}

export async function searchAdzuna(creds: { appId: string; appKey: string }, what: string, where: string) {
  const u = new URL("https://api.adzuna.com/v1/api/jobs/es/search/1");
  u.searchParams.set("app_id", creds.appId);
  u.searchParams.set("app_key", creds.appKey);
  u.searchParams.set("what", what);
  u.searchParams.set("where", where);
  u.searchParams.set("results_per_page", "50");
  u.searchParams.set("max_days_old", "7");
  u.searchParams.set("content-type", "application/json");
  return mapAdzuna(await fetchJson(u.toString()));
}

// --- Jooble: POST https://jooble.org/api/{clave}
export function mapJooble(json: any): PortalJob[] {
  return (json?.jobs ?? []).map((j: any) => ({
    externalId: String(j.id ?? j.link),
    title: cleanText(j.title) ?? "",
    description: cleanText(j.snippet),
    url: j.link,
    location: j.location || undefined,
    companyName: j.company || undefined,
    publishedAt: toDate(j.updated),
  }));
}

export async function searchJooble(creds: { apiKey: string }, keywords: string, location: string) {
  const res = await politeFetch(`https://jooble.org/api/${encodeURIComponent(creds.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ keywords, location }),
  });
  return mapJooble(await res.json());
}
