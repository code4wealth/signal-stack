<#
.SYNOPSIS
    Start the Signal Stack FastAPI backend and Next.js frontend in two Windows terminals.

.DESCRIPTION
    Starts uvicorn bound explicitly to 127.0.0.1:8000 (avoiding Windows localhost IPv6 ::1
    mismatch) in one PowerShell window and `npm run dev` (with BACKEND_URL=http://127.0.0.1:8000)
    in a second window, waits for http://127.0.0.1:8000/api/health to respond 200, and then
    opens the UI in the default browser.

    NOTE: Code-reviewed only on Linux; not yet executed on Windows.
#>
[CmdletBinding()]
param(
    [int]$WaitSeconds = 60,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$NodeModules = Join-Path $FrontendDir "node_modules"
$HealthUrl = "http://127.0.0.1:8000/api/health"
$FrontendUrl = "http://127.0.0.1:3000"

if (-not (Test-Path -LiteralPath $VenvPython)) {
    Write-Error "Backend venv not found at $VenvPython. Run scripts\setup_windows.ps1 first."
    exit 1
}

if (-not (Test-Path -LiteralPath $NodeModules)) {
    Write-Error "Frontend dependencies not installed ($NodeModules missing). Run: cd frontend; npm install"
    exit 1
}

# Run uvicorn WITHOUT --reload: SQLite writes to backend/signalstack.db* inside backend/
# trigger reload mid-request and abort long requests with empty-body 502s.
# If reload is needed while editing backend code, restrict it:
#   --reload --reload-dir . --reload-exclude "signalstack.db*" --reload-exclude "exports/*"
$backendCmd = "Set-Location -LiteralPath '$BackendDir'; & '$VenvPython' -m uvicorn main:app --host 127.0.0.1 --port 8000"
$frontendCmd = "Set-Location -LiteralPath '$FrontendDir'; `$env:BACKEND_URL = 'http://127.0.0.1:8000'; npm run dev"

Write-Host "==> Starting FastAPI backend on http://127.0.0.1:8000 ..."
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-Command", $backendCmd) | Out-Null

Write-Host "==> Starting Next.js frontend on $FrontendUrl ..."
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-Command", $frontendCmd) | Out-Null

Write-Host "==> Waiting for $HealthUrl (timeout ${WaitSeconds}s)..."
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3
        if ($resp.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    }
    catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $healthy) {
    Write-Error "Backend did not respond on $HealthUrl within ${WaitSeconds}s. Check the backend terminal window."
    exit 1
}

Write-Host "    Backend healthy on $HealthUrl"

# Give Next dev a brief window to bind :3000 before launching the browser.
$uiReady = $false
$uiDeadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $uiDeadline) {
    try {
        $uiResp = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 3
        if ($uiResp.StatusCode -lt 500) {
            $uiReady = $true
            break
        }
    }
    catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $uiReady) {
    Write-Warning "Frontend did not respond on $FrontendUrl yet; check the frontend terminal window."
}

if (-not $NoBrowser) {
    Write-Host "==> Opening $FrontendUrl ..."
    Start-Process $FrontendUrl | Out-Null
}
