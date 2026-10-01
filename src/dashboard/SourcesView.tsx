import { useEffect, useRef, useState, type FormEvent } from "react";
import { forgetSourceCredentials, getSources, getRefreshStatus, saveSearchLocation, saveSourceCredentials, setSourceEnabled, startRefresh } from "./client.js";
import type { LeadSource, RefreshStatus } from "./types.js";

type Msg = { kind: "ok" | "error"; text: string } | null;
const errText = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "nunca");

const STATE_LABEL: Record<RefreshStatus["sources"][number]["state"], string> = {
  pendiente: "En cola", buscando: "Buscando…", ok: "Hecho", error: "Error", "sin-claves": "Sin claves",
};

function Credentials({ source, onSaved }: { source: LeadSource; onSaved: (s: LeadSource[]) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      onSaved(await saveSourceCredentials(source.key, values));
      setValues({});
      setMsg({ kind: "ok", text: "Claves guardadas en el almacén seguro del sistema." });
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  }
  async function forget() {
    if (!window.confirm(`¿Olvidar las claves de ${source.label}?`)) return;
    try {
      onSaved(await forgetSourceCredentials(source.key));
      setMsg({ kind: "ok", text: "Claves borradas." });
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  }
  return (
    <form onSubmit={save} className="grid grid-even source-creds">
      {source.fields.map((f) => (
        <label className="field" key={f.name}>{f.label}
          <input type="password" autoComplete="off" value={values[f.name] ?? ""}
            placeholder={source.configured ? "•••••• (guardada)" : ""}
            onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
        </label>
      ))}
      <div className="actions span">
        <button className="btn" type="submit">Guardar claves</button>
        {source.signupUrl && <a className="link" href={source.signupUrl} target="_blank" rel="noreferrer">Conseguir claves</a>}
        <span className="spacer" />
        <button className="btn btn-danger" type="button" disabled={!source.configured} onClick={forget}>Olvidar claves</button>
      </div>
      {msg && <p className={`span ${msg.kind === "ok" ? "ok" : "error"}`}>{msg.text}</p>}
    </form>
  );
}

export function SourcesView({ onFinished }: { onFinished: () => void }) {
  const [sources, setSources] = useState<LeadSource[] | null>(null);
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [location, setLocation] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const timer = useRef<number | null>(null);

  const poll = () => {
    timer.current = window.setTimeout(async () => {
      try {
        const s = await getRefreshStatus();
        setStatus(s);
        if (s.running) return poll();
        setSources((await getSources()).sources);
        onFinished();
      } catch {
        poll();
      }
    }, 1500);
  };

  useEffect(() => {
    getSources().then((r) => {
      setSources(r.sources);
      setLocation(r.location);
      setStatus(r.status);
      if (r.status.running) poll();
    }, () => setMsg({ kind: "error", text: "No se puede conectar con el servidor." }));
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, []);

  async function refresh() {
    setMsg(null);
    try {
      setStatus(await startRefresh());
      poll();
    } catch (e) {
      setMsg({ kind: "error", text: errText(e) });
    }
  }

  async function toggle(s: LeadSource) {
    try {
      setSources(await setSourceEnabled(s.key, !s.enabled));
    } catch (e) {
      setMsg({ kind: "error", text: errText(e) });
    }
  }

  async function saveLocation(e: FormEvent) {
    e.preventDefault();
    try {
      setLocation((await saveSearchLocation(location)).location);
      setMsg({ kind: "ok", text: "Zona guardada para las próximas búsquedas." });
    } catch (err) {
      setMsg({ kind: "error", text: errText(err) });
    }
  }

  const running = !!status?.running;
  const active = sources?.filter((s) => s.enabled).length ?? 0;

  return (
    <div className="list">
      <section className="card">
        <header className="card-head">
          <div>
            <h2>Buscar leads</h2>
            <p className="muted">Busca en las fuentes encendidas ({active}), guarda lo nuevo y prepara borradores. Nada se envía.</p>
          </div>
          <button className="btn btn-primary" onClick={refresh} disabled={running || active === 0}>
            {running ? "Buscando…" : "Buscar leads ahora"}
          </button>
        </header>
        {status && status.sources.length > 0 && (
          <div className="result">
            {status.sources.map((s) => (
              <p key={s.key}>
                <strong>{s.label}</strong> · {STATE_LABEL[s.state]}
                {s.found !== undefined && ` · ${s.found} encontradas, ${s.created} nuevas`}
                {s.note && <span className="note-inline"> · {s.note}</span>}
              </p>
            ))}
            {!running && status.finishedAt && (
              <p className={status.error ? "error" : "ok"}>
                {status.error ? `Fallo: ${status.error}` : `Terminado (${when(status.finishedAt)}): ${status.drafted ?? 0} candidaturas nuevas en «Pendientes».`}
              </p>
            )}
          </div>
        )}
        <form onSubmit={saveLocation} className="row source-location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Zona de búsqueda" placeholder="Ciudad o provincia" />
          <button className="btn" type="submit">Guardar zona</button>
        </form>
        {msg && <p className={msg.kind === "ok" ? "ok" : "error"}>{msg.text}</p>}
      </section>

      {sources?.map((s) => (
        <section className={`card ${s.enabled ? "" : "card-off"}`} key={s.key}>
          <header className="card-head">
            <div>
              <h2>{s.label}</h2>
              <p className="muted">{s.description}</p>
            </div>
            <label className="switch">
              <input type="checkbox" role="switch" checked={s.enabled} onChange={() => toggle(s)} disabled={running} />
              <span>{s.enabled ? "Encendida" : "Apagada"}</span>
            </label>
          </header>
          <p className="note">
            Última búsqueda: {when(s.lastRunAt)}
            {s.lastFound !== null && ` · ${s.lastFound} encontradas, ${s.lastCreated} nuevas`}
            {s.lastError && <span className="error"> · {s.lastError}</span>}
            {s.fields.length > 0 && !s.configured && <span className="warn"> · Faltan las claves</span>}
          </p>
          {s.fields.length > 0 && <Credentials source={s} onSaved={setSources} />}
        </section>
      ))}
    </div>
  );
}
