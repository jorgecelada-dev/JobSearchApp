import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getSetting, setSetting } from "../db/settings.js";
import { deleteSecret, getSecret, setSecret } from "../secrets/keychain.js";

/**
 * Clasificación con Claude, OPCIONAL: solo para las ofertas que las palabras clave no
 * resuelven con claridad. Necesita una clave de la API de Anthropic (almacén seguro o
 * ANTHROPIC_API_KEY) y el interruptor encendido en la pestaña «Fuentes».
 */
export const MODEL = "claude-opus-5-5";
const SECRET = "anthropic";

export interface AiProfile {
  slug: string;
  name: string;
  description: string;
}
export interface AiVerdict {
  /** null = no encaja con ningún perfil. */
  slug: string | null;
  score: number;
  reason: string;
}

export const getAnthropicKey = async () => (await getSecret(SECRET)) ?? process.env.ANTHROPIC_API_KEY?.trim() ?? null;
export const saveAnthropicKey = (key: string) => setSecret(SECRET, key.trim());
export const forgetAnthropicKey = () => deleteSecret(SECRET);
export const aiEnabled = async () => (await getSetting("aiClassification")) === "on";
export const setAiEnabled = (on: boolean) => setSetting("aiClassification", on ? "on" : "off");

export async function aiStatus() {
  return { enabled: await aiEnabled(), configured: !!(await getAnthropicKey()), model: MODEL };
}

const SYSTEM =
  "Clasificas ofertas de empleo y encargos freelance para una persona que busca trabajo en España. " +
  "Tiene varios perfiles de CV; decide con cuál encaja la oferta, o ninguno si no encaja con ninguno. " +
  "Puntúa de 0 a 100 cuánto encaja (70 o más: merece la pena enviar el CV). " +
  "La razón, en español y en una frase corta. Juzga por lo que pide la oferta, no por palabras sueltas.";

/** Devuelve null si no hay clave, la IA está apagada o la llamada falla (se usan las palabras clave). */
export async function classifyWithAi(
  job: { title: string; description?: string | null; companyName?: string | null },
  profiles: AiProfile[],
): Promise<AiVerdict | null> {
  const apiKey = await getAnthropicKey();
  if (!apiKey || !(await aiEnabled()) || !profiles.length) return null;

  const slugs = profiles.map((p) => p.slug) as [string, ...string[]];
  const Verdict = z.object({
    profile: z.enum([...slugs, "ninguno"]),
    score: z.number().int().min(0).max(100),
    reason: z.string(),
  });
  const offer = [
    `Puesto: ${job.title}`,
    job.companyName ? `Empresa: ${job.companyName}` : null,
    `Descripción: ${(job.description ?? "(sin descripción)").slice(0, 6000)}`,
  ].filter(Boolean).join("\n");
  const perfiles = profiles.map((p) => `- ${p.slug} (${p.name}): ${p.description}`).join("\n");

  try {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Verdict) },
      messages: [{ role: "user", content: `Perfiles:\n${perfiles}\n\nOferta:\n${offer}` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    const v = response.parsed_output;
    return { slug: v.profile === "ninguno" ? null : v.profile, score: v.score, reason: v.reason };
  } catch (e) {
    console.error(`Clasificación con IA no disponible: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
