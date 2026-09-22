import { prisma } from "../../db/client.js";
import { createSpontaneousApplications } from "../../matching/spontaneous.js";
import { searchCompaniesOsm } from "./osm.js";
import { searchCompanies } from "./places.js";
import { scanAll, scanCompany, type ScanReport } from "./scan.js";

const USAGE = `Uso: npm run companies -- <comando>
  add "<nombre>" <web> ["<zona>"]     añade una empresa a mano
  osm "<categoría>" "<zona>"          busca en OpenStreetMap (gratis, sin clave)
  search "<categoría>" "<zona>" [n]   busca con Google Places (de pago, requiere clave)
  set-careers <id> <url>              fija a mano la página de empleo de una empresa
  list                                lista las empresas
  spontaneous [minScore]              crea candidaturas espontáneas con el email hallado (4=media, 10=solo RR. HH.)
  scan [id]                           revisa sus ofertas (todas, o una)`;

const [cmd, ...args] = process.argv.slice(2);

function printReport(r: ScanReport) {
  const ats = r.ats ? ` [${r.ats}]` : "";
  console.log(`- ${r.company}${ats}: ${r.method} · ${r.found} encontradas · ${r.created} nuevas${r.email ? ` · email: ${r.email}` : ""}${r.note ? `\n    ⚠ ${r.note}` : ""}`);
}

try {
switch (cmd) {
  case "add": {
    const [name, website, zone] = args;
    if (!name || !website) throw new Error(USAGE);
    const c = await prisma.company.create({ data: { name, website, zone } });
    console.log(`Empresa #${c.id} añadida: ${c.name}`);
    break;
  }
  case "osm": {
    const [category, zone] = args;
    if (!category || !zone) throw new Error(USAGE);
    const r = await searchCompaniesOsm(category, zone);
    console.log(`OpenStreetMap: ${r.total} negocios con web, ${r.created} nuevos`);
    break;
  }
  case "search": {
    const [category, zone, pages] = args;
    if (!category || !zone) throw new Error(USAGE);
    const r = await searchCompanies(category, zone, Number(pages ?? 1));
    console.log(`Places: ${r.total} resultados, ${r.created} empresas nuevas`);
    break;
  }
  case "set-careers": {
    const [id, url] = args;
    if (!id || !url) throw new Error(USAGE);
    const c = await prisma.company.update({ where: { id: Number(id) }, data: { careersUrl: url } });
    console.log(`#${c.id} ${c.name}: careersUrl = ${url}`);
    break;
  }
  case "list": {
    for (const c of await prisma.company.findMany({ orderBy: { id: "asc" } }))
      console.log(`#${c.id} ${c.name} · ${c.website ?? "sin web"} · ${c.atsType ?? "sin ATS"} · ${c.contactEmail ?? "sin email"} · revisada: ${c.lastCheckedAt?.toISOString() ?? "nunca"}`);
    break;
  }
  case "spontaneous": {
    const r = await createSpontaneousApplications(args[0] ? Number(args[0]) : 4);
    console.log(`Creadas: ${r.created} · ya existían: ${r.existing} · sin email: ${r.noEmail} · email poco fiable: ${r.lowConfidence} · sin perfil para su categoría: ${r.noProfile}`);
    break;
  }
  case "scan": {
    if (args[0]) {
      const c = await prisma.company.findUniqueOrThrow({ where: { id: Number(args[0]) } });
      printReport(await scanCompany(c));
    } else (await scanAll()).forEach(printReport);
    break;
  }
  default:
    console.log(USAGE);
}
} catch (e) {
  console.error(`Error: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
