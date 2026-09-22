#!/bin/bash
# Crea el acceso directo «JSA» (una app de macOS con su icono) en el Escritorio.
# Uso: scripts/desktop/install.sh [carpeta_destino]     (por defecto ~/Desktop)
# Si mueves el proyecto de carpeta, vuelve a ejecutarlo.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${1:-$HOME/Desktop}/JSA.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$HERE/JSA.icns" "$APP/Contents/Resources/JSA.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>JSA</string>
  <key>CFBundleDisplayName</key><string>JSA</string>
  <key>CFBundleIdentifier</key><string>local.jobsearchapp.launcher</string>
  <key>CFBundleExecutable</key><string>JSA</string>
  <key>CFBundleIconFile</key><string>JSA</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST

# Abre el lanzador en una ventana de Terminal, para ver los mensajes y poder pararlo.
cat > "$APP/Contents/MacOS/JSA" <<LAUNCH
#!/bin/bash
exec /usr/bin/open -a Terminal "$HERE/jsa.command"
LAUNCH
chmod +x "$APP/Contents/MacOS/JSA" "$HERE/jsa.command"

codesign --force --sign - "$APP" >/dev/null 2>&1 || true
touch "$APP"
echo "Creado: $APP"
