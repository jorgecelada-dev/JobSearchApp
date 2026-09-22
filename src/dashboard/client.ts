import type { Application, InvestigateResult, LinkedInGroup, ProfileCv, SmtpStatus, Status } from "./types.js";

/** Los errores del servidor traen `{ error }` en español: se muestran tal cual. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: isForm ? undefined : { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}
const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const listApplications = () => request<Application[]>("/api/applications");

export const updateApplication = (
  id: number,
  patch: { draftSubject?: string | null; draftContent?: string; status?: Status },
) => request<Application>(`/api/applications/${id}`, send("PATCH", patch));

export const sendApplicationEmail = (id: number, to: string) =>
  request<Application>(`/api/applications/${id}/send`, send("POST", { to }));

export const getAccounts = () => request<{ smtp: SmtpStatus }>("/api/accounts");
export const saveSmtp = (v: { host: string; port: number; user: string; pass?: string }) =>
  request<SmtpStatus>("/api/accounts/smtp", send("PUT", v));
export const testSmtp = () => request<{ ok: true }>("/api/accounts/smtp/test", send("POST"));
export const removeSmtp = () => request<SmtpStatus>("/api/accounts/smtp", send("DELETE"));

export const getSettings = () => request<{ applicantName: string }>("/api/settings");
export const saveSettings = (applicantName: string) =>
  request<{ applicantName: string }>("/api/settings", send("PUT", { applicantName }));

export const listProfiles = () => request<ProfileCv[]>("/api/profiles");
export const uploadCv = (slug: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<ProfileCv>(`/api/profiles/${slug}/cv`, { method: "PUT", body: form });
};

export const linkedinSearches = (location: string, hours: number) =>
  request<LinkedInGroup[]>(`/api/linkedin/searches?location=${encodeURIComponent(location)}&hours=${hours}`);
export const addLinkedInOffer = (v: {
  url: string; title: string; company: string; location?: string; description?: string; profileSlug?: string;
}) => request<Application>("/api/linkedin/offers", send("POST", v));

export const investigateCompany = (v: { name: string; website: string; profileSlug?: string }) =>
  request<InvestigateResult>("/api/companies/investigate", send("POST", v));
