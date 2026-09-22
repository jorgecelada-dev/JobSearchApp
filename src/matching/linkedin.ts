/**
 * LinkedIn se usa SOLO a mano: no se accede a su web ni a su API. Aquí solo se construyen
 * enlaces de búsqueda que abres tú en tu navegador, y se guardan las ofertas que tú pegas.
 */
export interface LinkedInSearch {
  label: string;
  url: string;
}
export interface LinkedInSearchGroup {
  profile: string;
  searches: LinkedInSearch[];
}

const KEYWORDS: Record<string, string[]> = {
  web_designer: ["diseñador gráfico", "diseñador web", "diseñador UX UI"],
  extracurricular_teacher: ["profesor particular", "profesor extraescolares", "monitor extraescolares"],
  sales: ["dependiente tienda", "comercial ventas", "asesor comercial"],
};

/** hours: 24 = último día, 168 = última semana, 0 = sin filtro de fecha. */
export function linkedinSearchUrl(keywords: string, location: string, hours = 24): string {
  const u = new URL("https://www.linkedin.com/jobs/search/");
  u.searchParams.set("keywords", keywords);
  u.searchParams.set("location", location);
  if (hours > 0) u.searchParams.set("f_TPR", `r${hours * 3600}`);
  u.searchParams.set("sortBy", "DD"); // más recientes primero
  return u.toString();
}

export function linkedinSearches(location: string, hours = 24): LinkedInSearchGroup[] {
  return Object.entries(KEYWORDS).map(([profile, kws]) => ({
    profile,
    searches: kws.map((k) => ({ label: k, url: linkedinSearchUrl(k, location, hours) })),
  }));
}

/** Acepta solo enlaces de oferta de linkedin.com y los reduce a una URL limpia (sin rastreadores). */
export function parseLinkedInJobUrl(raw: string): { url: string; externalId: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !/(^|\.)linkedin\.com$/.test(u.hostname) || !u.pathname.includes("/jobs/")) return null;
  const id = /\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/.exec(u.pathname)?.[1] ?? u.searchParams.get("currentJobId");
  if (!id || !/^\d+$/.test(id)) return null;
  return { url: `https://www.linkedin.com/jobs/view/${id}/`, externalId: id };
}
