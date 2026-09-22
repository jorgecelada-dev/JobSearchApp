import { useEffect, useState, type FormEvent } from "react";
import { addLinkedInOffer, investigateCompany, linkedinSearches, listProfiles } from "./client.js";
import type { Application, InvestigateResult, LinkedInGroup, ProfileCv } from "./types.js";

export function LinkedInView({ onAdded, onChanged }: { onAdded: (a: Application) => void; onChanged: () => void }) {
  const [location, setLocation] = useState("Madrid, España");
  const [hours, setHours] = useState(24);
  const [groups, setGroups] = useState<LinkedInGroup[]>([]);
  const [profiles, setProfiles] = useState<ProfileCv[]>([]);
  const [form, setForm] = useState({ url: "", title: "", company: "", location: "", description: "", profileSlug: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [co, setCo] = useState({ name: "", website: "", profileSlug: "" });
  const [coBusy, setCoBusy] = useState(false);
  const [coError, setCoError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigateResult | null>(null);

  useEffect(() => void listProfiles().then(setProfiles, () => {}), []);
  useEffect(() => {
    const t = setTimeout(() => void linkedinSearches(location, hours).then(setGroups, () => {}), 300);
    return () => clearTimeout(t);
  }, [location, hours]);

  const name = (slug: string) => profiles.find((p) => p.slug === slug)?.name ?? slug;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function investigate(e: FormEvent) {
    e.preventDefault();
    setCoBusy(true);
    setCoError(null);
    setResult(null);
    try {
      setResult(await investigateCompany({ ...co, profileSlug: co.profileSlug || undefined }));
      onChanged();
    } catch (err) {
      setCoError(err instanceof Error ? err.message : "No se pudo investigar");
    } finally {
      setCoBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAdded(await addLinkedInOffer({ ...form, location: form.location || undefined, description: form.description || undefined, profileSlug: form.profileSlug || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo añadir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="list">
      <section className="card">
        <h2>LinkedIn, siempre a mano</h2>
        <p className="muted">
          LinkedIn prohíbe automatizar su uso y sancionaría tu cuenta, así que aquí no se conecta ni se entra en tu cuenta.
          Tú abres las búsquedas, pegas las ofertas que te interesen y las solicitas tú. Yo solo guardo el enlace y te preparo el borrador.
        </p>
      </section>

      <section className="card">
        <h2>1 · Abre búsquedas ya preparadas</h2>
        <div className="grid grid-even">
          <label className="field">Zona
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="field">Publicadas
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={24}>Últimas 24 h</option>
              <option value={168}>Última semana</option>
              <option value={0}>Cualquier fecha</option>
            </select>
          </label>
        </div>
        {groups.map((g) => (
          <div key={g.profile} className="search-group">
            <strong>{name(g.profile)}</strong>
            <div className="chips">
              {g.searches.map((s) => (
                <a key={s.url} className="chip" href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>2 · Guarda una oferta que te interese</h2>
        <p className="muted">Copia los datos de la oferta desde LinkedIn. Cuantos más detalles pegues en la descripción, mejor elijo el perfil.</p>
        <form onSubmit={submit}>
          <label className="field">Enlace de la oferta
            <input value={form.url} onChange={set("url")} placeholder="https://www.linkedin.com/jobs/view/…" required />
          </label>
          <div className="grid grid-even">
            <label className="field">Puesto
              <input value={form.title} onChange={set("title")} required />
            </label>
            <label className="field">Empresa
              <input value={form.company} onChange={set("company")} required />
            </label>
            <label className="field">Zona (opcional)
              <input value={form.location} onChange={set("location")} />
            </label>
            <label className="field">Perfil
              <select value={form.profileSlug} onChange={set("profileSlug")}>
                <option value="">Automático</option>
                {profiles.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <label className="field">Descripción (opcional, pégala tal cual)
            <textarea rows={5} value={form.description} onChange={set("description")} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>Añadir a pendientes</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>3 · Busca en la web de esa empresa</h2>
        <p className="muted">
          Muchas empresas que anuncian en LinkedIn tienen su propia página de empleo. Dime su web (no leo LinkedIn) y busco allí
          su página de empleo, sus ofertas y su mejor email de contacto.
        </p>
        <form onSubmit={investigate}>
          <div className="grid grid-even">
            <label className="field">Empresa
              <input value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} placeholder={form.company || "Nombre"} required />
            </label>
            <label className="field">Su web
              <input value={co.website} onChange={(e) => setCo({ ...co, website: e.target.value })} placeholder="https://empresa.com" required />
            </label>
          </div>
          <label className="field">Si encuentro un email, ¿preparo una candidatura espontánea con este perfil?
            <select value={co.profileSlug} onChange={(e) => setCo({ ...co, profileSlug: e.target.value })}>
              <option value="">No, solo dime qué encuentras</option>
              {profiles.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </label>
          {coError && <p className="error">{coError}</p>}
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={coBusy}>{coBusy ? "Buscando… (hasta 1 min)" : "Buscar en su web"}</button>
            {co.name && (
              <a className="link" target="_blank" rel="noreferrer"
                href={`https://www.google.com/search?q=${encodeURIComponent(`${co.name} empresa web oficial`)}`}>
                ¿No sabes su web? Búscala en Google ↗
              </a>
            )}
          </div>
        </form>
        {result && <ResultPanel r={result} />}
      </section>
    </div>
  );
}

function ResultPanel({ r }: { r: InvestigateResult }) {
  const { report } = r;
  return (
    <div className="result">
      <p><strong>Página de empleo:</strong> {report.careersUrl ? <a className="link" href={report.careersUrl} target="_blank" rel="noreferrer">{report.careersUrl}</a> : "no la he encontrado"}</p>
      {report.ats && <p><strong>Sistema de empleo:</strong> {report.ats}</p>}
      <p><strong>Ofertas:</strong> {report.found} encontradas, {report.created} nuevas{r.drafted > 0 && ` · ${r.drafted} candidatura(s) preparada(s) en Pendientes`}</p>
      <p><strong>Email:</strong> {r.email ? <>{r.email.address} <span className="tag">confianza {r.email.confidence}</span></> : "no he encontrado ninguno"}</p>
      {r.email?.note && <p className="note">{r.email.note}</p>}
      {r.spontaneous === "created" && <p className="ok">Candidatura espontánea creada en Pendientes.</p>}
      {r.spontaneous === "existing" && <p className="muted">Ya tenías una candidatura espontánea a esta empresa.</p>}
      {r.spontaneous === "no-email" && <p className="warn">No hay email, así que no he preparado candidatura espontánea.</p>}
      {report.note && <p className="warn">{report.note}</p>}
    </div>
  );
}
