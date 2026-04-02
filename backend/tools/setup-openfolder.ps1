# setup-openfolder.ps1
# Run this ONCE on each user's PC (as Administrator) to enable
# the "openfolder:" URL protocol.  After setup, clicking a folder
# button in the web app will open Explorer on THEIR machine.
#
# Usage:  Right-click > Run with PowerShell  (or run as Admin in terminal)

$ErrorActionPreference = 'Stop'

# -- 1) Copy the handler script ---
$toolDir = 'C:\NSK-Tools'
if (-not (Test-Path $toolDir)) { New-Item -ItemType Directory -Path $toolDir -Force | Out-Null }

$vbsSrc  = Join-Path $PSScriptRoot 'openfolder.vbs'
$vbsDest = Join-Path $toolDir      'openfolder.vbs'

if (Test-Path $vbsSrc) {
    Copy-Item $vbsSrc $vbsDest -Force
    Write-Host "[OK] Copied openfolder.vbs -> $vbsDest" -ForegroundColor Green
} else {
    Write-Host "[WARN] openfolder.vbs not found next to this script. Creating it..." -ForegroundColor Yellow
    # Inline fallback - create the VBS directly
    @'
If WScript.Arguments.Count = 0 Then WScript.Quit
Dim raw : raw = WScript.Arguments(0)
If Left(LCase(raw), 11) = "openfolder:" Then raw = Mid(raw, 12)
Do While Left(raw, 1) = "/" : raw = Mid(raw, 2) : Loop
raw = Replace(raw, "%20", " ")
raw = Replace(raw, "%5C", "\")
raw = Replace(raw, "%2F", "/")
raw = Replace(raw, "%3A", ":")
raw = Replace(raw, "%23", "#")
raw = Replace(raw, "%25", "%")
If Right(raw, 1) = "/" Or Right(raw, 1) = "\" Then raw = Left(raw, Len(raw) - 1)
If Len(raw) > 0 Then CreateObject("WScript.Shell").Run "explorer.exe """ & raw & """", 1, False
'@ | Set-Content -Path $vbsDest -Encoding ASCII
    Write-Host "[OK] Created $vbsDest" -ForegroundColor Green
}

# -- 2) Register the openfolder: protocol in the registry ---
# Try HKLM first (all users), fall back to HKCU (current user only)
$regBase = $null
try {
    $testPath = 'HKLM:\SOFTWARE\Classes\openfolder'
    New-Item -Path $testPath -Force -ErrorAction Stop | Out-Null
    $regBase = 'HKLM:\SOFTWARE\Classes\openfolder'
    Write-Host "[OK] Using HKLM (all users on this PC)" -ForegroundColor Green
} catch {
    $regBase = 'HKCU:\SOFTWARE\Classes\openfolder'
    New-Item -Path $regBase -Force | Out-Null
    Write-Host "[OK] Using HKCU (current user, no admin needed)" -ForegroundColor Yellow
}

# Root key
Set-ItemProperty -Path $regBase -Name '(Default)' -Value 'URL:Open Folder Protocol'
Set-ItemProperty -Path $regBase -Name 'URL Protocol' -Value ''

# shell\open\command
$cmdPath = "$regBase\shell\open\command"
New-Item -Path $cmdPath -Force | Out-Null
Set-ItemProperty -Path $cmdPath -Name '(Default)' -Value "wscript.exe `"$vbsDest`" `"%1`""

Write-Host "[OK] Registered openfolder: protocol in registry" -ForegroundColor Green
Write-Host ""
Write-Host "Setup complete!  You can now close this window." -ForegroundColor Cyan
Write-Host "Folder buttons in the web app will open Explorer on this PC." -ForegroundColor Cyan
Write-Host ""
pause
