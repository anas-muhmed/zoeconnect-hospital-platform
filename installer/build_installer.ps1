param (
    [switch]$SkipBuild = $false,
    [switch]$SkipDownload = $false
)

$ErrorActionPreference = "Stop"
$WorkingDir = Get-Location
$InstallerDir = Join-Path $WorkingDir "installer"
$AssetsDir = Join-Path $InstallerDir "assets"

# $ErrorActionPreference = "Stop" only makes PowerShell-level errors
# terminating -- it does NOT turn a non-zero exit code from an external
# process (npm, iscc, ...) into a terminating error. Without this check,
# a failed `npm run build` (e.g. a real TypeScript compile error) would
# silently continue past `npm prune` and straight into packaging whatever
# stale or partial dist/ happens to already be on disk -- exactly the
# failure mode that matters most for a script whose whole point is
# producing a correct, source-free installer. Every external command
# below is wrapped with this instead of a bare invocation.
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
Write-Host " HDSP Windows Installer Packaging Builder " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (-not $SkipDownload) {
    Write-Host "`n[*] Downloading Bundled Prerequisites..." -ForegroundColor Yellow
    
    # Download PostgreSQL 15 Binaries
    $pgZip = Join-Path $AssetsDir "postgresql.zip"
    if (-not (Test-Path $pgZip)) {
        Write-Host "    -> Downloading PostgreSQL 15..."
        Invoke-WebRequest -Uri "https://get.enterprisedb.com/postgresql/postgresql-15.6-1-windows-x64-binaries.zip" -OutFile $pgZip
    } else {
        Write-Host "    -> PostgreSQL already downloaded."
    }

    # Download VC++ Redistributable (Required for PostgreSQL)
    $vcRedist = Join-Path $AssetsDir "vc_redist.x64.exe"
    if (-not (Test-Path $vcRedist)) {
        Write-Host "    -> Downloading Visual C++ Redistributable..."
        Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vc_redist.x64.exe" -OutFile $vcRedist
    } else {
        Write-Host "    -> VC++ Redistributable already downloaded."
    }

    # Download Redis for Windows
    $redisZip = Join-Path $AssetsDir "redis.zip"
    if (-not (Test-Path $redisZip)) {
        Write-Host "    -> Downloading Redis for Windows..."
        Invoke-WebRequest -Uri "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip" -OutFile $redisZip
    } else {
        Write-Host "    -> Redis already downloaded."
    }

    # Download Node.js (Standalone EXE)
    $nodeExe = Join-Path $AssetsDir "node.exe"
    if (-not (Test-Path $nodeExe)) {
        Write-Host "    -> Downloading Node.js 20.11.1..."
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.11.1/win-x64/node.exe" -OutFile $nodeExe
    } else {
        Write-Host "    -> Node.js already downloaded."
    }
}

