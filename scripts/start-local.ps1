$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$backendPath  = Join-Path $root 'backend'
$frontendPath = Join-Path $root 'frontend'
$planHubPath  = Join-Path $root 'Plan HUB'
$planPtPath   = Join-Path $root 'Plan PT'

# Load PLAN_API_KEY from backend .env (used by Flask apps and Vite proxy header injection)
$planApiKey = ''
$envFile = Join-Path $backendPath '.env'
if (Test-Path $envFile) {
  $planApiKey = (Get-Content $envFile | Select-String '^PLAN_API_KEY=').ToString().Split('=',2)[1]
}
if ($planApiKey) { $env:PLAN_API_KEY = $planApiKey }

#  [1/6] Stop existing processes 
Write-Host '[1/6] Stopping existing Node.js + Python processes...'
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

foreach ($port in @(4019, 8000)) {
  $lines = netstat -ano 2>&1 | Select-String "LISTENING" | Where-Object { $_ -match ":$port\s" }
  $pids = @()
  foreach ($line in $lines) {
    $pid2 = ($line -split '\s+')[-1]
    if ($pid2 -match '^\d+$') { $pids += [int]$pid2 }
  }
  foreach ($pid2 in ($pids | Select-Object -Unique)) {
    $proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "   Stopping $($proc.Name) PID=$pid2 (port $port)"
    } else {
      Write-Host "   Stopping PID=$pid2 (port $port)"
    }
    Stop-Process -Id $pid2 -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Milliseconds 500

#  [2/6] Backend 
Write-Host '[2/6] Starting backend...'
if (-not (Test-Path $backendPath)) { Write-Host "FAIL: Backend path not found: $backendPath"; exit 1 }
try {
  Write-Host '      Building TypeScript...'
  $build = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'npm', 'run', 'build') -WorkingDirectory $backendPath -Wait -PassThru -NoNewWindow
  if ($build.ExitCode -ne 0) { Write-Host "FAIL: Build failed (exit $($build.ExitCode))"; exit 1 }
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'npm', 'start') -WorkingDirectory $backendPath | Out-Null
} catch {
  Write-Host "FAIL: Backend: $($_.Exception.Message)"; exit 1
}

#  [3/6] Frontend 
Write-Host '[3/6] Starting frontend...'
if (-not (Test-Path $frontendPath)) { Write-Host "FAIL: Frontend path not found: $frontendPath"; exit 1 }
try {
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173', '--strictPort') -WorkingDirectory $frontendPath | Out-Null
} catch {
  Write-Host "FAIL: Frontend: $($_.Exception.Message)"; exit 1
}

#  [4/6] Wait for main services 
Write-Host '[4/6] Waiting for backend (4550) + frontend (5173)...'
$backendReady = $false
$frontendReady = $false
for ($i = 0; $i -lt 30; $i++) {
  if (-not $backendReady) {
    try {
      $null = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4550/api/auth/login' -Method Get
    } catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { $backendReady = $true }
    }
  }
  if (-not $frontendReady) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173'
      if ($r.StatusCode -eq 200) { $frontendReady = $true }
    } catch { }
  }
  if ($backendReady -and $frontendReady) { break }
  Start-Sleep -Milliseconds 500
}

