# Arrancar, parar o ver el estado de JobSearchApp en Windows.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\web.ps1 [start|stop|status]
param([ValidateSet('start', 'stop', 'status')][string]$Accion = 'status')

$ports = 3001, 5173
$listen = { Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue }

switch ($Accion) {
  'start' { & (Join-Path $PSScriptRoot 'desktop\jsa.ps1') }
  'stop' {
    $pids = (& $listen).OwningProcess | Sort-Object -Unique
    if (-not $pids) { Write-Host 'No estaba en marcha.'; break }
    # El árbol entero (npm, concurrently, tsx, vite): si queda uno, retiene el puerto.
    foreach ($p in $pids) { taskkill /PID $p /T /F | Out-Null }
    Write-Host 'Parado.'
  }
  'status' {
    foreach ($port in $ports) {
      $c = & $listen | Where-Object LocalPort -eq $port | Select-Object -First 1
      $estado = if ($c) { "en marcha (PID $($c.OwningProcess))" } else { 'parado' }
      Write-Host "Puerto ${port}: $estado"
    }
  }
}
