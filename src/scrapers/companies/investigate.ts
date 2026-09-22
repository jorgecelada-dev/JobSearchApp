import { prisma } from "../../db/client.js";
import { getSetting } from "../../db/settings.js";
import { processNewPostings } from "../../matching/process.js";
import { createSpontaneousFor } from "../../matching/spontaneous.js";
import { confidence } from "./emails.js";
import { scanCompany, type ScanReport } from "./scan.js";

export class InvestigateError extends Error {}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Acepta «empresa.com» o una URL; solo http(s) público. Si apunta a una subpágina, se toma como su página de empleo. */
export function normalizeWebsite(raw: string, allowPrivate = false): { origin: string; careersUrl: string | null } {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new InvestigateError("La web no es válida (ejemplo: https://empresa.com)");
  }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || (!allowPrivate && PRIVATE_HOST.test(u.hostname))) {
    throw new InvestigateError("La web debe ser una dirección pública (https://…)");
  }
  u.hash = "";
  const isRoot = u.pathname === "/" && !u.search;
  return { origin: u.origin, careersUrl: isRoot ? null : u.toString() };
}

export interface InvestigateResult {
  companyId: number;
  report: ScanReport;
  /** Candidaturas creadas para las ofertas nuevas que encajan con tus perfiles. */
  drafted: number;
  email: { address: string; confidence: string; note: string | null } | null;
  spontaneous: "created" | "existing" | "no-email" | null;
}

/**
 * Investiga UNA empresa a petición tuya (p. ej. la que anuncia en LinkedIn): busca su página de
 * empleo, su ATS y su mejor email en SU web, guarda las ofertas y prepara borradores. No toca LinkedIn.
 * Si indicas `profileSlug` y hay email, crea además una candidatura espontánea con ese perfil.
 */
export async function investigateCompany(
  input: { name: string; website: string; profileSlug?: string | null },
  opts: { allowPrivateHosts?: boolean } = {}, // solo para pruebas locales: el endpoint nunca lo activa
): Promise<InvestigateResult> {
  const { origin, careersUrl } = normalizeWebsite(input.website, opts.allowPrivateHosts);
  const host = new URL(origin).hostname.replace(/^www\./, "");

  let profile = null;
  if (input.profileSlug) {
    profile = await prisma.profile.findUnique({ where: { slug: input.profileSlug } });
    if (!profile) throw new InvestigateError("Perfil no encontrado");
  }

  // Misma empresa si comparte web o nombre (una empresa puede tener varios subdominios: www., agent., careers.…)
  let company = await prisma.company.findFirst({ where: { OR: [{ website: { contains: host } }, { name: input.name.trim() }] } });
  if (company) {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { ...(careersUrl && { careersUrl }), ...(!company.contactEmail && { contactEmailCheckedAt: null }) },
    });
  } else {
    company = await prisma.company.create({ data: { name: input.name.trim(), website: origin, careersUrl } });
  }

  const report = await scanCompany(company);
  const { drafted } = await processNewPostings();

  const fresh = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
  let spontaneous: InvestigateResult["spontaneous"] = null;
  if (profile) {
    if (!fresh.contactEmail) spontaneous = "no-email";
    else spontaneous = (await createSpontaneousFor(fresh, profile, await getSetting("applicantName"))) ? "created" : "existing";
  }

  return {
    companyId: fresh.id,
    report,
    drafted,
    email: fresh.contactEmail
      ? { address: fresh.contactEmail, confidence: confidence(fresh.contactEmailScore ?? 0), note: fresh.contactEmailNote }
      : null,
    spontaneous,
  };
}
