# Crea el acceso directo «JSA» (con su icono) en el Escritorio de Windows. Versión Windows de install.sh.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\desktop\install.ps1 [carpeta_destino]
# Si mueves el proyecto de carpeta, vuelve a ejecutarlo.
param([string]$Destino = [Environment]::GetFolderPath('Desktop'))

$here = $PSScriptRoot
$root = Resolve-Path (Join-Path $here '..\..')
$lnk = Join-Path $Destino 'JSA.lnk'

$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$here\jsa.ps1`""
$shortcut.WorkingDirectory = "$root"
$shortcut.IconLocation = "$here\JSA.ico,0"
$shortcut.Description = 'Arranca JobSearchApp (API + dashboard) y abre el navegador'
$shortcut.Save()
Write-Host "Creado: $lnk"
