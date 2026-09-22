#!/bin/zsh -l
# Arranca JobSearchApp (API + dashboard) y abre el navegador.
# Se ejecuta desde el acceso directo JSA del Escritorio, o a mano: scripts/desktop/jsa.command
# Para pararlo: Ctrl+C o cierra esta ventana. JSA_NO_BROWSER=1 evita abrir el navegador.

cd "${0:A:h}/../.." || exit 1
URL="http://localhost:5173"

pause() { echo; echo "Pulsa Enter para cerrar…"; read -r; }
is_ours() { curl -fs -m 2 "http://localhost:$1/" 2>/dev/null | grep -q "<title>JobSearchApp"; }

if is_ours 5173; then
  echo "JobSearchApp ya está en marcha: $URL"
  [[ -z $JSA_NO_BROWSER ]] && open "$URL"
  exit 0
fi

if ! command -v node >/dev/null; then
  echo "No encuentro Node.js. Instálalo desde https://nodejs.org (versión 22 o superior)."
  pause; exit 1
fi

[[ -f .env ]] || cp .env.example .env
[[ -d node_modules ]] || { echo "Primera vez: instalando dependencias…"; npm install || { pause; exit 1; }; }
[[ -f dev.db ]] || { echo "Primera vez: creando la base de datos…"; npx prisma migrate deploy && npm run -s db:seed || { pause; exit 1; }; }

echo "Arrancando JobSearchApp…  (Ctrl+C o cierra esta ventana para pararlo)"
echo

opened=""
FORCE_COLOR=0 NO_COLOR=1 npm run dev 2>&1 | while IFS= read -r line; do
  print -r -- "$line"
  clean=$(print -r -- "$line" | sed $'s/\x1b\\[[0-9;]*m//g')
  if [[ -z $opened && $clean =~ '(http://localhost:[0-9]+)' ]]; then
    opened=1
    if [[ -z $JSA_NO_BROWSER ]]; then ( sleep 2; open "${match[1]}" ) & fi
  fi
done
echo; echo "JobSearchApp se ha detenido."