#  [5/6] Plan HUB (port 8000) 
Write-Host '[5/6] Starting Plan HUB (port 8000)...'
if (Test-Path $planHubPath) {
  try {
    $pyExe = 'python'
    try { $null = & python --version 2>&1 } catch { $pyExe = 'python3' }
    $hubEnv = [System.Diagnostics.ProcessStartInfo]::new()
    $hubEnv.FileName = $pyExe
    $hubEnv.Arguments = 'app.py'
    $hubEnv.WorkingDirectory = $planHubPath
    $hubEnv.UseShellExecute = $false
    $hubEnv.CreateNoWindow = $true
    $hubEnv.RedirectStandardOutput = $true
    $hubEnv.RedirectStandardError = $true
    $hubEnv.EnvironmentVariables['PLAN_API_KEY'] = $planApiKey
    $hubProc = [System.Diagnostics.Process]::Start($hubEnv)
    $hubProc.StandardOutput.BaseStream.CopyToAsync([System.IO.File]::Create((Join-Path $planHubPath 'stdout.log'))) | Out-Null
    $hubProc.StandardError.BaseStream.CopyToAsync([System.IO.File]::Create((Join-Path $planHubPath 'stderr.log')))  | Out-Null
    $hubReady = $false
    for ($i = 0; $i -lt 10; $i++) {
      Start-Sleep -Milliseconds 500
      $chk = netstat -ano 2>&1 | Select-String ":8000\s"
      if ($chk) { $hubReady = $true; break }
    }
    if ($hubReady) { Write-Host '   OK: Plan HUB -> http://127.0.0.1:8000/' }
    else           { Write-Host '   WARN: Plan HUB did not bind within 5s. Check Plan HUB\stderr.log' }
  } catch {
    Write-Host "   WARN: Plan HUB: $($_.Exception.Message)"
  }
} else {
  Write-Host "   WARN: Plan HUB folder not found: $planHubPath"
}

#  [6/6] Plan PT (port 4019) 
Write-Host '[6/6] Starting Plan PT (port 4019)...'
if (Test-Path $planPtPath) {
  try {
    $pyExe = 'python'
    try { $null = & python --version 2>&1 } catch { $pyExe = 'python3' }
    $ptEnv = [System.Diagnostics.ProcessStartInfo]::new()
    $ptEnv.FileName = $pyExe
    $ptEnv.Arguments = 'app.py'
    $ptEnv.WorkingDirectory = $planPtPath
    $ptEnv.UseShellExecute = $false
    $ptEnv.CreateNoWindow = $true
    $ptEnv.RedirectStandardOutput = $true
    $ptEnv.RedirectStandardError = $true
    $ptEnv.EnvironmentVariables['PLAN_API_KEY'] = $planApiKey
    $ptProc = [System.Diagnostics.Process]::Start($ptEnv)
    $ptProc.StandardOutput.BaseStream.CopyToAsync([System.IO.File]::Create((Join-Path $planPtPath 'stdout.log'))) | Out-Null
    $ptProc.StandardError.BaseStream.CopyToAsync([System.IO.File]::Create((Join-Path $planPtPath 'stderr.log')))  | Out-Null
    $ptReady = $false
    for ($i = 0; $i -lt 10; $i++) {
      Start-Sleep -Milliseconds 500
      $chk = netstat -ano 2>&1 | Select-String ":4019\s"
      if ($chk) { $ptReady = $true; break }
    }
    if ($ptReady) { Write-Host '   OK: Plan PT -> http://127.0.0.1:4019/' }
    else          { Write-Host '   WARN: Plan PT did not bind within 5s. Check Plan PT\stderr.log' }
  } catch {
    Write-Host "   WARN: Plan PT: $($_.Exception.Message)"
  }
} else {
  Write-Host "   WARN: Plan PT folder not found: $planPtPath"
}

#  Final status 
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress -First 1)

Write-Host ''
if ($backendReady -and $frontendReady) {
  Write-Host 'OK: Main app ready -> http://127.0.0.1:5173/'
  if ($lanIp) { Write-Host "OK: LAN          -> http://$lanIp`:5173/" }
} else {
  Write-Host 'WARN: Main app startup incomplete. Check backend/frontend windows.'
}
Write-Host ''
Write-Host 'Planning tools (via proxy):'
Write-Host '   Plan HUB -> http://127.0.0.1:5173/plan-hub/'
Write-Host '   Plan PT  -> http://127.0.0.1:5173/plan-pt/'
if ($lanIp) {
  Write-Host "   Plan HUB (LAN) -> http://$lanIp`:5173/plan-hub/"
  Write-Host "   Plan PT  (LAN) -> http://$lanIp`:5173/plan-pt/"
}