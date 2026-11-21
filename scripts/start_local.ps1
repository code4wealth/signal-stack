<#
.SYNOPSIS
    Reliable Windows startup script for Signal Stack (no --reload, preflight & net diagnostics).

.DESCRIPTION
    1. Verifies Python 3.11+ and Node.js are installed.
    2. Creates backend\.venv if missing and installs backend\requirements.txt.
    3. Installs frontend dependencies (npm install) if frontend\node_modules is missing.
    4. Runs scripts\net_diag.py to verify outbound HTTPS / TLS connectivity.
    5. Starts FastAPI backend on 127.0.0.1:8000 WITHOUT --reload (ENABLE_SCHEDULER=1 only when -EnableScheduler is passed).
    6. Starts Next.js frontend on 127.0.0.1:3000 with BACKEND_URL=http://127.0.0.1:8000.
    7. Waits for http://127.0.0.1:8000/api/health and runs scripts\preflight.py.
    8. Prints exact next steps on any failure.

    NOTE: Code-reviewed on Linux; intended for Windows PowerShell 5.1+ / 7+.
#>
[CmdletBinding()]
param(
    [switch]$EnableScheduler,
    [switch]$NoBrowser,
    [int]$WaitSeconds = 60
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$VenvDir = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$ReqFile = Join-Path $BackendDir "requirements.txt"
$NodeModules = Join-Path $FrontendDir "node_modules"
$EnvExample = Join-Path $RepoRoot ".env.example"
$EnvFile = Join-Path $RepoRoot ".env"
$NetDiagScript = Join-Path $RepoRoot "scripts\net_diag.py"
$PreflightScript = Join-Path $RepoRoot "scripts\preflight.py"
$HealthUrl = "http://127.0.0.1:8000/api/health"
$FrontendUrl = "http://127.0.0.1:3000"

function Fail-WithNextSteps {
    param(
        [string]$Reason,
        [string[]]$NextSteps
    )
    Write-Host ""
    Write-Host "STARTUP FAILED: $Reason" -ForegroundColor Red
    Write-Host "Next steps:" -ForegroundColor Yellow
    foreach ($step in $NextSteps) {
        Write-Host "  - $step"
    }
    exit 1
}

# 1. Check Python 3.11+
Write-Host "==> Checking Python 3.11+..."
$pythonCmd = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $pyOut = & py -0p 2>&1
    foreach ($line in $pyOut) {
        if ($line.ToString() -match '^\s*-(?:V:)?(\d+)\.(\d+)(?:-[^\s]+)?(?:\s+\*)?\s+(.+?)\s*$') {
            $maj = [int]$Matches[1]; $min = [int]$Matches[2]; $exe = $Matches[3].Trim()
            if (($maj -gt 3 -or ($maj -eq 3 -and $min -ge 11)) -and (Test-Path -LiteralPath $exe)) {
                $pythonCmd = $exe
                break
            }
        }
    }
}
if (-not $pythonCmd -and (Get-Command python -ErrorAction SilentlyContinue)) {
    $ver = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    if ($ver -match '^(\d+)\.(\d+)$' -and ([int]$Matches[1] -gt 3 -or ([int]$Matches[1] -eq 3 -and [int]$Matches[2] -ge 11))) {
        $pythonCmd = (Get-Command python).Source
    }
}
if (-not $pythonCmd) {
    Fail-WithNextSteps -Reason "Python 3.11+ not found." -NextSteps @(
        "Install Python 3.11 or newer from https://www.python.org/downloads/ (include py launcher).",
        "Re-open PowerShell and run: .\scripts\start_local.ps1"
    )
}
Write-Host "    Found Python: $pythonCmd"

# 2. Check Node.js & npm
Write-Host "==> Checking Node.js and npm..."
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail-WithNextSteps -Reason "Node.js or npm not found on PATH." -NextSteps @(
        "Install Node.js 20 LTS from https://nodejs.org/",
        "Re-open PowerShell and run: .\scripts\start_local.ps1"
    )
}
$nodeVer = (& node -v).Trim()
Write-Host "    Found Node.js: $nodeVer"

# 3. Ensure .env exists
if (-not (Test-Path -LiteralPath $EnvFile) -and (Test-Path -LiteralPath $EnvExample)) {
    Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
    Write-Host "==> Created .env from .env.example."
    Fail-WithNextSteps -Reason ".env was just created and needs your GROQ_API_KEY." -NextSteps @(
        "Edit $EnvFile and set GROQ_API_KEY=gsk_...",
        "Re-run: .\scripts\start_local.ps1"
    )
}

