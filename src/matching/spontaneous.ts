import { prisma } from "../db/client.js";
import { getSetting } from "../db/settings.js";
import { profileForCategory } from "./categoryProfile.js";
import { buildDraft } from "./templates.js";

export interface SpontaneousResult {
  created: number;
  existing: number;
  noEmail: number;
  lowConfidence: number;
  noProfile: number;
  publicSector: number;
}

// Colegios y organismos públicos contratan por oposición o bolsa oficial, no por un email.
const PUBLIC = /(^|\.)(madrid\.org|gob\.es|gov|edu\.es|educacion\.es|[a-z0-9-]*ayto-[a-z0-9-]+\.es|[a-z0-9-]*ayuntamiento[a-z0-9-]*\.es)$/;
export const isPublicSector = (website: string | null) => {
  try {
    return !!website && PUBLIC.test(new URL(website).hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
};

type CompanyRow = Awaited<ReturnType<typeof prisma.company.findMany>>[number];
type ProfileRow = Awaited<ReturnType<typeof prisma.profile.findMany>>[number];

/** Crea la candidatura espontánea de UNA empresa. Devuelve false si ya existía o no tiene email. */
export async function createSpontaneousFor(company: CompanyRow, profile: ProfileRow, applicantName: string | null): Promise<boolean> {
  if (!company.contactEmail) return false;
  const externalId = `spontaneous:${company.id}`;
  if (await prisma.jobPosting.findUnique({ where: { source_externalId: { source: "company_site", externalId } } })) return false;

  const title = `Candidatura espontánea: ${company.name}`;
  const draft = buildDraft(profile.slug, { title, companyName: company.name }, "email", applicantName, { spontaneous: true });
  const job = await prisma.jobPosting.create({
    data: {
      source: "company_site",
      externalId,
      title,
      description: "Sin oferta publicada: candidatura espontánea al email de contacto de la empresa.",
      url: company.careersUrl ?? company.website ?? "",
      location: company.zone,
      companyName: company.name,
      companyId: company.id,
      contactEmail: company.contactEmail,
      matchedProfileId: profile.id,
      classifiedAt: new Date(),
    },
  });
  await prisma.application.create({
    data: {
      jobPostingId: job.id,
      profileId: profile.id,
      method: "email",
      draftSubject: draft.subject,
      draftContent: draft.body,
      notes: `Email «${company.contactEmail}» — ${company.contactEmailNote ?? "sin detalle"}`,
    },
  });
  return true;
}

/**
 * Crea una candidatura espontánea (pendiente de tu revisión) por cada empresa con un
 * email de contacto fiable. Una sola por empresa, nunca se repite. Nada se envía: cada
 * una aparece como tarjeta y solo sale cuando la apruebas.
 * `minScore` 4 = «media» (junto a «currículum», página de empleo o dominio propio); 10 = solo RR. HH.
 */
export async function createSpontaneousApplications(minScore = 4): Promise<SpontaneousResult> {
  const result: SpontaneousResult = { created: 0, existing: 0, noEmail: 0, lowConfidence: 0, noProfile: 0, publicSector: 0 };
  const applicantName = await getSetting("applicantName");
  const profiles = new Map((await prisma.profile.findMany()).map((p) => [p.slug, p]));

  for (const company of await prisma.company.findMany({ orderBy: { id: "asc" } })) {
    if (isPublicSector(company.website)) {
      result.publicSector++;
      continue;
    }
    if (!company.contactEmail) {
      result.noEmail++;
      continue;
    }
    if ((company.contactEmailScore ?? 0) < minScore) {
      result.lowConfidence++;
      continue;
    }
    const profile = profiles.get(profileForCategory(company.category) ?? "");
    if (!profile) {
      result.noProfile++;
      continue;
    }
    if (!(await createSpontaneousFor(company, profile, applicantName))) {
      result.existing++;
      continue;
    }
    result.created++;
  }
  return result;
}
