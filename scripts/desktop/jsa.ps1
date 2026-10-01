# Arranca JobSearchApp (API + dashboard) y abre el navegador. Versión Windows de jsa.command.
# Se ejecuta desde el acceso directo JSA del Escritorio, o a mano:
#   powershell -ExecutionPolicy Bypass -File scripts\desktop\jsa.ps1
# Para pararlo: Ctrl+C o cierra esta ventana. $env:JSA_NO_BROWSER = 1 evita abrir el navegador.

Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))
$Host.UI.RawUI.WindowTitle = 'JobSearchApp'
$URL = 'http://localhost:5173'

function Wait-Close { Write-Host ''; Read-Host 'Pulsa Enter para cerrar' | Out-Null }
function Test-Ours([int]$port) {
  try { (Invoke-WebRequest "http://localhost:$port/" -UseBasicParsing -TimeoutSec 2).Content -match '<title>JobSearchApp' } catch { $false }
}
function Open-Browser { if (-not $env:JSA_NO_BROWSER) { Start-Process $URL } }

if (Test-Ours 5173) {
  Write-Host "JobSearchApp ya está en marcha: $URL"
  Open-Browser
  exit 0
}

$busy = Get-NetTCPConnection -LocalPort 3001, 5173 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  $ports = ($busy.LocalPort | Sort-Object -Unique) -join ', '
  Write-Host "El puerto $ports ya lo usa otro programa (o un JobSearchApp a medio arrancar)."
  Write-Host 'Ciérralo, o ejecuta: powershell -ExecutionPolicy Bypass -File scripts\web.ps1 stop'
  Wait-Close; exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'No encuentro Node.js. Instálalo desde https://nodejs.org (versión 22 o superior).'
  Wait-Close; exit 1
}

if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path node_modules)) {
  Write-Host 'Primera vez: instalando dependencias…'
  npm install
  if ($LASTEXITCODE -ne 0) { Wait-Close; exit 1 }
}
if (-not (Test-Path dev.db)) {
  Write-Host 'Primera vez: creando la base de datos…'
  npx prisma migrate deploy
  if ($LASTEXITCODE -eq 0) { npm run -s db:seed }
  if ($LASTEXITCODE -ne 0) { Wait-Close; exit 1 }
}

Write-Host 'Arrancando JobSearchApp…  (Ctrl+C o cierra esta ventana para pararlo)'
Write-Host ''

$env:FORCE_COLOR = '0'; $env:NO_COLOR = '1'
$dev = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -NoNewWindow -PassThru

# Abre el navegador cuando el dashboard responde (máximo 2 minutos).
for ($i = 0; $i -lt 120 -and -not $dev.HasExited; $i++) {
  if (Test-Ours 5173) { Open-Browser; break }
  Start-Sleep -Seconds 1
}
$dev.WaitForExit()
Write-Host ''
Write-Host 'JobSearchApp se ha detenido.'
Wait-Close
