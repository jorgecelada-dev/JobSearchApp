export interface DraftJob {
  title: string;
  companyName?: string | null;
}

export interface Draft {
  subject: string;
  body: string;
}

export const NAME_PLACEHOLDER = "[Tu nombre]";
const fallbackName = () => process.env.APPLICANT_NAME?.trim() || NAME_PLACEHOLDER;

interface Voice {
  /** Presentación de una línea según el perfil (tono incluido). */
  intro: string;
  closing: string;
}

const VOICES: Record<string, Voice> = {
  web_designer: {
    intro:
      "Soy diseñador web y gráfico y me gustaría poner mi trabajo creativo al servicio de vuestro equipo. Con gusto os enseño mi portfolio.",
    closing: "Quedo a vuestra disposición para lo que necesitéis.",
  },
  extracurricular_teacher: {
    intro:
      "Soy profesor de extraescolares (Matemáticas, Física y Química, Dibujo Técnico, guitarra y dibujo artístico) y disfruto ayudando a cada alumno a avanzar a su ritmo.",
    closing: "Estaré encantado de contaros cómo trabajo en una entrevista.",
  },
  sales: {
    intro:
      "Cuento con formación en ventas y me motiva el trato directo con el cliente y cumplir objetivos.",
    closing: "Podemos hablar cuando os venga bien.",
  },
};

const FALLBACK: Voice = {
  intro: "Creo que mi perfil puede encajar bien con lo que buscáis.",
  closing: "Quedo a vuestra disposición.",
};

/**
 * Borrador determinista a partir de una plantilla por perfil. No inventa
 * experiencia: solo usa lo que dice el perfil y los datos de la oferta.
 * `email` incluye la mención al CV adjunto; `autofill` es una carta para
 * pegar en un formulario (el CV se sube aparte).
 */
export function buildDraft(
  profileSlug: string,
  job: DraftJob,
  method: "email" | "autofill",
  applicantName?: string | null,
): Draft {
  const voice = VOICES[profileSlug] ?? FALLBACK;
  const company = job.companyName?.trim();
  const greeting = company ? `Estimado equipo de ${company}:` : "Buenas:";
  const cv = method === "email" ? " Adjunto mi CV." : "";

  const body = [
    greeting,
    `Me pongo en contacto para presentar mi candidatura al puesto de «${job.title}».${cv}`,
    voice.intro,
    `${voice.closing} Muchas gracias por vuestro tiempo.`,
    `Un saludo,\n${applicantName?.trim() || fallbackName()}`,
  ].join("\n\n");

  return { subject: `Candidatura: ${job.title}`, body };
}
