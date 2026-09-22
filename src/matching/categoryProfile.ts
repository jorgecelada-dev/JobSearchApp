import { normalize } from "./classifier.js";

// Una candidatura espontánea no tiene título de oferta que clasificar: el perfil se
// decide por la categoría con la que se buscó la empresa ("academia", "tienda"…).
const RULES: [RegExp, string][] = [
  [/academia|escuela|colegio|formacion|idiomas|extraescolar|music|guitarra|instrumento|clases|educa|infantil|guarderia/, "extracurricular_teacher"],
  [/diseno|publicidad|agencia|marketing|imprenta|grafic|web|fotograf/, "web_designer"],
  [/tienda|comercio|venta|retail|supermercado|boutique|electronica|moda|deporte/, "sales"],
];

export function profileForCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  const c = normalize(category);
  return RULES.find(([re]) => re.test(c))?.[1] ?? null;
}
