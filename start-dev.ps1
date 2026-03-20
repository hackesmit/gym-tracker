# start-demo.ps1 — One-click Gym Tracker demo startup
# Usage: Right-click → "Run with PowerShell"  or  pwsh -File start-demo.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Ports ──────────────────────────────────────────────────────────────
$BACKEND_PORT  = 8000
$FRONTEND_PORT = 5173
$BACKEND_URL   = "http://127.0.0.1:$BACKEND_PORT/"
$FRONTEND_URL  = "http://localhost:$FRONTEND_PORT/"
$POLL_TIMEOUT  = 15   # seconds

# ── Paths (relative to this script) ───────────────────────────────────
$BackendDir  = Join-Path $PSScriptRoot "backend"
$FrontendDir = Join-Path $PSScriptRoot "frontend"

# ── Helper: colored output ────────────────────────────────────────────
function Write-Step  { param([string]$msg) Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "[-] $msg" -ForegroundColor Red }

# ── Track child processes for cleanup ─────────────────────────────────
$script:BackendProc  = $null
$script:FrontendProc = $null

function Stop-DemoProcesses {
    Write-Warn "Shutting down..."

    if ($script:BackendProc -and !$script:BackendProc.HasExited) {
        Write-Step "Stopping backend (PID $($script:BackendProc.Id))..."
        Stop-Process -Id $script:BackendProc.Id -Force -ErrorAction SilentlyContinue
    }
    if ($script:FrontendProc -and !$script:FrontendProc.HasExited) {
        Write-Step "Stopping frontend (PID $($script:FrontendProc.Id))..."
        Stop-Process -Id $script:FrontendProc.Id -Force -ErrorAction SilentlyContinue
    }

    # Also kill any stragglers on the ports
    Get-NetTCPConnection -LocalPort $BACKEND_PORT  -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Get-NetTCPConnection -LocalPort $FRONTEND_PORT -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

    Write-Ok "All processes stopped. Goodbye!"
}

# ── Ctrl+C trap ───────────────────────────────────────────────────────
try {
    [Console]::TreatControlCAsInput = $false
} catch {}

Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-DemoProcesses } | Out-Null
trap { Stop-DemoProcesses; break }

# ── Helper: poll a URL until 200 ──────────────────────────────────────
function Wait-ForUrl {
    param(
        [string]$Url,
        [string]$Label,
        [int]$TimeoutSeconds = 15
    )
    Write-Step "Waiting for $Label at $Url (timeout ${TimeoutSeconds}s)..."
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) {
                Write-Ok "$Label is ready!"
                return
            }
        } catch {
            # Not up yet — keep polling
        }
        Start-Sleep -Milliseconds 500
    }
    Write-Err "$Label did not respond within ${TimeoutSeconds}s. Continuing anyway..."
}

# ══════════════════════════════════════════════════════════════════════
#  1. Kill existing processes on target ports
# ══════════════════════════════════════════════════════════════════════
Write-Step "Checking for existing processes on ports $BACKEND_PORT and $FRONTEND_PORT..."

foreach ($port in @($BACKEND_PORT, $FRONTEND_PORT)) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $pid = $conn.OwningProcess
        if ($pid -and $pid -ne 0) {
            Write-Warn "Killing PID $pid on port $port"
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
}
Start-Sleep -Seconds 1

# ══════════════════════════════════════════════════════════════════════
#  2. Start Backend
# ══════════════════════════════════════════════════════════════════════
Write-Step "Starting backend (uvicorn) in $BackendDir ..."

$script:BackendProc = Start-Process -PassThru -NoNewWindow -FilePath "python" `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "$BACKEND_PORT" `
    -WorkingDirectory $BackendDir

Write-Ok "Backend started (PID $($script:BackendProc.Id))"

# ══════════════════════════════════════════════════════════════════════
#  3. Wait for Backend
# ══════════════════════════════════════════════════════════════════════
Wait-ForUrl -Url $BACKEND_URL -Label "Backend" -TimeoutSeconds $POLL_TIMEOUT

# ══════════════════════════════════════════════════════════════════════
#  4. Start Frontend
# ══════════════════════════════════════════════════════════════════════
Write-Step "Starting frontend (npm run dev) in $FrontendDir ..."

$script:FrontendProc = Start-Process -PassThru -NoNewWindow -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $FrontendDir

Write-Ok "Frontend started (PID $($script:FrontendProc.Id))"

# ══════════════════════════════════════════════════════════════════════
#  5. Wait for Frontend
# ══════════════════════════════════════════════════════════════════════
Wait-ForUrl -Url $FRONTEND_URL -Label "Frontend" -TimeoutSeconds $POLL_TIMEOUT

# ══════════════════════════════════════════════════════════════════════
#  6. Open Browser
# ══════════════════════════════════════════════════════════════════════
Write-Step "Opening browser..."
Start-Process $FRONTEND_URL

# ══════════════════════════════════════════════════════════════════════
#  7. Print Status
# ══════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  Gym Tracker Demo is running!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Backend API : " -NoNewline; Write-Host $BACKEND_URL -ForegroundColor Cyan
Write-Host "  Frontend UI : " -NoNewline; Write-Host $FRONTEND_URL -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop all processes." -ForegroundColor Yellow
Write-Host ""

# ── Keep script alive until Ctrl+C ────────────────────────────────────
try {
    while ($true) {
        # Check if either process has died
        if ($script:BackendProc.HasExited) {
            Write-Err "Backend process exited unexpectedly (exit code $($script:BackendProc.ExitCode))"
            break
        }
        if ($script:FrontendProc.HasExited) {
            Write-Err "Frontend process exited unexpectedly (exit code $($script:FrontendProc.ExitCode))"
            break
        }
        Start-Sleep -Seconds 2
    }
} finally {
    Stop-DemoProcesses
}
