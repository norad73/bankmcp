# Pull BankConnector / Enable Banking logs into logs/eurobank-usa-branch/
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "logs\eurobank-usa-branch"
$render = Join-Path $env:LOCALAPPDATA "Programs\render\render.exe"
$service = "srv-dagi9915efls73anctm0"
$date = Get-Date -Format "yyyy-MM-dd"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

& $render logs -r $service --text "[bank-eb" --limit 200 -o text 2>&1 |
  Out-File -Encoding utf8 (Join-Path $outDir "render-eb-$date.txt")

& $render logs -r $service --text "[bank" --limit 200 -o text 2>&1 |
  Out-File -Encoding utf8 (Join-Path $outDir "render-app-$date.txt")

Write-Host "Saved logs to $outDir"
