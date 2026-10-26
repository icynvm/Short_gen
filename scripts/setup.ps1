$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw 'Install Python 3.12 for Windows (including the Python launcher and Tcl/Tk).' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12+ or 24 LTS first.' }
if (-not (Test-Path '.venv\Scripts\python.exe')) {
    & py -3.12 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create Python 3.12 virtual environment.' }
}
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
Push-Location frontend
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    Write-Warning 'Install a trusted FFmpeg build with libx264 and libass; add ffmpeg.exe and ffprobe.exe to PATH, then reopen PowerShell.'
}
Write-Host 'Setup finished. Add GEMINI_API_KEY to .env, then run scripts\start.ps1. Local AI runtimes and weights are configured in the app.'
