export interface RawJob {
  /** Id estable dentro de su origen (id de la ATS, o hash de la URL). */
  externalId: string;
  title: string;
  description?: string;
  url: string;
  location?: string;
  publishedAt?: Date;
}

export type AtsType = "greenhouse" | "lever" | "personio" | "workable" | "factorial" | "join";
