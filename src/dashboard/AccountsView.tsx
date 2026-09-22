import { useEffect, useState, type FormEvent } from "react";
import {
  getAccounts, getSettings, listProfiles, removeSmtp, saveSettings, saveSmtp, testSmtp, uploadCv,
} from "./client.js";
import type { ProfileCv, SmtpStatus } from "./types.js";

type Msg = { kind: "ok" | "error"; text: string } | null;
const errText = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

function Feedback({ msg }: { msg: Msg }) {
  return msg ? <p className={msg.kind === "ok" ? "ok" : "error"}>{msg.text}</p> : null;
}

function NameSection() {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => void getSettings().then((s) => setName(s.applicantName), () => {}), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await saveSettings(name);
      setMsg({ kind: "ok", text: "Guardado. Se usará en los borradores nuevos." });
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  }
  return (
    <section className="card">
      <h2>Tu nombre</h2>
      <p className="muted">Es la firma de los borradores y el nombre del remitente.</p>
      <form onSubmit={submit} className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" />
        <button className="btn btn-primary" type="submit">Guardar</button>
      </form>
      <Feedback msg={msg} />
    </section>
  );
}

const GMAIL = { host: "smtp.gmail.com", port: 465 };

function EmailSection() {
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [host, setHost] = useState(GMAIL.host);
  const [port, setPort] = useState(String(GMAIL.port));
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    getAccounts().then(({ smtp }) => {
      setStatus(smtp);
      if (smtp.connected) {
        setHost(smtp.host);
        setPort(String(smtp.port));
        setUser(smtp.user);
      }
    }, () => setMsg({ kind: "error", text: "No se puede conectar con el servidor." }));
  }, []);

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await action();
      if (text) setMsg({ kind: "ok", text });
    } catch (e) {
      setMsg({ kind: "error", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      setStatus(await saveSmtp({ host, port: Number(port), user, pass: pass || undefined }));
      setPass("");
      return "Guardado en el llavero de macOS. Pulsa «Probar conexión» para comprobarlo.";
    });
  };

  return (
    <section className="card">
      <header className="card-head">
        <h2>Email para enviar candidaturas</h2>
        <span className={`tag ${status?.connected ? "tag-ok" : ""}`}>{status?.connected ? "Conectado" : "Sin conectar"}</span>
      </header>
      <p className="muted">
        Gmail: activa la verificación en dos pasos y crea una{" "}
        <a className="link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">contraseña de aplicación</a>.
        No uses tu contraseña normal: esta se puede revocar sin cambiar la tuya.
      </p>
      <form onSubmit={save} className="grid">
        <label className="field">Servidor
          <input value={host} onChange={(e) => setHost(e.target.value)} required />
        </label>
        <label className="field">Puerto
          <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" required />
        </label>
        <label className="field">Usuario (tu email)
          <input type="email" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" required />
        </label>
        <label className="field">Contraseña de aplicación
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password"
            placeholder={status?.connected ? "•••••• (guardada)" : ""} />
        </label>
        <div className="actions span">
          <button className="btn btn-primary" type="submit" disabled={busy}>Guardar</button>
          <button className="btn" type="button" disabled={busy || !status?.connected}
            onClick={() => run(async () => { await testSmtp(); return "Conexión correcta. No se ha enviado ningún correo."; })}>
            Probar conexión
          </button>
          <span className="spacer" />
          <button className="btn btn-danger" type="button" disabled={busy || !status?.connected}
            onClick={() => window.confirm("¿Borrar la cuenta de email del llavero?") &&
              run(async () => { setStatus(await removeSmtp()); setPass(""); return "Cuenta desconectada."; })}>
            Desconectar
          </button>
        </div>
      </form>
      <Feedback msg={msg} />
    </section>
  );
}

function CvSection() {
  const [profiles, setProfiles] = useState<ProfileCv[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = () => listProfiles().then(setProfiles, () => {});
  useEffect(() => void load(), []);

  async function upload(slug: string, file: File | undefined) {
    if (!file) return;
    setMsg(null);
    try {
      await uploadCv(slug, file);
      setMsg({ kind: "ok", text: "CV subido." });
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: errText(e) });
    }
  }
  return (
    <section className="card">
      <h2>Mis CV</h2>
      <p className="muted">Un PDF por perfil (máx. 10 MB). Se adjunta al enviar candidaturas de ese perfil.</p>
      {profiles?.map((p) => (
        <div className="cv-row" key={p.slug}>
          <div>
            <strong>{p.name}</strong>
            <div className={p.hasCv ? "muted" : "warn"}>{p.hasCv ? `Subido · ${Math.max(1, Math.round(p.cvBytes / 1024))} KB` : "Falta el CV"}</div>
          </div>
          <label className="btn">
            {p.hasCv ? "Reemplazar" : "Subir PDF"}
            <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { void upload(p.slug, e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      ))}
      <Feedback msg={msg} />
    </section>
  );
}

export function AccountsView() {
  return (
    <div className="list">
      <NameSection />
      <EmailSection />
      <CvSection />
      <section className="card">
        <h2>Otras cuentas</h2>
        <p className="muted"><strong>InfoJobs</strong> · próximamente: se conectará con OAuth2, escribiendo tu contraseña solo en la web de InfoJobs.</p>
        <p className="muted"><strong>LinkedIn</strong> · no se conecta, a propósito: automatizarlo viola sus condiciones y pone en riesgo tu cuenta. Se usa a mano desde la pestaña «LinkedIn».</p>
      </section>
      <section className="card">
        <h2>Dónde se guardan tus datos</h2>
        <p className="muted">
          Las contraseñas van al <strong>llavero de macOS</strong> (cifrado por el sistema), nunca a un archivo, a GitHub ni de vuelta a esta pantalla.
          El servidor solo acepta conexiones de este mismo Mac. Nada sale de tu equipo salvo el correo que tú envías.
        </p>
      </section>
    </div>
  );
}
