export type Status = "pendiente_revision" | "enviada" | "rechazada" | "entrevista";

export interface Application {
  id: number;
  method: "email" | "autofill" | "manual";
  status: Status;
  draftSubject: string | null;
  draftContent: string;
  notes: string | null;
  sentAt: string | null;
  profile: { id: number; slug: string; name: string };
  jobPosting: {
    id: number;
    source: "infojobs" | "jobtoday" | "company_site" | "linkedin_manual";
    title: string;
    description: string | null;
    url: string;
    location: string | null;
    companyName: string | null;
    contactEmail: string | null;
    matchScore: number | null;
    company: { name: string } | null;
  };
}

export const STATUS_LABEL: Record<Status, string> = {
  pendiente_revision: "Pendientes",
  enviada: "Enviadas",
  entrevista: "Entrevistas",
  rechazada: "Rechazadas",
};

export const SOURCE_LABEL: Record<Application["jobPosting"]["source"], string> = {
  infojobs: "InfoJobs",
  jobtoday: "Jobtoday",
  company_site: "Web de empresa",
  linkedin_manual: "LinkedIn",
};

export type SmtpStatus =
  | { connected: false }
  | { connected: true; host: string; port: number; user: string; from?: string };

export interface ProfileCv {
  slug: string;
  name: string;
  hasCv: boolean;
  cvBytes: number;
}

export interface LinkedInGroup {
  profile: string;
  searches: { label: string; url: string }[];
}

export interface InvestigateResult {
  companyId: number;
  report: {
    company: string;
    careersUrl: string | null;
    ats: string | null;
    method: "ats-api" | "json-ld" | "heuristic" | "none" | "error";
    found: number;
    created: number;
    note?: string;
  };
  drafted: number;
  email: { address: string; confidence: string; note: string | null } | null;
  spontaneous: "created" | "existing" | "no-email" | null;
}
