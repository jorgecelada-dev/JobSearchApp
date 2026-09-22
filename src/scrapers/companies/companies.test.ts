import assert from "node:assert/strict";
import { test } from "node:test";
import { detectAts } from "./ats.js";
import { findCareersLinks } from "./careers.js";
import { mapGreenhouse, mapLever, mapPersonio } from "./fetchers.js";
import { extractJobs } from "./parser.js";

const BASE = "https://www.ejemplo.es/";

test("encuentra el enlace de empleo y descarta ruido", () => {
  const html = `<a href="/blog">Blog</a><a href="/contacto">Contacto</a>
    <a href="/trabaja-con-nosotros">Trabaja con nosotros</a>
    <a href="/empleados-del-mes">Empleados del mes</a>
    <a href="mailto:empleo@ejemplo.es">empleo@ejemplo.es</a>`;
  const links = findCareersLinks(html, BASE);
  assert.equal(links[0]?.url, "https://www.ejemplo.es/trabaja-con-nosotros");
  assert.equal(links.length, 1);
});

test("reconoce «Únete», «Careers» y «Bolsa de trabajo»", () => {
  for (const [text, href] of [["Únete al equipo", "/x"], ["Careers", "/x"], ["Bolsa de trabajo", "/x"], ["Empleo", "/x"]] as const) {
    assert.equal(findCareersLinks(`<a href="${href}">${text}</a>`, BASE).length, 1, text);
  }
});

test("detecta ATS por URL o por HTML embebido", () => {
  assert.deepEqual(detectAts("https://job-boards.greenhouse.io/acme/jobs/1"), { type: "greenhouse", id: "acme" });
  assert.deepEqual(detectAts('<iframe src="https://boards.greenhouse.io/embed/job_board?for=acme">'), { type: "greenhouse", id: "acme" });
  assert.deepEqual(detectAts("https://jobs.lever.co/acme"), { type: "lever", id: "acme" });
  assert.deepEqual(detectAts("https://acme.jobs.personio.de/"), { type: "personio", id: "acme" });
  assert.deepEqual(detectAts("https://apply.workable.com/acme/"), { type: "workable", id: "acme" });
  assert.deepEqual(detectAts("https://acme.factorialhr.com/"), { type: "factorial", id: "acme" });
  assert.deepEqual(detectAts("https://join.com/companies/acme"), { type: "join", id: "acme" });
  assert.equal(detectAts("https://www.ejemplo.es/empleo"), null);
});

// Formas reales de respuesta (recortadas) observadas en las APIs públicas.
test("mapea Greenhouse (contenido HTML-escapado)", () => {
  const jobs = mapGreenhouse({ jobs: [{ id: 1, title: "Diseñador", absolute_url: "https://x/1", location: { name: "Madrid" }, content: "&lt;p&gt;Hola &amp;amp; adiós&lt;/p&gt;" }] });
  assert.equal(jobs[0]?.externalId, "1");
  assert.equal(jobs[0]?.location, "Madrid");
  assert.match(jobs[0]?.description ?? "", /Hola/);
  assert.equal(jobs[0]?.description, "Hola & adiós");
});

test("mapea Lever", () => {
  const jobs = mapLever([{ id: "abc", text: "Profesor", hostedUrl: "https://jobs.lever.co/x/abc", categories: { location: "Tres Cantos" }, descriptionPlain: "Clases", createdAt: 1700000000000 }]);
  assert.equal(jobs[0]?.title, "Profesor");
  assert.equal(jobs[0]?.location, "Tres Cantos");
  assert.ok(jobs[0]?.publishedAt instanceof Date);
});

test("mapea Personio (XML)", () => {
  const xml = `<workzag-jobs><position><id>77</id><office>Madrid</office><name>Comercial</name>
    <jobDescriptions><jobDescription><name>Tareas</name><value><![CDATA[<p>Vender</p>]]></value></jobDescription></jobDescriptions>
    <createdAt>2024-11-13T14:10:41+00:00</createdAt></position></workzag-jobs>`;
  const jobs = mapPersonio(xml, "acme");
  assert.equal(jobs[0]?.externalId, "77");
  assert.equal(jobs[0]?.title, "Comercial");
  assert.equal(jobs[0]?.url, "https://acme.jobs.personio.de/job/77");
  assert.equal(jobs[0]?.description, "Vender");
});

