import { z } from "zod";
import { prisma } from "../db/client.js";
import { getSetting } from "../db/settings.js";
import { classify, scoreProfile } from "./classifier.js";
import { parseLinkedInJobUrl } from "./linkedin.js";
import { buildDraft } from "./templates.js";

export class ManualOfferError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) {
    super(message);
  }
}

export const manualOfferSchema = z.object({
  url: z.string().trim().min(1),
  title: z.string().trim().min(2).max(200),
  company: z.string().trim().min(1).max(200),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(20000).optional(),
  /** Vacío = elegir automáticamente por palabras clave. */
  profileSlug: z.string().trim().optional(),
});

/**
 * Guarda una oferta de LinkedIn que TÚ has pegado y prepara su borrador. No visita
 * LinkedIn: solo usa el texto que tú das. La candidatura es «manual»: la envías tú allí.
 */
export async function addManualLinkedInOffer(input: z.infer<typeof manualOfferSchema>, minScore = Number(process.env.MIN_MATCH_SCORE ?? 40)) {
  const parsed = parseLinkedInJobUrl(input.url);
  if (!parsed) throw new ManualOfferError("El enlace debe ser de una oferta de LinkedIn (linkedin.com/jobs/view/…)");

  const exists = await prisma.jobPosting.findUnique({ where: { source_externalId: { source: "linkedin_manual", externalId: parsed.externalId } } });
  if (exists) throw new ManualOfferError("Ya tenías guardada esta oferta", 409);

  const job = { title: input.title, description: input.description };
  let slug = input.profileSlug || null;
  let score: number;
  if (slug) {
    score = scoreProfile(slug, job).score;
  } else {
    const { best } = classify(job, minScore);
    if (!best) throw new ManualOfferError("No he podido elegir un perfil por el título: elige uno en el desplegable");
    slug = best.slug;
    score = best.score;
  }
  const profile = await prisma.profile.findUnique({ where: { slug } });
  if (!profile) throw new ManualOfferError("Perfil no encontrado");

  const draft = buildDraft(profile.slug, { title: input.title, companyName: input.company }, "autofill", await getSetting("applicantName"));
  const posting = await prisma.jobPosting.create({
    data: {
      source: "linkedin_manual",
      externalId: parsed.externalId,
      title: input.title,
      description: input.description || null,
      url: parsed.url,
      location: input.location || null,
      companyName: input.company,
      matchedProfileId: profile.id,
      matchScore: score,
      classifiedAt: new Date(),
    },
  });
  return prisma.application.create({
    data: {
      jobPostingId: posting.id,
      profileId: profile.id,
      method: "manual",
      draftContent: draft.body,
      notes: "LinkedIn: la solicitas tú allí. Copia el borrador si te sirve.",
    },
    include: { profile: true, jobPosting: { include: { company: true } } },
  });
}
