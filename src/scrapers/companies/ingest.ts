import { prisma } from "../../db/client.js";
import type { RawJob } from "./types.js";

/** Guarda las ofertas de una empresa sin duplicar (único por source + externalId). */
export async function saveJobs(
  company: { id: number; name: string },
  origin: string,
  jobs: RawJob[],
): Promise<{ created: number; existing: number }> {
  let created = 0;
  for (const job of jobs) {
    const externalId = `${origin}:${company.id}:${job.externalId}`;
    const where = { source_externalId: { source: "company_site", externalId } } as const;
    if (await prisma.jobPosting.findUnique({ where })) continue;
    await prisma.jobPosting.create({
      data: {
        source: "company_site",
        externalId,
        title: job.title,
        description: job.description,
        url: job.url,
        location: job.location,
        publishedAt: job.publishedAt && !isNaN(+job.publishedAt) ? job.publishedAt : undefined,
        companyName: company.name,
        companyId: company.id,
      },
    });
    created++;
  }
  return { created, existing: jobs.length - created };
}
