import { prisma } from "../db/client.js";
import { processNewPostings } from "./process.js";

const r = await processNewPostings();
console.log(
  `Clasificadas: ${r.classified} · Con borrador: ${r.drafted} · Sin perfil claro: ${r.belowThreshold}`,
);
await prisma.$disconnect();
