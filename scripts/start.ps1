$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path '.venv\Scripts\python.exe') -or -not (Test-Path 'frontend\dist\index.html')) { throw 'Run scripts\setup.ps1 first.' }
& .\.venv\Scripts\python.exe scripts\launch.py
exit $LASTEXITCODE
