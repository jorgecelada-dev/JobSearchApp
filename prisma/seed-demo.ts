// Datos de DEMOSTRACIÓN para ver el dashboard. No son ofertas reales.
import { prisma } from "../src/db/client.js";

const DEMO = "[DEMO] ";

type Demo = {
  externalId: string;
  source: "infojobs" | "jobtoday" | "company_site";
  title: string;
  companyName: string;
  location: string;
  description: string;
  profile: "web_designer" | "extracurricular_teacher" | "sales";
  score: number;
  method: "email" | "autofill";
  subject?: string;
  draft: string;
  status?: "pendiente_revision" | "enviada" | "rechazada" | "entrevista";
};

const demos: Demo[] = [
  {
    externalId: "demo-1",
    source: "infojobs",
    title: "Diseñador/a gráfico junior",
    companyName: "Estudio Norte",
    location: "Alcobendas, Madrid",
    description: "Identidad visual, maquetación y redes sociales. Se valora Figma.",
    profile: "web_designer",
    score: 92,
    method: "email",
    subject: "Candidatura: Diseñador/a gráfico junior",
    draft:
      "Hola,\n\nMe llamo Jorge y me gustaría presentar mi candidatura al puesto de diseñador gráfico junior. Adjunto mi CV y mi portfolio.\n\nUn saludo,\nJorge",
  },
  {
    externalId: "demo-2",
    source: "company_site",
    title: "Profesor/a de Matemáticas y Física (extraescolares)",
    companyName: "Academia Tres Cantos",
    location: "Tres Cantos, Madrid",
    description: "Clases de refuerzo por las tardes, ESO y Bachillerato.",
    profile: "extracurricular_teacher",
    score: 88,
    method: "autofill",
    draft:
      "Estimado equipo:\n\nSoy profesor de extraescolares con experiencia en Matemáticas y Física y Química. Me encantaría colaborar con vuestra academia.\n\nGracias por vuestro tiempo.",
  },
  {
    externalId: "demo-3",
    source: "jobtoday",
    title: "Dependiente/a tienda de electrónica",
    companyName: "TecnoCentro",
    location: "Alcobendas, Madrid",
    description: "Atención al cliente y venta en tienda. Media jornada.",
    profile: "sales",
    score: 71,
    method: "email",
    subject: "Candidatura: Dependiente/a",
    draft:
      "Buenas,\n\nMe interesa el puesto de dependiente. Tengo formación en ventas y trato cercano con el cliente. Adjunto mi CV.\n\nUn saludo.",
  },
  {
    externalId: "demo-4",
    source: "infojobs",
    title: "Community manager y diseño de contenidos",
    companyName: "Agencia Pixel",
    location: "Madrid (híbrido)",
    description: "Diseño de piezas para redes y gestión de calendario editorial.",
    profile: "web_designer",
    score: 54,
    method: "email",
    subject: "Candidatura: Community manager",
    draft: "Hola,\n\nAdjunto mi CV para el puesto de community manager y diseño de contenidos.\n\nSaludos.",
  },
  {
    externalId: "demo-5",
    source: "company_site",
    title: "Monitor/a de guitarra",
    companyName: "Escuela de Música Sonata",
    location: "Tres Cantos, Madrid",
    description: "Clases grupales de guitarra para niños y adolescentes.",
    profile: "extracurricular_teacher",
    score: 95,
    method: "email",
    subject: "Candidatura: Monitor/a de guitarra",
    draft: "Hola,\n\nSoy profesor de guitarra y dibujo artístico. Me gustaría unirme a vuestro equipo.\n\nUn saludo.",
    status: "enviada",
  },
];

for (const d of demos) {
  const profile = await prisma.profile.findUniqueOrThrow({ where: { slug: d.profile } });
  const posting = await prisma.jobPosting.upsert({
    where: { source_externalId: { source: d.source, externalId: d.externalId } },
    update: {},
    create: {
      source: d.source,
      externalId: d.externalId,
      title: DEMO + d.title,
      description: d.description,
      url: "https://example.com/demo/" + d.externalId,
      location: d.location,
      companyName: d.companyName,
      matchedProfileId: profile.id,
      matchScore: d.score,
      classifiedAt: new Date(),
    },
  });
  await prisma.application.upsert({
    where: { jobPostingId: posting.id },
    update: {},
    create: {
      jobPostingId: posting.id,
      profileId: profile.id,
      method: d.method,
      draftSubject: d.subject,
      draftContent: d.draft,
      status: d.status ?? "pendiente_revision",
      sentAt: d.status === "enviada" ? new Date() : null,
    },
  });
}
console.log(`Demo: ${demos.length} candidaturas de ejemplo`);

// Ofertas SIN clasificar: `npm run classify` las clasifica y crea los borradores.
const raw = [
  { externalId: "raw-1", source: "infojobs", title: "Maquetador/a web y diseño UI", companyName: "Studio Verde", location: "Madrid", contactEmail: "empleo@studioverde.example", description: "Maquetación en HTML y CSS, diseño de interfaces en Figma." },
  { externalId: "raw-2", source: "company_site", title: "Profesor/a de Dibujo Técnico y Matemáticas", companyName: "Academia Alcobendas", location: "Alcobendas, Madrid", contactEmail: null, description: "Clases extraescolares para Bachillerato." },
  { externalId: "raw-3", source: "jobtoday", title: "Vendedor/a de tienda de deportes", companyName: "DeporMax", location: "Tres Cantos, Madrid", contactEmail: null, description: "Atención al cliente y venta. Turnos de tarde." },
  { externalId: "raw-4", source: "jobtoday", title: "Conductor/a de furgoneta de reparto", companyName: "Rápido SL", location: "Alcobendas, Madrid", contactEmail: null, description: "Reparto urbano, carnet B." },
] as const;

for (const r of raw) {
  await prisma.jobPosting.upsert({
    where: { source_externalId: { source: r.source, externalId: r.externalId } },
    update: {},
    create: {
      source: r.source,
      externalId: r.externalId,
      title: DEMO + r.title,
      description: r.description,
      url: "https://example.com/demo/" + r.externalId,
      location: r.location,
      companyName: r.companyName,
      contactEmail: r.contactEmail,
    },
  });
}
console.log(`Demo: ${raw.length} ofertas sin clasificar`);

await prisma.$disconnect();
