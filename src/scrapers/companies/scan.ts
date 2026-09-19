import type { Company } from "../../generated/prisma/client.js";
import { prisma } from "../../db/client.js";
import { detectAts } from "./ats.js";
import { findCareersLinks } from "./careers.js";
import { fetchAtsJobs } from "./fetchers.js";
import { fetchText } from "./http.js";
import { saveJobs } from "./ingest.js";
import { extractJobs } from "./parser.js";
import type { RawJob } from "./types.js";

export interface ScanReport {
  company: string;
  careersUrl: string | null;
  ats: string | null;
  method: "ats-api" | "json-ld" | "heuristic" | "none" | "error";
  found: number;
  created: number;
  note?: string;
}

/** Revisa una empresa: página de empleo -> ATS (API JSON) o parser -> guardar. */
export async function scanCompany(company: Company): Promise<ScanReport> {
  const report: ScanReport = {
    company: company.name, careersUrl: company.careersUrl, ats: null, method: "none", found: 0, created: 0,
  };
  try {
    if (!company.website) throw new Error("La empresa no tiene web");

    let careersUrl = company.careersUrl;
    let careersHtml: string | null = null;
    let homeAts = null as ReturnType<typeof detectAts>;

    if (!careersUrl) {
      const home = await fetchText(company.website);
      homeAts = detectAts(home);
      careersUrl = findCareersLinks(home, company.website)[0]?.url ?? null;
      if (!careersUrl && !homeAts) {
        report.note = "No se encontró página de empleo en la home (¿web con JavaScript?). Añade careersUrl a mano.";
        return report;
      }
    }
    report.careersUrl = careersUrl;

    // La propia URL de empleo puede ser ya de una ATS (jobs.lever.co/x).
    let ats = (careersUrl && detectAts(careersUrl)) || homeAts;
    if (!ats && careersUrl) {
      careersHtml = await fetchText(careersUrl);
      ats = detectAts(careersHtml);
    }

    let jobs: RawJob[] | null = null;
    if (ats) {
      report.ats = `${ats.type}:${ats.id}`;
      jobs = await fetchAtsJobs(ats.type, ats.id);
      if (jobs) report.method = "ats-api";
    }
    if (!jobs && careersUrl) {
      careersHtml ??= await fetchText(careersUrl);
      const parsed = extractJobs(careersHtml, careersUrl);
      jobs = parsed.jobs;
      report.method = parsed.method;
      if (parsed.method === "none") report.note = "Página de empleo sin ofertas detectables sin IA (¿cargan con JavaScript?).";
    }

    report.found = jobs?.length ?? 0;
    if (jobs?.length) {
      const origin = ats?.type ?? "web";
      report.created = (await saveJobs(company, origin, jobs)).created;
    }
    await prisma.company.update({
      where: { id: company.id },
      data: { careersUrl, atsType: ats?.type ?? null, atsIdentifier: ats?.id ?? null },
    });
  } catch (e) {
    report.method = "error";
    report.note = e instanceof Error ? e.message : String(e);
  } finally {
    await prisma.company.update({ where: { id: company.id }, data: { lastCheckedAt: new Date() } });
  }
  return report;
}

export async function scanAll(): Promise<ScanReport[]> {
  const reports: ScanReport[] = [];
  for (const company of await prisma.company.findMany({ orderBy: { id: "asc" } })) {
    reports.push(await scanCompany(company));
  }
  return reports;
}
