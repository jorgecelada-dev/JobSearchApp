import { prisma } from "../../db/client.js";
import { HttpError, politeFetch } from "./http.js";
import { normalize } from "../../matching/classifier.js";

/**
 * Alternativa gratuita a Google Places: OpenStreetMap vía Overpass API. No pide
 * clave ni tarjeta (uso razonable: pocas consultas). Solo devuelve negocios que
 * tengan web, que es lo que necesitamos para buscar su página de empleo.
 * Cobertura: depende de lo que hayan cartografiado los voluntarios de OSM.
 */

// Categoría (palabras que puedes escribir) -> filtros de etiquetas OSM.
const CATEGORY_TAGS: [RegExp, string[]][] = [
  [/academia|escuela|colegio|formacion|idiomas|extraescolar/, ['["amenity"~"^(school|language_school|music_school|college)$"]', '["office"="educational_institution"]']],
  [/music|guitarra|instrumento/, ['["amenity"="music_school"]', '["shop"="musical_instrument"]']],
  [/diseno|publicidad|agencia|marketing|imprenta/, ['["office"~"^(advertising_agency|design|it)$"]', '["craft"~"^(printer|photographer)$"]', '["shop"="copyshop"]']],
  [/tienda|comercio|venta|retail/, ['["shop"]']],
  [/restaurante|bar|cafe|hosteler/, ['["amenity"~"^(restaurant|cafe|bar|fast_food)$"]']],
  [/gimnasio|deporte|fitness/, ['["leisure"~"^(fitness_centre|sports_centre)$"]', '["shop"="sports"]']],
  [/clinica|salud|dental|farmacia/, ['["amenity"~"^(clinic|dentist|doctors|pharmacy)$"]', '["healthcare"]']],
];

const esc = (s: string) => s.replace(/[\\"]/g, "\\$&");

/** Consulta Overpass QL: negocios con web en el municipio, dentro de España. */
export function buildQuery(category: string, zone: string): string {
  const cat = normalize(category);
  const tagFilters = CATEGORY_TAGS.filter(([re]) => re.test(cat)).flatMap(([, tags]) => tags);
  const words = cat.split(/\s+/).filter((w) => w.length >= 4);
  // Además, el nombre del negocio contiene la palabra ("Academia Sonata").
  const nameRe = words.length ? esc(words.join("|")) : "";
  const withWeb = (filter: string) =>
    ['["website"]', '["contact:website"]'].map((w) => `nwr(area.a)${w}${filter};`).join("\n  ");

  const parts = [...tagFilters.map(withWeb), ...(nameRe ? [withWeb(`["name"~"${nameRe}",i]`)] : [])];
  if (!parts.length) throw new Error(`No sé buscar la categoría «${category}»: usa alguna palabra más concreta`);

  return `[out:json][timeout:40];
area["ISO3166-1"="ES"]["admin_level"="2"]->.es;
area["name"="${esc(zone)}"]["boundary"="administrative"](area.es)->.a;
(
  ${parts.join("\n  ")}
);
out center tags;`;
}

export interface OsmPlace {
  osmId: string;
  name: string;
  website: string;
  address?: string;
}

export function mapElements(json: { elements?: { type: string; id: number; tags?: Record<string, string> }[] }): OsmPlace[] {
  const seen = new Set<string>();
  const out: OsmPlace[] = [];
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {};
    const name = t.name?.trim();
    let website = (t.website ?? t["contact:website"])?.trim();
    if (!name || !website) continue;
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    const osmId = `osm:${e.type}/${e.id}`;
    if (seen.has(osmId)) continue;
    seen.add(osmId);
    const address = [[t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "), t["addr:city"]].filter(Boolean).join(", ");
    out.push({ osmId, name, website, address: address || undefined });
  }
  return out;
}

// Servicio público y compartido: a veces devuelve 429/504 por saturación. Se prueba un
// servidor espejo y se reintenta una vez tras una pausa (así lo pide su política de uso).
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function overpass(query: string): Promise<Parameters<typeof mapElements>[0]> {
  let last: unknown;
  for (let round = 0; round < 2; round++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await politeFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(60_000),
        });
        return await res.json();
      } catch (e) {
        last = e;
        if (e instanceof HttpError && !RETRYABLE.has(e.status)) throw e;
      }
    }
    if (round === 0) await new Promise((r) => setTimeout(r, 8_000));
  }
  throw new Error(`OpenStreetMap (Overpass) está saturado ahora mismo; reinténtalo en unos minutos. Último error: ${last instanceof Error ? last.message : last}`);
}

/** Una zona que no existe haría a Overpass trabajar hasta el timeout: se comprueba antes, es barata. */
export const zoneQuery = (zone: string) =>
  `[out:json][timeout:15];
area["ISO3166-1"="ES"]["admin_level"="2"]->.es;
area["name"="${esc(zone)}"]["boundary"="administrative"](area.es);
out ids;`;

/** Busca negocios en OSM y los guarda como Company (placeId = «osm:tipo/id»). */
export async function searchCompaniesOsm(category: string, zone: string) {
  const query = buildQuery(category, zone); // valida la categoría antes de tocar la red
  if (!(await overpass(zoneQuery(zone))).elements?.length) {
    throw new Error(`No encuentro el municipio «${zone}» en OpenStreetMap. Escríbelo como aparece en el mapa (p. ej. «Tres Cantos», «Alcobendas»).`);
  }
  const places = mapElements(await overpass(query));

  let created = 0;
  for (const p of places) {
    if (await prisma.company.findUnique({ where: { placeId: p.osmId } })) continue;
    await prisma.company.create({
      data: { placeId: p.osmId, name: p.name, website: p.website, address: p.address, zone, category },
    });
    created++;
  }
  return { total: places.length, created };
}
