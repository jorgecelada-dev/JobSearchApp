import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "./http.js";
import { htmlToText } from "./text.js";
import type { AtsType, RawJob } from "./types.js";

// --- Greenhouse: boards-api.greenhouse.io (JSON, el contenido viene HTML-escapado)
export function mapGreenhouse(json: any): RawJob[] {
  return (json?.jobs ?? []).map((j: any) => ({
    externalId: String(j.id),
    title: j.title,
    // el HTML llega escapado una vez: se decodifica y luego se limpia
    description: j.content ? htmlToText(cheerio.load(j.content).text()) : undefined,
    url: j.absolute_url,
    location: j.location?.name,
    publishedAt: j.first_published ? new Date(j.first_published) : undefined,
  }));
}

// --- Lever: api.lever.co/v0/postings/{id}?mode=json
export function mapLever(json: any): RawJob[] {
  return (Array.isArray(json) ? json : []).map((j: any) => ({
    externalId: j.id,
    title: j.text,
    description: j.descriptionPlain ? htmlToText(j.descriptionPlain) : undefined,
    url: j.hostedUrl,
    location: j.categories?.location,
    publishedAt: j.createdAt ? new Date(j.createdAt) : undefined,
  }));
}

// --- Personio: {id}.jobs.personio.de/xml
export function mapPersonio(xml: string, id: string): RawJob[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("position")
    .map((_, el) => {
      const p = $(el);
      const posId = p.children("id").text().trim();
      const description = p
        .find("jobDescriptions jobDescription value")
        .map((_, v) => htmlToText($(v).text(), 1500))
        .get()
        .join(" ");
      const created = p.children("createdAt").text().trim();
      return {
        externalId: posId,
        title: p.children("name").text().trim(),
        description: description || undefined,
        url: `https://${id}.jobs.personio.de/job/${posId}`,
        location: p.children("office").text().trim() || undefined,
        publishedAt: created ? new Date(created) : undefined,
      } satisfies RawJob;
    })
    .get();
}

// --- Workable: apply.workable.com/api/v1/widget/accounts/{id}
// (formato de campos según la documentación del widget; sin probar con una cuenta con ofertas)
export function mapWorkable(json: any, id: string): RawJob[] {
  return (json?.jobs ?? []).map((j: any) => ({
    externalId: String(j.shortcode ?? j.code ?? j.url),
    title: j.title,
    description: j.description ? htmlToText(j.description) : undefined,
    url: j.url ?? j.shortlink ?? `https://apply.workable.com/${id}/`,
    location: [j.city, j.country].filter(Boolean).join(", ") || undefined,
    publishedAt: j.published_on ? new Date(j.published_on) : undefined,
  }));
}

/**
 * Lee las ofertas de una ATS por su API pública. Devuelve `null` si esa ATS no
 * tiene lector (factorial, join): el llamador usa entonces el parser de HTML.
 */
export async function fetchAtsJobs(type: AtsType, id: string): Promise<RawJob[] | null> {
  switch (type) {
    case "greenhouse":
      return mapGreenhouse(await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`));
    case "lever":
      return mapLever(await fetchJson(`https://api.lever.co/v0/postings/${id}?mode=json`));
    case "personio":
      return mapPersonio(await fetchText(`https://${id}.jobs.personio.de/xml`), id);
    case "workable":
      return mapWorkable(await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${id}`), id);
    default:
      return null;
  }
}
