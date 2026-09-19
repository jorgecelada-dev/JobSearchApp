import { prisma } from "../db/client.js";
import { getSetting } from "../db/settings.js";
import { classify } from "./classifier.js";
import { buildDraft } from "./templates.js";

export interface ProcessResult {
  classified: number;
  drafted: number;
  belowThreshold: number;
}

/**
 * Clasifica las ofertas aún sin clasificar y crea una candidatura pendiente de
 * revisión para las que superan `minScore`. Las demás se guardan igualmente
 * (histórico completo) pero sin candidatura.
 */
export async function processNewPostings(
  minScore = Number(process.env.MIN_MATCH_SCORE ?? 40),
): Promise<ProcessResult> {
  const applicantName = await getSetting("applicantName");
  const profiles = await prisma.profile.findMany();
  const bySlug = new Map(profiles.map((p) => [p.slug, p]));
  const postings = await prisma.jobPosting.findMany({
    where: { classifiedAt: null },
    include: { company: true },
  });

  const result: ProcessResult = { classified: 0, drafted: 0, belowThreshold: 0 };

  for (const job of postings) {
    const { best, ranking } = classify(job, minScore);
    const profile = best && bySlug.get(best.slug);
    const score = (best ?? ranking[0])?.score ?? 0;

    await prisma.jobPosting.update({
      where: { id: job.id },
      data: {
        matchedProfileId: profile?.id ?? null,
        matchScore: score,
        classifiedAt: new Date(),
      },
    });
    result.classified++;

    if (!profile || !best) {
      result.belowThreshold++;
      continue;
    }
    const method = job.contactEmail ? "email" : "autofill";
    const draft = buildDraft(
      profile.slug,
      { title: job.title, companyName: job.company?.name ?? job.companyName },
      method,
      applicantName,
    );
    await prisma.application.create({
      data: {
        jobPostingId: job.id,
        profileId: profile.id,
        method,
        draftSubject: method === "email" ? draft.subject : null,
        draftContent: draft.body,
        notes: `Coincidencias: ${best.matched.join(", ")}`,
      },
    });
    result.drafted++;
  }
  return result;
}
