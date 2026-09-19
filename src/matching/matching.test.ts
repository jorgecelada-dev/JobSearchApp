import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, normalize } from "./classifier.js";
import { buildDraft } from "./templates.js";

test("normalize quita tildes y mayúsculas", () => {
  assert.equal(normalize("Diseñador/a GRÁFICO"), "disenador/a grafico");
});

const cases: [title: string, description: string, expected: string | null][] = [
  ["Diseñador/a gráfico junior", "Identidad visual y maquetación. Se valora Figma.", "web_designer"],
  ["Profesor/a de Matemáticas y Física", "Clases extraescolares en ESO y Bachillerato.", "extracurricular_teacher"],
  ["Monitor/a de guitarra", "Clases grupales para niños.", "extracurricular_teacher"],
  ["Dependiente/a tienda de electrónica", "Atención al cliente y venta en tienda.", "sales"],
  ["Comercial de ventas B2B", "Captación de clientes y negociación.", "sales"],
  ["Conductor de camión", "Reparto nacional, carnet C.", null],
  ["Camarero/a", "Turno de tarde en restaurante.", null],
];

for (const [title, description, expected] of cases) {
  test(`clasifica «${title}» -> ${expected ?? "ninguno"}`, () => {
    assert.equal(classify({ title, description }).best?.slug ?? null, expected);
  });
}

test("no puntúa un término que solo aparece dentro de otra palabra", () => {
  // "ui" dentro de "guitarra"/"quimica" no debe puntuar como diseño
  const web = classify({ title: "Profesor de guitarra y química" }).ranking.find(
    (r) => r.slug === "web_designer",
  );
  assert.equal(web?.score, 0);
});

test("una descripción con muchos términos sueltos no basta si el título no encaja", () => {
  const r = classify({
    title: "Senior Backend Engineer (Ruby)",
    description: "Trabajarás con el equipo de UX y UI, frontend, portfolio de producto, HTML, CSS, Figma y creatividad.",
  });
  assert.ok(r.ranking[0]!.score >= 40, "la descripción sí puntúa alto…");
  assert.equal(r.best, null, "…pero no debe crear candidatura");
});

test("el título pesa más que la descripción", () => {
  const inTitle = classify({ title: "Vendedor", description: "" }).ranking[0]!.score;
  const inDesc = classify({ title: "Puesto", description: "Vendedor" }).ranking[0]!.score;
  assert.ok(inTitle > inDesc);
});

test("las plantillas rellenan empresa, puesto y CV según el método", () => {
  process.env.APPLICANT_NAME = "Jorge";
  const email = buildDraft("sales", { title: "Dependiente", companyName: "TecnoCentro" }, "email");
  assert.match(email.body, /Estimado equipo de TecnoCentro/);
  assert.match(email.body, /«Dependiente»/);
  assert.match(email.body, /Adjunto mi CV/);
  assert.match(email.body, /Jorge$/);
  assert.equal(email.subject, "Candidatura: Dependiente");

  const form = buildDraft("sales", { title: "Dependiente" }, "autofill");
  assert.match(form.body, /^Buenas:/);
  assert.doesNotMatch(form.body, /Adjunto mi CV/);
});
