import * as cheerio from "cheerio";
import { createHash } from "node:crypto";

/** HTML (o texto con entidades HTML) -> texto plano, sin exceso de espacios. */
export function htmlToText(html: string, max = 4000): string {
  const text = cheerio.load(html).text().replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export const hashUrl = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 16);
