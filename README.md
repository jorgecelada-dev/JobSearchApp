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

## Abrirlo con un doble clic (macOS)

```bash
scripts/desktop/install.sh     # crea «JSA» en el Escritorio, con su icono
```

Al abrir JSA se abre una ventana de Terminal que arranca el proyecto y luego el navegador en http://localhost:5173. Para pararlo: `Ctrl+C` o cierra esa ventana. Si mueves el proyecto de carpeta, vuelve a ejecutar el instalador.

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

### Email de contacto y candidaturas espontáneas

Al revisar cada empresa (`scan`) se busca además su **mejor email para enviar un CV**: en la home, la página de empleo, contacto y aviso legal (máx. 3 peticiones extra). Puntúa `rrhh@`/`empleo@` y los que aparecen junto a «currículum» y descarta los de privacidad, ventas, soporte o RGPD. Solo lee páginas web (un PDF se ignora).

```bash
npm run companies -- spontaneous      # 1 candidatura espontánea por empresa con email fiable (confianza media o alta)
npm run companies -- spontaneous 10   # solo emails de RR. HH.
```

Salen como tarjetas pendientes, con el motivo y la página donde se halló el email. Nada se envía sin tu aprobación. El perfil se elige por la categoría con la que buscaste la empresa, así que **revisa cada tarjeta**: una búsqueda «tienda» puede traer negocios que no lo son. Los organismos públicos (colegios de educa.madrid.org, ayuntamientos…) se saltan.

**Desde LinkedIn:** si una empresa anuncia allí, en la pestaña LinkedIn (sección 3) das su nombre y su web y se hace el mismo recorrido sobre SU web (página de empleo, ATS, ofertas, email), opcionalmente con una candidatura espontánea. Si pegas la dirección de una página concreta de su web, se toma como su página de empleo. Muchas webs grandes bloquean el acceso automático (403) y otras no muestran ofertas legibles sin IA: en esos casos la herramienta te lo dice y tú abres la página.

Sin IA: la página de empleo se detecta por palabras clave, la ATS por su URL, y las ofertas se leen por la API JSON de la ATS (Greenhouse, Lever, Personio, Workable) o por datos JSON-LD / enlaces de la página. Las webs que cargan sus ofertas con JavaScript no se ven así: hay que indicar la URL a mano con `set-careers`.

## Portales de empleo

| Portal | Estado |
|---|---|
| InfoJobs | API oficial, pendiente de credenciales |
| Adzuna, Jooble | APIs con clave gratuita (límites por confirmar), pendientes |
| Superprof | **No es una fuente de ofertas**: tú publicas tu perfil y los alumnos te contactan. Se gestiona a mano |
| Indeed | Descartado: sus condiciones prohíben el scraping y ya no tiene API pública |
| LinkedIn | **Solo a mano** (pestaña «LinkedIn»): enlaces de búsqueda ya preparados, pegas las ofertas que te interesen y las solicitas tú. No se conecta tu cuenta ni se accede a su web |

## Esquema del proyecto

`docs/arquitectura.drawio` (2 páginas: flujo completo y modelo de datos). Ábrelo en [app.diagrams.net](https://app.diagrams.net) (Archivo → Abrir) o con la extensión «Draw.io Integration» de VS Code.
