import { useState } from "react";
import { sendApplicationEmail, updateApplication } from "./client.js";
import { SOURCE_LABEL, type Application, type Status } from "./types.js";

function scoreLevel(score: number | null) {
  if (score === null) return "none";
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

export function ApplicationCard({
  application,
  onChange,
}: {
  application: Application;
  onChange: (a: Application) => void;
}) {
  const { jobPosting: job, profile } = application;
  const [draft, setDraft] = useState(application.draftContent);
  const [subject, setSubject] = useState(application.draftSubject ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState(job.contactEmail ?? "");
  const [copied, setCopied] = useState(false);

  const dirty =
    draft !== application.draftContent ||
    subject !== (application.draftSubject ?? "");
  const pending = application.status === "pendiente_revision";
  const score = job.matchScore;
  const hasPlaceholder = draft.includes("[Tu nombre]");

  async function save(status?: Status) {
    setBusy(true);
    setError(null);
    try {
      onChange(
        await updateApplication(application.id, {
          draftContent: draft,
          draftSubject: subject || null,
          ...(status && { status }),
        }),
      );
    } catch {
      setError("No se ha podido guardar. ¿Está el servidor en marcha?");
    } finally {
      setBusy(false);
    }
  }

  const validTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar: selecciona el texto del borrador y cópialo a mano.");
    }
  }

  async function sendEmail() {
    if (!window.confirm(`¿Enviar esta candidatura a ${to.trim()} con el CV «${profile.name}» adjunto?\n\nEsta acción no se puede deshacer.`)) return;
    setBusy(true);
    setError(null);
    try {
      // Primero se guardan las ediciones del borrador, para enviar exactamente lo que ves.
      if (dirty) await updateApplication(application.id, { draftContent: draft, draftSubject: subject || null });
      onChange(await sendApplicationEmail(application.id, to.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card ${pending ? "" : "card-done"}`}>
      <header className="card-head">
        <div>
          <h2>{job.title.replace("[DEMO] ", "")}</h2>
          <p className="muted">
            {job.company?.name ?? job.companyName ?? "Empresa sin identificar"}
            {job.location && ` · ${job.location}`}
          </p>
        </div>
        {score !== null && (
          <div className={`score score-${scoreLevel(score)}`} title="Afinidad con el perfil">
            <strong>{Math.round(score)}</strong>
            <span>%</span>
          </div>
        )}
      </header>

      <div className="tags">
        {job.title.startsWith("[DEMO]") && <span className="tag tag-demo">Demo</span>}
        <span className="tag">{SOURCE_LABEL[job.source]}</span>
        <span className="tag tag-profile">{profile.name}</span>
        <span className="tag">
          {application.method === "email" ? "Por email" : application.method === "manual" ? "La solicitas tú" : "Formulario"}
        </span>
      </div>

      {job.description && <p className="desc">{job.description}</p>}
      {application.notes && <p className="note">{application.notes}</p>}

      {application.method === "email" && (
        <label className="field">
          Asunto
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!pending}
          />
        </label>
      )}
      {application.method === "email" && (
        <label className="field">
          Destinatario
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} disabled={!pending}
            placeholder="email de contacto de la oferta" />
        </label>
      )}
      <label className="field">
        Borrador
        <textarea
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!pending}
        />
      </label>

      {pending && hasPlaceholder && (
        <p className="warn">
          Falta tu nombre en la firma: escríbelo en «Cuentas y CV» (para los borradores nuevos) o edítalo aquí.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <footer className="actions">
        <a href={job.url} target="_blank" rel="noreferrer" className="link">
          Ver oferta ↗
        </a>
        <span className="spacer" />
        {pending ? (
          <>
            {dirty && (
              <button className="btn" disabled={busy} onClick={() => save()}>
                Guardar cambios
              </button>
            )}
            <button className="btn btn-danger" disabled={busy} onClick={() => save("rechazada")}>
              Descartar
            </button>
            {application.method === "manual" ? (
              <>
                <button className="btn" disabled={busy} onClick={() => save("enviada")}
                  title="Cuando ya hayas solicitado la oferta en LinkedIn">
                  Ya la solicité
                </button>
                <button className="btn" onClick={copyDraft}>{copied ? "¡Copiado!" : "Copiar borrador"}</button>
                <a className="btn btn-primary" href={job.url} target="_blank" rel="noreferrer">Abrir en LinkedIn ↗</a>
              </>
            ) : application.method === "email" ? (
              <>
                <button className="btn" disabled={busy} onClick={() => save("enviada")}
                  title="Solo cambia el estado, sin enviar nada: úsalo si ya la mandaste por tu cuenta">
                  Ya la envié yo
                </button>
                <button className="btn btn-primary" disabled={busy || !validTo} onClick={sendEmail}>
                  Enviar email
                </button>
              </>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={() => save("enviada")}
                title="Solo cambia el estado; el autofill con el navegador llegará más adelante">
                Marcar como enviada
              </button>
            )}
          </>
        ) : (
          <button className="btn" disabled={busy} onClick={() => save("pendiente_revision")}>
            Volver a pendientes
          </button>
        )}
      </footer>
    </article>
  );
}
