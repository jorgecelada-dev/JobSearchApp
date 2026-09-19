import { prisma } from "../../db/client.js";

interface Place {
  id: string;
  displayName?: { text: string };
  websiteUri?: string;
  formattedAddress?: string;
}

/**
 * Busca empresas con Google Places (API "New", Text Search) y las guarda como
 * Company. NOTA: escrito según la documentación de Google y sin probar con una
 * clave real. Pedir `websiteUri` sube el nivel de facturación de la búsqueda:
 * `maxPages` limita el gasto (20 resultados por página).
 */
export async function searchCompanies(category: string, zone: string, maxPages = 1) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Falta GOOGLE_PLACES_API_KEY en el .env");

  let pageToken: string | undefined;
  let created = 0;
  let total = 0;

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.formattedAddress,nextPageToken",
      },
      body: JSON.stringify({ textQuery: `${category} en ${zone}`, languageCode: "es", pageSize: 20, pageToken }),
    });
    if (!res.ok) throw new Error(`Google Places ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { places?: Place[]; nextPageToken?: string };

    for (const p of data.places ?? []) {
      total++;
      if (await prisma.company.findUnique({ where: { placeId: p.id } })) continue;
      await prisma.company.create({
        data: {
          placeId: p.id,
          name: p.displayName?.text ?? "(sin nombre)",
          website: p.websiteUri,
          address: p.formattedAddress,
          zone,
          category,
        },
      });
      created++;
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { total, created };
}
