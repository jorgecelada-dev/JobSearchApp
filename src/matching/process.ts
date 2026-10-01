import { classifyWithAi, type AiProfile, type AiVerdict } from "../ai/classify.js";
import { prisma } from "../db/client.js";
import { getSetting } from "../db/settings.js";
import { classify } from "./classifier.js";
import { buildDraft } from "./templates.js";

export interface ProcessResult {
  classified: number;
  drafted: number;
  belowThreshold: number;
  /** Ofertas dudosas que se consultaron a la IA. */
  askedAi: number;
}

/** Con esta puntuación por palabras clave la oferta está clara y no se gasta en IA. */
export const CLEAR_SCORE = 60;

type AiClassifier = (job: { title: string; description?: string | null; companyName?: string | null }, profiles: AiProfile[]) => Promise<AiVerdict | null>;

/**
 * Clasifica las ofertas aún sin clasificar y crea una candidatura pendiente de
 * revisión para las que superan `minScore`. Las demás se guardan igualmente
 * (histórico completo) pero sin candidatura. Las dudosas se consultan a la IA si
 * está encendida; si no lo está o falla, decide el clasificador por palabras clave.
 */
export async function processNewPostings(
  minScore = Number(process.env.MIN_MATCH_SCORE ?? 40),
  ai: AiClassifier = classifyWithAi,
): Promise<ProcessResult> {
  const applicantName = await getSetting("applicantName");
  const profiles = await prisma.profile.findMany();
  const bySlug = new Map(profiles.map((p) => [p.slug, p]));
  const postings = await prisma.jobPosting.findMany({
    where: { classifiedAt: null },
    include: { company: true },
  });

  const result: ProcessResult = { classified: 0, drafted: 0, belowThreshold: 0, askedAi: 0 };

  for (const job of postings) {
    const { best, ranking } = classify(job, minScore);
    let slug = best?.slug ?? null;
    let score = (best ?? ranking[0])?.score ?? 0;
    let notes = best ? `Coincidencias: ${best.matched.join(", ")}` : "";

    if (!best || best.score < CLEAR_SCORE) {
      const verdict = await ai({ title: job.title, description: job.description, companyName: job.company?.name ?? job.companyName }, profiles);
      if (verdict) {
        result.askedAi++;
        slug = verdict.slug && verdict.score >= minScore ? verdict.slug : null;
        score = verdict.score;
        notes = `IA: ${verdict.reason}`;
      }
    }
    const profile = slug ? bySlug.get(slug) : undefined;

    await prisma.jobPosting.update({
      where: { id: job.id },
      data: {
        matchedProfileId: profile?.id ?? null,
        matchScore: score,
        classifiedAt: new Date(),
      },
    });
    result.classified++;

    if (!profile) {
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
        notes,
      },
    });
    result.drafted++;
  }
  return result;
}
