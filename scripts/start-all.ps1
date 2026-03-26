# One-click start for backend + frontend
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $root "scripts\start-local.ps1"

if (-not (Test-Path $startScript)) {
  Write-Host "start-local.ps1 not found at $startScript" -ForegroundColor Red
  exit 1
}

& $startScript
