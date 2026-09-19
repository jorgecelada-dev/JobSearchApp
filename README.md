# JobSearchApp

Herramienta personal de automatización de búsqueda de empleo. Reúne ofertas de varias fuentes, las clasifica con IA contra 3 perfiles de CV y prepara un borrador de candidatura que se revisa y aprueba a mano en un dashboard. **Nunca hay envío sin revisión humana.**

## Stack

Node.js + TypeScript · Playwright · Prisma + SQLite · React (Vite) · SDK de Anthropic

## Estructura

```
prisma/          esquema, migraciones y seed de perfiles
src/scrapers/    InfoJobs (API), Jobtoday, empresas locales (Places, ATS, parser IA)
src/ai/          clasificación, borradores y parseo de ofertas con Claude
src/db/          cliente Prisma
src/dashboard/   dashboard React de revisión
cvs/             PDFs de los 3 CV (ignorados por git)
```

## Puesta en marcha

```bash
npm install
cp .env.example .env      # y rellena las claves
npx prisma migrate dev    # crea dev.db
npm run db:seed           # crea los 3 perfiles
npm run dashboard:dev
```

Coloca los CV en `cvs/` con los nombres que indica `prisma/seed.ts`.

## Notas

- LinkedIn no se automatiza (ToS): solo búsqueda manual o alertas.
- Jobtoday: scraping con retardo mínimo entre peticiones (`JOBTODAY_MIN_DELAY_MS`).
- Autofill con Playwright se detiene antes del envío salvo `AUTOFILL_AUTO_SUBMIT=true`.

## Desarrollo

```bash
npm run dev          # API (3001) + dashboard (5173)
npm run db:seed:demo # candidaturas de ejemplo, marcadas [DEMO]
```

## Cuentas, CV y envío de email

En el dashboard, pestaña **Cuentas y CV**: tu nombre (firma), tu cuenta de email y un PDF por perfil.

- **Gmail:** activa la verificación en dos pasos y crea una *contraseña de aplicación* (myaccount.google.com/apppasswords). No uses tu contraseña normal.
- **Dónde se guarda:** en el **llavero de macOS**, no en `.env`, ni en la BD, ni en git. La pantalla nunca muestra la contraseña guardada.
- **Seguridad:** el API solo escucha en `127.0.0.1` y rechaza `Host`/`Origin` que no sean locales.
- **Enviar:** en cada tarjeta por email, «Enviar email» pide confirmación y adjunta el CV de su perfil. Bloquea ofertas de demo, firma sin rellenar y doble envío.

## Empresas locales

```bash
npm run companies -- add "Academia X" https://academiax.es "Tres Cantos"
npm run companies -- osm "academia" "Tres Cantos"        # OpenStreetMap: gratis, sin clave
npm run companies -- search "academia" "Tres Cantos"     # Google Places: de pago, requiere GOOGLE_PLACES_API_KEY
npm run companies -- set-careers 1 https://jobs.lever.co/academiax  # si no la detecta sola
npm run companies -- scan            # revisa todas y guarda ofertas nuevas
npm run classify                     # clasifica y crea borradores
npm run scheduler                    # todos los días a las 07:00 (déjalo abierto)
npm run scheduler -- --now           # una revisión completa ahora mismo
```

Sin IA: la página de empleo se detecta por palabras clave, la ATS por su URL, y las ofertas se leen por la API JSON de la ATS (Greenhouse, Lever, Personio, Workable) o por datos JSON-LD / enlaces de la página. Las webs que cargan sus ofertas con JavaScript no se ven así: hay que indicar la URL a mano con `set-careers`.

## Esquema del proyecto

`docs/arquitectura.drawio` (2 páginas: flujo completo y modelo de datos). Ábrelo en [app.diagrams.net](https://app.diagrams.net) (Archivo → Abrir) o con la extensión «Draw.io Integration» de VS Code.
