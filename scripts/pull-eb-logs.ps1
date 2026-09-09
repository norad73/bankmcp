# Pull all BankConnector logs (all banks) into logs/render-YYYY-MM-DD.txt
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "logs"
$render = Join-Path $env:LOCALAPPDATA "Programs\render\render.exe"
$service = "srv-dagi9915efls73anctm0"
$date = Get-Date -Format "yyyy-MM-dd"
$outFile = Join-Path $outDir "render-$date.txt"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$header = @(
  "# BankConnector logs - $date"
  "# Service: $service"
  "# Includes all banks ([bank] app + [bank-eb] Enable Banking diagnostics)"
  ""
)

$header | Out-File -Encoding utf8 $outFile

# [bank matches both [bank ...] and [bank-eb] lines
& $render logs -r $service --text "[bank" --limit 500 -o text 2>&1 |
  Out-File -Encoding utf8 -Append $outFile

Write-Host "Saved logs to $outFile"