# 4. Create backend\.venv if missing & install backend dependencies
if (-not (Test-Path -LiteralPath $VenvPython)) {
    Write-Host "==> Creating virtual environment at $VenvDir..."
    & $pythonCmd -m venv $VenvDir
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $VenvPython)) {
        Fail-WithNextSteps -Reason "Could not create virtual environment at $VenvDir." -NextSteps @(
            "Run .\scripts\setup_windows.ps1 if C:\TEMP is low on space or ensurepip failed.",
            "Then re-run: .\scripts\start_local.ps1"
        )
    }
}

Write-Host "==> Installing/verifying Python dependencies..."
& $VenvPython -m pip install --upgrade pip --quiet
& $VenvPython -m pip install -r $ReqFile --quiet
if ($LASTEXITCODE -ne 0) {
    Fail-WithNextSteps -Reason "pip install -r backend\requirements.txt failed." -NextSteps @(
        "Check internet access to pypi.org / files.pythonhosted.org.",
        "Run manually: & '$VenvPython' -m pip install -r '$ReqFile'"
    )
}

# 5. Install frontend dependencies if missing
if (-not (Test-Path -LiteralPath $NodeModules)) {
    Write-Host "==> Installing frontend dependencies (npm install)..."
    Push-Location $FrontendDir
    try {
        & npm install
        if ($LASTEXITCODE -ne 0) {
            Fail-WithNextSteps -Reason "npm install failed in frontend\." -NextSteps @(
                "Check internet access to registry.npmjs.org.",
                "Run manually: cd frontend; npm install"
            )
        }
    }
    finally {
        Pop-Location
    }
}

# 6. Run network diagnostics before starting servers
Write-Host "==> Running network diagnostics ($NetDiagScript)..."
& $VenvPython $NetDiagScript
if ($LASTEXITCODE -ne 0) {
    Fail-WithNextSteps -Reason "Outbound HTTPS / TLS diagnostic failed (see verdict above)." -NextSteps @(
        "If verdict is python-fails-but-system-works, set SSL_CERT_FILE to your corporate/OS CA bundle or check certifi.",
        "If verdict is all-hosts-fail, check internet, firewall, VPN, or HTTPS_PROXY/HTTP_PROXY.",
        "If verdict is only-api.groq.com-fails, verify api.groq.com is reachable from your network."
    )
}

# 7. Start backend (no --reload; ENABLE_SCHEDULER=1 only when requested)
$schedFlag = if ($EnableScheduler) { "1" } else { "0" }
Write-Host "==> Starting FastAPI backend on http://127.0.0.1:8000 (ENABLE_SCHEDULER=$schedFlag, no --reload)..."
$backendCmd = "Set-Location -LiteralPath '$BackendDir'; `$env:ENABLE_SCHEDULER = '$schedFlag'; & '$VenvPython' -m uvicorn main:app --host 127.0.0.1 --port 8000"
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-Command", $backendCmd) | Out-Null

Write-Host "==> Starting Next.js frontend on $FrontendUrl ..."
$frontendCmd = "Set-Location -LiteralPath '$FrontendDir'; `$env:BACKEND_URL = 'http://127.0.0.1:8000'; npm run dev"
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-Command", $frontendCmd) | Out-Null

# 8. Wait for backend /api/health
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
    Fail-WithNextSteps -Reason "Backend did not respond on $HealthUrl within ${WaitSeconds}s." -NextSteps @(
        "Check the backend PowerShell window for startup errors (for example invalid DATABASE_URL or port 8000 in use).",
        "Verify port 8000 is free: netstat -ano | findstr :8000"
    )
}

# 9. Wait briefly for frontend :3000
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
    Fail-WithNextSteps -Reason "Frontend did not respond on $FrontendUrl within 30s." -NextSteps @(
        "Check the frontend PowerShell window for Next.js compile errors.",
        "Verify port 3000 is free: netstat -ano | findstr :3000"
    )
}

# 10. Run full preflight
Write-Host "==> Running preflight checks ($PreflightScript)..."
& $VenvPython $PreflightScript --backend-url "http://127.0.0.1:8000" --frontend-url $FrontendUrl
if ($LASTEXITCODE -ne 0) {
    Fail-WithNextSteps -Reason "Preflight checks failed (see [FAIL] lines above)." -NextSteps @(
        "Ensure GROQ_API_KEY in .env is valid and not a placeholder.",
        "Check both server terminal windows for any runtime errors."
    )
}

Write-Host ""
Write-Host "Signal Stack is READY at $FrontendUrl (Backend: http://127.0.0.1:8000)" -ForegroundColor Green
if (-not $NoBrowser) {
    Start-Process $FrontendUrl | Out-Null
}
