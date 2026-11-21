<#
.SYNOPSIS
    Set up the Signal Stack Python backend on Windows without filling C:.

.DESCRIPTION
    Locates Python >= 3.11 via `py -0p`, redirects TEMP/TMP and pip cache onto
    D: (configurable via -TempDir and -CacheDir) before creating backend\.venv,
    falls back to `--without-pip` + get-pip.py if ensurepip fails, installs
    backend\requirements.txt, and initializes .env from .env.example if absent.

    NOTE: Code-reviewed only on Linux; not yet executed on Windows.
#>
[CmdletBinding()]
param(
    [string]$TempDir = "D:\Temp",
    [string]$CacheDir = "D:\pip-cache"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$VenvDir = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$ReqFile = Join-Path $BackendDir "requirements.txt"
$EnvExample = Join-Path $RepoRoot ".env.example"
$EnvFile = Join-Path $RepoRoot ".env"

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $lines = & $FilePath @Arguments 2>&1 | ForEach-Object { $_.ToString() }
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $prev
    }
    return [pscustomobject]@{
        ExitCode = $code
        Output   = ($lines -join [Environment]::NewLine)
        Lines    = $lines
    }
}

Write-Host "==> Checking Python launcher (py -0p)..."
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    Write-Error "Python launcher 'py' was not found on PATH. Install Python 3.11+ from python.org (with py launcher) and retry."
    exit 1
}

$pyQuery = Invoke-Native -FilePath "py" -Arguments @("-0p")
if ($pyQuery.ExitCode -ne 0) {
    Write-Host $pyQuery.Output
    Write-Error "py -0p failed with exit code $($pyQuery.ExitCode)."
    exit 1
}

$candidates = @()
foreach ($line in $pyQuery.Lines) {
    if ($line -match '^\s*-(?:V:)?(\d+)\.(\d+)(?:-[^\s]+)?(?:\s+(\*))?\s+(.+?)\s*$') {
        $major = [int]$Matches[1]
        $minor = [int]$Matches[2]
        $isDefault = ($Matches[3] -eq "*")
        $exePath = $Matches[4].Trim()
        if (($major -gt 3) -or ($major -eq 3 -and $minor -ge 11)) {
            $candidates += [pscustomobject]@{
                Major     = $major
                Minor     = $minor
                Spec      = "-$major.$minor"
                IsDefault = $isDefault
                Path      = $exePath
            }
        }
    }
}

if ($candidates.Count -eq 0) {
    Write-Host "py -0p output:"
    Write-Host $pyQuery.Output
    Write-Error "No Python >= 3.11 installation found via 'py -0p'. Signal Stack requires Python 3.11 or newer."
    exit 1
}

$selected = $candidates |
    Sort-Object -Property @{ Expression = "IsDefault"; Descending = $true }, @{ Expression = "Major"; Descending = $true }, @{ Expression = "Minor"; Descending = $true } |
    Select-Object -First 1

if (-not (Test-Path -LiteralPath $selected.Path)) {
    Write-Error "Located Python $($selected.Spec) at '$($selected.Path)', but the executable does not exist."
    exit 1
}

Write-Host "    Using Python $($selected.Major).$($selected.Minor) ($($selected.Path))"

Write-Host "==> Preparing TempDir ($TempDir) and CacheDir ($CacheDir)..."
foreach ($dir in @($TempDir, $CacheDir)) {
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# Set TEMP/TMP/TMPDIR BEFORE creating the venv so ensurepip and pip never write to a full C: drive.
$env:TEMP = $TempDir
$env:TMP = $TempDir
$env:TMPDIR = $TempDir
$env:PIP_CACHE_DIR = $CacheDir

if (-not (Test-Path -LiteralPath $VenvPython)) {
    Write-Host "==> Creating virtual environment at $VenvDir..."
    $venvRes = Invoke-Native -FilePath "py" -Arguments @($selected.Spec, "-m", "venv", $VenvDir)

    if ($venvRes.ExitCode -ne 0) {
        Write-Warning "Standard venv creation failed (exit code $($venvRes.ExitCode)). Exact error:"
        Write-Host $venvRes.Output

        if (Test-Path -LiteralPath $VenvDir) {
            Write-Host "==> Removing incomplete $VenvDir before --without-pip retry..."
            Remove-Item -LiteralPath $VenvDir -Recurse -Force
        }

        Write-Host "==> Retrying with --without-pip..."
        $noPipRes = Invoke-Native -FilePath "py" -Arguments @($selected.Spec, "-m", "venv", "--without-pip", $VenvDir)
        if ($noPipRes.ExitCode -ne 0) {
            Write-Host $noPipRes.Output
            Write-Error "Fallback 'py $($selected.Spec) -m venv --without-pip' also failed (exit code $($noPipRes.ExitCode))."
            exit 1
        }

        if (-not (Test-Path -LiteralPath $VenvPython)) {
            Write-Error "Venv python was not created at $VenvPython."
            exit 1
        }

        $getPipPath = Join-Path $TempDir "get-pip.py"
        Write-Host "==> Downloading get-pip.py to $getPipPath..."
        try {
            Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPipPath -UseBasicParsing
        }
        catch {
            Write-Error "Failed to download get-pip.py: $($_.Exception.Message)"
            exit 1
        }

        Write-Host "==> Bootstrapping pip inside $VenvDir..."
        $bootRes = Invoke-Native -FilePath $VenvPython -Arguments @($getPipPath, "--cache-dir", $CacheDir)
        if ($bootRes.ExitCode -ne 0) {
            Write-Host $bootRes.Output
            Write-Error "get-pip.py failed inside venv (exit code $($bootRes.ExitCode))."
            exit 1
        }
    }
}
else {
    Write-Host "==> Existing venv found at $VenvDir; reusing it."
}

if (-not (Test-Path -LiteralPath $ReqFile)) {
    Write-Error "Requirements file not found at $ReqFile."
    exit 1
}

Write-Host "==> Installing backend dependencies with --cache-dir $CacheDir..."
$prevPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    & $VenvPython -m pip install --cache-dir $CacheDir -r $ReqFile
    $pipExit = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $prevPref
}
if ($pipExit -ne 0) {
    Write-Error "pip install failed with exit code $pipExit."
    exit 1
}

Write-Host "==> Checking .env..."
if (Test-Path -LiteralPath $EnvFile) {
    Write-Host "    Existing .env found at $EnvFile; leaving it untouched."
}
elseif (Test-Path -LiteralPath $EnvExample) {
    Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
    Write-Host "    Copied .env.example to $EnvFile."
}
else {
    Write-Error "Missing .env.example at $EnvExample; cannot initialize .env."
    exit 1
}

Write-Host ""
Write-Host "============================================================"
Write-Host "Signal Stack Windows setup complete. Next steps:"
Write-Host "1. Edit $EnvFile and set your GROQ_API_KEY (never commit .env):"
Write-Host "     GROQ_API_KEY=gsk_..."
Write-Host "2. Start the backend server (from backend\, bound to IPv4 127.0.0.1, without auto-reloading):"
Write-Host "     cd `"$BackendDir`""
Write-Host "     .\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"
Write-Host "   (Or launch the full stack with diagnostics from the repo root: .\scripts\start_local.ps1)"
Write-Host "3. Verify the LLM healthcheck in a second terminal:"
Write-Host "     curl.exe -s http://127.0.0.1:8000/api/llm/healthcheck"
Write-Host "4. Run the 3-company pipeline from the repo root:"
Write-Host "     cd `"$RepoRoot`""
Write-Host "     backend\.venv\Scripts\python.exe scripts\run_three_companies.py --yes"
Write-Host "============================================================"
