import { prisma } from "../src/db/client.js";

const profiles = [
  {
    slug: "web_designer",
    name: "Diseñador web/gráfico",
    description:
      "Diseño web y gráfico: maquetación, identidad visual, herramientas de diseño, front-end básico.",
    cvPath: "cvs/web_designer.pdf",
    tone: "Profesional y creativo, mostrando portfolio y sensibilidad visual.",
  },
  {
    slug: "extracurricular_teacher",
    name: "Profesor de extraescolares",
    description:
      "Clases de Matemáticas, Física y Química, Dibujo Técnico, guitarra y dibujo artístico.",
    cvPath: "cvs/extracurricular_teacher.pdf",
    tone: "Cercano y paciente, orientado a alumnos y familias.",
  },
  {
    slug: "sales",
    name: "Formación en ventas",
    description:
      "Formación y orientación comercial: atención al cliente, venta, comunicación.",
    cvPath: "cvs/sales.pdf",
    tone: "Directo y proactivo, orientado a resultados.",
  },
];

for (const p of profiles) {
  await prisma.profile.upsert({ where: { slug: p.slug }, update: p, create: p });
}
console.log(`Seeded ${profiles.length} profiles`);
await prisma.$disconnect();
