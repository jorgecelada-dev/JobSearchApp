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
