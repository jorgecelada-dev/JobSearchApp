import cron from "node-cron";
import { prisma } from "./db/client.js";
import { refreshLeads, refreshStatus } from "./leads/refresh.js";

/** La misma búsqueda que el botón «Buscar leads ahora»: solo las fuentes encendidas. */
async function dailyRun() {
  console.log(`[${new Date().toISOString()}] Revisión diaria…`);
  await refreshLeads();
  const s = refreshStatus();
  for (const src of s.sources) {
    const counts = src.found !== undefined ? ` · ${src.found} encontradas · ${src.created} nuevas` : "";
    console.log(`- ${src.label}: ${src.state}${counts}${src.note ? ` · ${src.note}` : ""}`);
  }
  console.log(s.error ? `Fallo en la revisión diaria: ${s.error}` : `Candidaturas creadas: ${s.drafted ?? 0}`);
}

if (process.argv.includes("--now")) {
  await dailyRun();
  await prisma.$disconnect();
} else {
  // Todos los días a las 07:00 (hora de Madrid). El proceso debe quedarse abierto.
  cron.schedule("0 7 * * *", dailyRun, { timezone: "Europe/Madrid" });
  console.log("Programador activo: revisión diaria a las 07:00 (Europe/Madrid). Ctrl+C para parar.");
}
