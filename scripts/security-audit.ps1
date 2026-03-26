$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $root 'IATF\backend'
$envFile     = Join-Path $backendPath '.env'
$envContent  = if(Test-Path $envFile){ Get-Content $envFile }else{ @() }
$pass=0; $fail=0

function Check($num,$label,$ok){
  $mark = if($ok){"[PASS]"}else{"[FAIL]"}
  Write-Host "$mark  [$num] $label"
  if($ok){$script:pass++}else{$script:fail++}
}

Write-Host ""
Write-Host "=================================================="
Write-Host "  NSK IATF DocControl — Security Audit"
Write-Host "=================================================="

# 1 — JWT secret length
$jwt = ($envContent | Select-String '^JWT_SECRET=').ToString().Split('=',2)[1]
Check 1 "JWT_SECRET length >= 64 chars (actual: $($jwt.Length))" ($jwt.Length -ge 64)

# 2 — No hardcoded secret in compiled config
$hard = Select-String -Path (Join-Path $backendPath 'dist\config\config.js') -Pattern 'NSK_IATF|dev-secret' -Quiet
Check 2 "No hardcoded secrets in dist/config/config.js" (-not $hard)

# 3 — No dev-secret fallback anywhere in dist
$devs = Get-ChildItem (Join-Path $backendPath 'dist') -Recurse -Filter '*.js' |
        Select-String 'dev-secret' | Select-Object -First 1
Check 3 "No 'dev-secret' fallback in any dist/*.js" (-not $devs)

# 4 — Helmet headers
try { Invoke-WebRequest -Uri 'http://127.0.0.1:4550/api/auth/login' -Method POST -Body '{}' -Headers @{'Content-Type'='application/json'} -UseBasicParsing | Out-Null } catch { $r4=$_.Exception.Response }
$xfo  = if($r4){ $r4.GetResponseHeader('x-frame-options') }else{''}
$xcto = if($r4){ $r4.GetResponseHeader('x-content-type-options') }else{''}
Check 4 "Helmet: X-Frame-Options=SAMEORIGIN, X-Content-Type-Options=nosniff" ($xfo -eq 'SAMEORIGIN' -and $xcto -eq 'nosniff')

# 5 — CORS allows configured origin
try { Invoke-WebRequest -Uri 'http://127.0.0.1:4550/api/auth/login' -Method POST -Body '{}' -Headers @{'Content-Type'='application/json';'Origin'='http://localhost:5173'} -UseBasicParsing | Out-Null } catch { $r5=$_.Exception.Response }
$acao5 = if($r5){ $r5.GetResponseHeader('access-control-allow-origin') }else{''}
Check 5 "CORS allows http://localhost:5173 (got: '$acao5')" ($acao5 -eq 'http://localhost:5173')

# 6 — CORS blocks evil origin
try { Invoke-WebRequest -Uri 'http://127.0.0.1:4550/api/auth/login' -Method POST -Body '{}' -Headers @{'Content-Type'='application/json';'Origin'='http://evil.com'} -UseBasicParsing | Out-Null } catch { $r6=$_.Exception.Response }
$acao6 = if($r6){ $r6.GetResponseHeader('access-control-allow-origin') }else{''}
Check 6 "CORS blocks http://evil.com (header is empty: $(if(-not $acao6){'YES'}else{"NO: '$acao6'"}))" (-not $acao6)

# 7 — Rate limiting on login
$blocked=0
for($i=1;$i -le 12;$i++){
  try{ Invoke-WebRequest -Uri 'http://127.0.0.1:4550/api/auth/login' -Method POST -Body '{"employee_code":"brute","password":"force"}' -Headers @{'Content-Type'='application/json'} -UseBasicParsing | Out-Null }
  catch{ if($_.Exception.Response.StatusCode.value__ -eq 429){$blocked++} }
}
Check 7 "Rate limiter blocks login after 10 attempts (got $blocked x 429)" ($blocked -gt 0)

# 8 — Plan HUB POST blocked without key
try { $r8=(Invoke-WebRequest -Uri 'http://127.0.0.1:8000/plan-hub-api/schedule' -Method POST -Body '{}' -Headers @{'Content-Type'='application/json'} -UseBasicParsing); $c8=$r8.StatusCode } catch { $c8=$_.Exception.Response.StatusCode.value__ }
Check 8 "Plan HUB: POST without API key → 401 (got $c8)" ($c8 -eq 401)

# 9 — Plan PT POST blocked without key
try { $r9=(Invoke-WebRequest -Uri 'http://127.0.0.1:4019/plan-pt-api/schedule' -Method POST -Body '{}' -Headers @{'Content-Type'='application/json'} -UseBasicParsing); $c9=$r9.StatusCode } catch { $c9=$_.Exception.Response.StatusCode.value__ }
Check 9 "Plan PT: POST without API key → 401 (got $c9)" ($c9 -eq 401)

# 10 — Plan HUB API-key check (NO DATA WRITE)
$apiKey = ($envContent | Select-String '^PLAN_API_KEY=').ToString().Split('=',2)[1]
try { $r10=(Invoke-WebRequest -Uri 'http://127.0.0.1:8000/plan-hub-api/auth-check' -Method GET -Headers @{'X-API-Key'=$apiKey} -UseBasicParsing); $c10=$r10.StatusCode } catch { $c10=$_.Exception.Response.StatusCode.value__ }
Check 10 "Plan HUB: auth-check with correct API key → 200 (got $c10)" ($c10 -eq 200)

# 11 — .gitignore protects .env
$gi = if(Test-Path (Join-Path $backendPath '.gitignore')){ Get-Content (Join-Path $backendPath '.gitignore') }else{@()}
$prot = $gi | Where-Object { $_ -match '^\.env$|^\*\.env' }
Check 11 ".gitignore exists and protects .env" ($prot.Count -gt 0)

# 12 — Cookie secure flag tied to NODE_ENV
$cjs = Join-Path $backendPath 'dist\controllers\authController.js'
$csec = if(Test-Path $cjs){ Select-String -Path $cjs -Pattern 'NODE_ENV.*production|production.*NODE_ENV' -Quiet }else{$false}
Check 12 "Auth cookie: secure flag uses NODE_ENV (not hardcoded false)" ($csec)

Write-Host ""
Write-Host "=================================================="
$color = if($fail -eq 0){"Green"}else{"Yellow"}
Write-Host "  RESULT:  $pass / $($pass+$fail) PASSED   ($fail failed)" -ForegroundColor $color
Write-Host "==================================================" -ForegroundColor $color
Write-Host ""
