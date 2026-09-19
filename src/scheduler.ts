import cron from "node-cron";
import { prisma } from "./db/client.js";
import { processNewPostings } from "./matching/process.js";
import { scanAll } from "./scrapers/companies/scan.js";

async function dailyRun() {
  console.log(`[${new Date().toISOString()}] Revisión diaria…`);
  try {
    const reports = await scanAll();
    const nuevas = reports.reduce((n, r) => n + r.created, 0);
    const r = await processNewPostings();
    console.log(`Empresas: ${reports.length} · ofertas nuevas: ${nuevas} · candidaturas creadas: ${r.drafted}`);
  } catch (e) {
    console.error("Fallo en la revisión diaria:", e);
  }
}

if (process.argv.includes("--now")) {
  await dailyRun();
  await prisma.$disconnect();
} else {
  // Todos los días a las 07:00 (hora de Madrid). El proceso debe quedarse abierto.
  cron.schedule("0 7 * * *", dailyRun, { timezone: "Europe/Madrid" });
  console.log("Programador activo: revisión diaria a las 07:00 (Europe/Madrid). Ctrl+C para parar.");
}
