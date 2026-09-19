import { useEffect, useMemo, useState } from "react";
import { listApplications } from "./client.js";
import { AccountsView } from "./AccountsView.js";
import { ApplicationCard } from "./ApplicationCard.js";
import { STATUS_LABEL, type Application, type Status } from "./types.js";
import "./styles.css";

const STATUSES: Status[] = ["pendiente_revision", "enviada", "entrevista", "rechazada"];

export function App() {
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<Status>("pendiente_revision");
  const [profile, setProfile] = useState<string>("all");
  const [view, setView] = useState<"applications" | "accounts">("applications");

  useEffect(() => {
    listApplications().then(setItems, () => setError(true));
  }, []);

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      pendiente_revision: 0, enviada: 0, entrevista: 0, rechazada: 0,
    };
    items?.forEach((a) => c[a.status]++);
    return c;
  }, [items]);

  const profiles = useMemo(() => {
    const map = new Map<string, string>();
    items?.forEach((a) => map.set(a.profile.slug, a.profile.name));
    return [...map];
  }, [items]);

  const visible = (items ?? []).filter(
    (a) => a.status === status && (profile === "all" || a.profile.slug === profile),
  );

  function replace(updated: Application) {
    setItems((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? prev);
  }

  return (
    <div className="page">
      <header className="top">
        <h1>JobSearchApp</h1>
        <p className="muted">Revisa cada candidatura antes de enviarla. Nada se envía solo.</p>
        <div className="views">
          <button className={`view ${view === "applications" ? "view-active" : ""}`} onClick={() => setView("applications")}>Candidaturas</button>
          <button className={`view ${view === "accounts" ? "view-active" : ""}`} onClick={() => setView("accounts")}>Cuentas y CV</button>
        </div>
      </header>

      {view === "accounts" ? <AccountsView /> : <>

      <nav className="tabs" aria-label="Estado">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`tab ${s === status ? "tab-active" : ""}`}
            onClick={() => setStatus(s)}
          >
            {STATUS_LABEL[s]} <span className="count">{counts[s]}</span>
          </button>
        ))}
      </nav>

      {profiles.length > 1 && (
        <div className="chips" aria-label="Perfil">
          {[["all", "Todos los perfiles"], ...profiles].map(([slug, name]) => (
            <button
              key={slug}
              className={`chip ${slug === profile ? "chip-active" : ""}`}
              onClick={() => setProfile(slug!)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="notice">
          No se puede conectar con el servidor. Arranca el proyecto con <code>npm run dev</code>.
        </div>
      )}
      {!error && items === null && <p className="muted">Cargando…</p>}
      {items && visible.length === 0 && (
        <div className="notice">No hay candidaturas en «{STATUS_LABEL[status]}».</div>
      )}

      <main className="list">
        {visible.map((a) => (
          <ApplicationCard key={a.id} application={a} onChange={replace} />
        ))}
      </main>
      </>}
    </div>
  );
}
