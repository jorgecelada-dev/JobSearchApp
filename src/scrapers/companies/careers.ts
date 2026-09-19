import * as cheerio from "cheerio";
import { normalize } from "../../matching/classifier.js";

export interface CareersLink {
  url: string;
  text: string;
  score: number;
}

// Términos que indican "trabaja con nosotros" (normalizados, sin tildes).
const TERMS = [
  "trabaja con nosotros", "trabaja en", "bolsa de trabajo", "bolsa de empleo",
  "empleo", "vacantes", "unete", "careers", "career", "jobs", "talento",
  "ofertas de trabajo", "work with us", "join us",
];

const termRe = (t: string) => new RegExp(`(?<![a-z0-9])${t.replace(/ /g, "[ _-]")}(?![a-z0-9])`);
const TERM_RES = TERMS.map(termRe);

/** Enlaces de la página que parecen llevar a la sección de empleo, mejores primero. */
export function findCareersLinks(html: string, baseUrl: string): CareersLink[] {
  const $ = cheerio.load(html);
  const found = new Map<string, CareersLink>();

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    let url: string;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const nText = normalize(text);
    const nHref = normalize(decodeURIComponent(new URL(url).pathname));

    let score = 0;
    for (const re of TERM_RES) {
      if (re.test(nText)) score += 2;
      if (re.test(nHref)) score += 1;
    }
    if (score === 0 || text.length > 80) return;
    const prev = found.get(url);
    if (!prev || prev.score < score) found.set(url, { url, text, score });
  });

  return [...found.values()].sort((a, b) => b.score - a.score);
}
