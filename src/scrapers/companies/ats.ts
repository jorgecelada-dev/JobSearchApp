import type { AtsType } from "./types.js";

export interface AtsMatch {
  type: AtsType;
  id: string;
}

const IGNORE = new Set(["embed", "api", "www", "app", "j", "jobs", "static", "cdn"]);

// Busca la ATS en una URL o en el HTML completo (iframes, enlaces, scripts).
const PATTERNS: [AtsType, RegExp][] = [
  ["greenhouse", /greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/i],
  ["greenhouse", /(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9_-]+)/i],
  ["lever", /jobs\.lever\.co\/([a-z0-9_-]+)/i],
  ["personio", /([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i],
  ["workable", /apply\.workable\.com\/([a-z0-9_-]+)/i],
  ["factorial", /([a-z0-9-]+)\.factorialhr\.(?:com|es)/i],
  ["join", /join\.com\/companies\/([a-z0-9_-]+)/i],
];

export function detectAts(source: string): AtsMatch | null {
  for (const [type, re] of PATTERNS) {
    const id = re.exec(source)?.[1]?.toLowerCase();
    if (id && !IGNORE.has(id)) return { type, id };
  }
  return null;
}
