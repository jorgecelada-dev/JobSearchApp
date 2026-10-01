import { prisma } from "../../db/client.js";
import { htmlToText } from "../companies/text.js";

export type PortalSource = "infojobs" | "adzuna" | "jooble";

export interface PortalJob {
  /** Id del portal: único dentro de esa fuente. */
  externalId: string;
  title: string;
  description?: string;
  url: string;
  location?: string;
  companyName?: string;
  publishedAt?: Date;
}

export const cleanText = (v: unknown) => (typeof v === "string" && v.trim() ? htmlToText(v) : undefined);
export const toDate = (v: unknown) => {
  const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  return d && !isNaN(+d) ? d : undefined;
};

/** Guarda ofertas de un portal sin duplicar (único por source + externalId). */
export async function savePortalJobs(source: PortalSource, jobs: PortalJob[]): Promise<number> {
  let created = 0;
  for (const job of jobs) {
    const where = { source_externalId: { source, externalId: job.externalId } } as const;
    if (await prisma.jobPosting.findUnique({ where })) continue;
    await prisma.jobPosting.create({ data: { source, ...job } });
    created++;
  }
  return created;
}

/** Une las ofertas de varias búsquedas quitando las repetidas (la misma oferta sale con varios términos). */
export function uniqueJobs(lists: PortalJob[][]): PortalJob[] {
  const seen = new Map<string, PortalJob>();
  for (const job of lists.flat()) if (job.externalId && job.title && job.url) seen.set(job.externalId, job);
  return [...seen.values()];
}
