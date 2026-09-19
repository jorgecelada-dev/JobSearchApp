/**
 * Palabras clave por perfil, SIN tildes ni mayúsculas (el texto se normaliza igual).
 * Peso 3 = señal fuerte, 1 = señal débil. Un `*` final admite cualquier terminación
 * (`profesor*` casa con profesor, profesora, profesorado).
 * Este es el fichero que hay que ajustar cuando el clasificador se equivoque.
 */
export type Keyword = readonly [term: string, weight: number];

export const PROFILE_KEYWORDS: Record<string, readonly Keyword[]> = {
  web_designer: [
    ["disenador*", 3], ["diseno grafico", 3], ["diseno web", 3], ["ux", 3], ["ui", 3],
    ["maquetacion", 3], ["maquetador*", 3], ["figma", 3], ["photoshop", 3],
    ["illustrator", 3], ["indesign", 3], ["branding", 3], ["identidad visual", 3],
    ["frontend", 3], ["front-end", 3], ["wordpress", 3],
    ["creativ*", 1], ["adobe", 1], ["redes sociales", 1], ["community manager", 1],
    ["html", 1], ["css", 1], ["portfolio", 1], ["audiovisual", 1], ["grafic*", 1],
  ],
  extracurricular_teacher: [
    ["profesor*", 3], ["docente", 3], ["monitor", 3], ["monitora", 3], ["monitores", 3],
    ["clases particulares", 3], ["extraescolar*", 3], ["academia", 3],
    ["matematicas", 3], ["fisica", 3], ["quimica", 3], ["dibujo tecnico", 3],
    ["guitarra", 3], ["dibujo artistico", 3], ["tutor*", 3], ["refuerzo escolar", 3],
    ["educador*", 1], ["formador*", 1], ["alumnos", 1], ["ninos", 1],
    ["bachillerato", 1], ["secundaria", 1], ["primaria", 1], ["colegio", 1],
    ["musica", 1], ["ensenanza", 1],
  ],
  sales: [
    ["ventas", 3], ["comercial*", 3], ["vendedor*", 3], ["dependiente*", 3],
    ["asesor comercial", 3], ["atencion al cliente", 3], ["captacion de clientes", 3],
    ["teleoperador*", 3], ["telemarketing", 3], ["atencion al publico", 3],
    ["venta", 1], ["cliente*", 1], ["tienda", 1], ["retail", 1], ["objetivos", 1],
    ["cajero*", 1], ["promotor*", 1], ["negociacion", 1], ["showroom", 1],
  ],
};
