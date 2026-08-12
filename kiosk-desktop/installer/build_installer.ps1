param (
    [switch]$SkipInstall = $false
)

# Thin PowerShell wrapper around the npm-based kiosk build pipeline (see
# ../package.json's "build"/"kiosk:build" scripts and ../README.md),
# provided so this folder follows the same "installer\build_installer.ps1
# is the one command that produces the .exe" convention as the main HDSP
# installer (installer\build_installer.ps1). Unlike that script, there is
# nothing to download here (no bundled PostgreSQL/Redis/Node -- Electron
# itself is the only large binary, and electron-builder fetches/caches it
# via npm), so this is intentionally much shorter: install deps, compile
# TypeScript, run electron-builder.
#
# This script is completely independent of installer\build_installer.ps1
# and never invokes it (or vice versa) -- building the kiosk never touches
# the main HDSP installer, and building the main installer never touches
# this.

$ErrorActionPreference = "Stop"

# ../ relative to this script (kiosk-desktop\installer\) is kiosk-desktop\ itself.
$KioskDesktopDir = Split-Path -Parent $PSScriptRoot

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$Description
    )
    Write-Host "       $ $Command" -ForegroundColor DarkGray
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
        throw "FAILED: $Description (exit code $LASTEXITCODE) -- command was: $Command"
    }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " HDSP Kiosk Desktop Installer Builder      " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Push-Location $KioskDesktopDir
try {
    if (-not $SkipInstall) {
        Write-Host "`n[*] Installing dependencies..." -ForegroundColor Yellow
        Invoke-Checked -Command "npm install" -Description "npm install"
    }

    Write-Host "`n[*] Compiling TypeScript (main + preload)..." -ForegroundColor Yellow
    Invoke-Checked -Command "npm run build" -Description "npm run build"

    Write-Host "`n[*] Packaging with electron-builder (NSIS)..." -ForegroundColor Yellow
    Invoke-Checked -Command "npx electron-builder --win nsis" -Description "electron-builder"

    $OutputDir = Join-Path $KioskDesktopDir "installer\Output"
    Write-Host "`n[+] Done. Installer output:" -ForegroundColor Green
    Get-ChildItem $OutputDir -Filter "*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "    $($_.FullName)" -ForegroundColor Green
    }
}
finally {
    Pop-Location
}
