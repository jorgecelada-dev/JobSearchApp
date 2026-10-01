/**
 * Qué se busca en portales y en LinkedIn para cada perfil. Pocas búsquedas y concretas:
 * cada una es una petición a la API del portal. Ajusta aquí si faltan o sobran ofertas.
 */
export const SEARCH_TERMS: Record<string, string[]> = {
  web_designer: ["diseñador gráfico", "diseñador web", "diseñador UX UI"],
  extracurricular_teacher: ["profesor particular", "profesor extraescolares", "monitor extraescolares"],
  sales: ["dependiente tienda", "comercial ventas", "asesor comercial"],
};

export const allSearchTerms = () => [...new Set(Object.values(SEARCH_TERMS).flat())];
