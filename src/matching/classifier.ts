import { PROFILE_KEYWORDS } from "./keywords.js";

export interface JobInput {
  title: string;
  description?: string | null;
}

export interface ProfileScore {
  slug: string;
  /** 0-100 */
  score: number;
  matched: string[];
  /** Cuántas palabras clave aparecen en el TÍTULO. */
  titleHits: number;
}

export interface Classification {
  /**
   * Perfil ganador, o null si ninguno supera `minScore` o si ninguna palabra
   * clave aparece en el título: coincidencias sueltas en una descripción larga
   * ("UI", "portfolio") no bastan, dan falsos positivos con ofertas ajenas.
   */
  best: ProfileScore | null;
  /** Todos los perfiles, de mayor a menor puntuación. */
  ranking: ProfileScore[];
}

/** Minúsculas y sin tildes: "Diseñador/a Gráfico" -> "disenador/a grafico". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function termRegex(term: string): RegExp {
  const wildcard = term.endsWith("*");
  const base = (wildcard ? term.slice(0, -1) : term).replace(/[.+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${base}${wildcard ? "[a-z]*" : ""}(?![a-z0-9])`);
}

// Un acierto en el título pesa el triple que uno en la descripción.
const TITLE_FACTOR = 3;
// Con raw = SATURATION la puntuación es 50. Crece sin llegar nunca a 100.
const SATURATION = 6;

export function scoreProfile(slug: string, job: JobInput): ProfileScore {
  const title = normalize(job.title);
  const description = normalize(job.description ?? "");
  let raw = 0;
  const matched: string[] = [];
  let titleHits = 0;

  for (const [term, weight] of PROFILE_KEYWORDS[slug] ?? []) {
    const re = termRegex(term);
    if (re.test(title)) {
      raw += weight * TITLE_FACTOR;
      titleHits++;
    }
    else if (re.test(description)) raw += weight;
    else continue;
    matched.push(term.replace(/\*$/, ""));
  }
  return { slug, score: Math.round((raw / (raw + SATURATION)) * 100), matched, titleHits };
}

export function classify(job: JobInput, minScore = 40): Classification {
  const ranking = Object.keys(PROFILE_KEYWORDS)
    .map((slug) => scoreProfile(slug, job))
    .sort((a, b) => b.score - a.score);
  const top = ranking[0];
  return { best: top && top.score >= minScore && top.titleHits > 0 ? top : null, ranking };
}