test("parser: JSON-LD JobPosting (también dentro de @graph)", () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"JobPosting","title":"Monitor de guitarra","description":"<p>Clases</p>","identifier":{"value":"G1"},"jobLocation":{"address":{"addressLocality":"Tres Cantos"}}}]}</script>`;
  const r = extractJobs(html, BASE + "empleo");
  assert.equal(r.method, "json-ld");
  assert.equal(r.jobs[0]?.externalId, "G1");
  assert.equal(r.jobs[0]?.location, "Tres Cantos");
});

test("parser: heurística de enlaces y descarte de navegación", () => {
  const html = `<a href="/ofertas/disenador-grafico-junior">Diseñador gráfico junior</a>
    <a href="/ofertas/">Ver todas las ofertas</a>
    <a href="/ofertas/politica-privacidad">Política de privacidad</a>
    <a href="https://otro.com/ofertas/x-y-z">Oferta en otra web externa</a>`;
  const r = extractJobs(html, BASE + "empleo");
  assert.equal(r.method, "heuristic");
  assert.deepEqual(r.jobs.map((j) => j.title), ["Diseñador gráfico junior"]);
});

test("parser: no toma botones ni secciones genéricas por ofertas (casos reales de about.gitlab.com)", () => {
  const html = `<a href="/jobs/all-jobs/">See open positions</a>
    <a href="/jobs/accessibility/">Learn more about our accommodations and accessibility.</a>
    <a href="/jobs/ai-interview-process/">Learn more</a>
    <a href="/jobs/benefits-de-la-empresa">Nuestros beneficios</a>`;
  assert.equal(extractJobs(html, "https://about.gitlab.com/jobs/").method, "none");
});

test("parser: página sin ofertas", () => {
  assert.equal(extractJobs("<p>Próximamente</p>", BASE).method, "none");
});

import { buildQuery, mapElements } from "./osm.js";

test("OSM: la consulta incluye el municipio, la web y las etiquetas de la categoría", () => {
  const q = buildQuery("academia de música", "Tres Cantos");
  assert.match(q, /"name"="Tres Cantos"/);
  assert.match(q, /\["website"\]/);
  assert.match(q, /\["contact:website"\]/);
  assert.match(q, /music_school/);
  assert.match(q, /"name"~"academia\|musica",i/);
});

test("OSM: escapa comillas en zona y categoría, y rechaza categorías vacías de sentido", () => {
  assert.doesNotMatch(buildQuery("a\"b academia", 'X"Y'), /"name"="X"Y"/);
  assert.throws(() => buildQuery("a", "Tres Cantos"), /No sé buscar/);
});

test("OSM: mapea elementos, añade https, descarta sin web o sin nombre y duplicados", () => {
  const places = mapElements({
    elements: [
      { type: "node", id: 1, tags: { name: "Academia Sonata", website: "sonata.es", "addr:street": "Calle Sol", "addr:housenumber": "4", "addr:city": "Tres Cantos" } },
      { type: "way", id: 2, tags: { name: "Sin web" } },
      { type: "node", id: 3, tags: { website: "https://x.es" } },
      { type: "node", id: 1, tags: { name: "Academia Sonata", website: "sonata.es" } },
      { type: "node", id: 4, tags: { name: "Colegio", "contact:website": "http://colegio.es" } },
    ],
  });
  assert.deepEqual(places.map((p) => [p.osmId, p.website]), [["osm:node/1", "https://sonata.es"], ["osm:node/4", "http://colegio.es"]]);
  assert.equal(places[0]?.address, "Calle Sol 4, Tres Cantos");
});

import { confidence, decodeCfEmail, extractEmails, rankEmails, type Page } from "./emails.js";

// Codifica como lo hace Cloudflare, para probar la decodificación con datos propios.
const cfEncode = (email: string, key = 0x5a) =>
  key.toString(16).padStart(2, "0") + [...email].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");

test("emails: mailto, texto plano, ofuscado con [arroba] y Cloudflare", () => {
  const html = `<a href="mailto:Rrhh@Empresa.es?subject=CV">Escríbenos</a>
    <p>Llama o escribe a info [arroba] empresa (punto) es</p>
    <a class="__cf_email__" data-cfemail="${cfEncode("talento@empresa.es")}">[email&#160;protected]</a>`;
  assert.deepEqual([...extractEmails(html).keys()].sort(), ["info@empresa.es", "rrhh@empresa.es", "talento@empresa.es"]);
  assert.equal(decodeCfEmail(cfEncode("a@b.es")), "a@b.es");
});

test("emails: descarta imágenes, plantillas y ruido de Wix", () => {
  const html = `<img src="logo@2x.png"> <p>tu@dominio.com  foo@example.com  x1234@sentry.wixpress.com  real@tienda.es</p>`;
  assert.deepEqual([...extractEmails(html).keys()], ["real@tienda.es"]);
});

test("emails: gana el buzón de empleo; los de privacidad o ventas no puntúan", () => {
  const pages: Page[] = [
    { url: "https://tienda.es/", kind: "home", html: `<p>Info: info@tienda.es</p><p>ventas@tienda.es</p>` },
    { url: "https://tienda.es/empleo", kind: "careers", html: `<p>Envía tu currículum a rrhh@tienda.es</p>` },
    { url: "https://tienda.es/aviso-legal", kind: "legal", html: `<p>Privacidad: privacidad@tienda.es</p>` },
  ];
  const ranked = rankEmails(pages, "https://www.tienda.es");
  assert.equal(ranked[0]?.email, "rrhh@tienda.es");
  assert.equal(confidence(ranked[0]!.score), "alta");
  assert.equal(ranked[0]?.sourceUrl, "https://tienda.es/empleo");
  assert.deepEqual(ranked.map((r) => r.email), ["rrhh@tienda.es", "info@tienda.es"]);
});

test("emails: un buzón genérico con contexto de CV supera a otro sin contexto", () => {
  const pages: Page[] = [{ url: "https://x.es/", kind: "home", html: `<p>Prensa: hola@x.es</p><p>Si quieres trabajar con nosotros, manda tu CV a hola@x.es y a ana@gmail.com</p>` }];
  const [first] = rankEmails(pages, "https://x.es");
  assert.equal(first?.email, "hola@x.es");
});

test("emails: rechaza direcciones con forma inválida (basura binaria) y buzones de protección de datos", () => {
  const html = `<p>k@48g9-.bybgnptut  x@a-.es  ok@empresa.es  gdrp@empresa.es  a@b.es</p>`;
  assert.deepEqual([...extractEmails(html).keys()].sort(), ["gdrp@empresa.es", "ok@empresa.es"]);
  const ranked = rankEmails([{ url: "https://empresa.es/", kind: "home", html }], "https://empresa.es");
  assert.deepEqual(ranked.map((r) => r.email), ["ok@empresa.es"]); // gdrp puntúa negativo y se descarta
});