if (-not $SkipBuild) {
    Write-Host "`n[*] Building Application Artifacts..." -ForegroundColor Yellow

    # HDSP Backend
    Write-Host "    -> Building HDSP Backend..."
    Set-Location (Join-Path $WorkingDir "backend")
    # --install-links (npm 7+): backend/package.json depends on three local
    # packages via "file:../connector", "file:../packages/form-schema",
    # "file:../packages/oracle-client" -- WITHOUT this flag, npm installs a
    # "file:" dependency as a directory JUNCTION/symlink into node_modules,
    # not a real copy. Node's own require() transparently follows a
    # junction, so this looks completely fine on this dev machine -- but
    # Inno Setup's plain wildcard file copy (HDSP.iss's
    # "Source: ..\backend\node_modules\*") is not guaranteed to dereference
    # an NTFS junction the same way, and can silently omit or mis-copy
    # everything nested under it. That is a plausible independent cause of
    # "works when run directly from this checkout, breaks once packaged"
    # symptoms for @hdsp/connector specifically (found 2026-07-23 while
    # chasing a recurring Cannot find module 'socket.io-client' report from
    # a packaged install). --install-links forces npm to write a real,
    # physical copy instead, so what gets packaged is guaranteed to be
    # exactly what's on disk here, no junction-traversal ambiguity.
    Invoke-Checked "npm install --no-audit --no-fund --install-links" "backend npm install"
    Invoke-Checked "npm run build" "backend build (tsc/nest build)"
    # npm prune --omit=dev shrinks node_modules to production-only deps
    # before it's copied wholesale into the installer -- NOTE this mutates
    # this checkout's own node_modules; if you keep developing in this same
    # working copy afterward, run a plain `npm install` again to restore
    # devDependencies (tsc, jest, etc.) before running tests or rebuilding.
    Invoke-Checked "npm prune --omit=dev" "backend npm prune"

    # Post-prune module-resolution check (added 2026-07-23, UAT pilot
    # finding): backend/package.json depends on "@hdsp/connector" via
    # "file:../connector", a local path dependency, not an npm workspace.
    # A stale backend/package-lock.json (one that predates connector/'s
    # package.json gaining a new runtime dependency, e.g. socket.io-client)
    # can silently leave that transitive dependency missing from
    # backend/node_modules even though `npm install` "succeeded" -- this
    # surfaced for real as a MODULE_NOT_FOUND crash loop on a client
    # machine (Cannot find module 'socket.io-client', required by
    # @hdsp/connector/dist/transport/websocket-message-transport.js),
    # not caught until the packaged installer was already in a hospital's
    # hands. This check fails the BUILD instead, before packaging, by
    # actually requiring @hdsp/connector the same way dist/main.js does.
    Write-Host "    -> Verifying @hdsp/connector resolves from backend/node_modules..."
    Invoke-Checked "node -e ""require('@hdsp/connector'); console.log('@hdsp/connector OK')""" `
        "backend module-resolution check (@hdsp/connector, e.g. socket.io-client) -- see this script's own comment; likely fix: delete backend/node_modules and backend/package-lock.json, then npm install again"

    # HDSP Frontend
    Write-Host "    -> Building HDSP Frontend..."
    Set-Location (Join-Path $WorkingDir "frontend")
    Invoke-Checked "npm install --no-audit --no-fund" "frontend npm install"
    Invoke-Checked "npm run build" "frontend build (next build)"
    # For Next.js, we assume standalone output is configured, but if not, we keep node_modules
    Invoke-Checked "npm prune --omit=dev" "frontend npm prune"

    # Vendor Backend
    Write-Host "    -> Building Vendor Backend..."
    Set-Location (Join-Path $WorkingDir "vendor-portal/backend")
    Invoke-Checked "npm install --no-audit --no-fund" "vendor-portal backend npm install"
    Invoke-Checked "npm run build" "vendor-portal backend build (nest build)"
    Invoke-Checked "npm prune --omit=dev" "vendor-portal backend npm prune"

    # Vendor Frontend
    Write-Host "    -> Building Vendor Frontend..."
    Set-Location (Join-Path $WorkingDir "vendor-portal/frontend")
    Invoke-Checked "npm install --no-audit --no-fund" "vendor-portal frontend npm install"
    Invoke-Checked "npm run build" "vendor-portal frontend build (next build)"
    Invoke-Checked "npm prune --omit=dev" "vendor-portal frontend npm prune"

    Set-Location $WorkingDir
}

Write-Host "`n[*] Compiling Inno Setup Installer..." -ForegroundColor Yellow
$InnoCompiler = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
$IssScript = Join-Path $InstallerDir "HDSP.iss"

if (Test-Path $InnoCompiler) {
    & $InnoCompiler $IssScript
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n[+] Installer built successfully! Check installer/Output/" -ForegroundColor Green
    } else {
        throw "Inno Setup compilation failed (exit code $LASTEXITCODE) -- see ISCC output above."
    }
} else {
    throw "Inno Setup compiler not found at $InnoCompiler -- install Inno Setup 6 (https://jrsoftware.org/isinfo.php), or compile $IssScript manually."
}
