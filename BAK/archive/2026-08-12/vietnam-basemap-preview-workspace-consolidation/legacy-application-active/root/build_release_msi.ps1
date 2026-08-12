<#
.SYNOPSIS
    Builds the Project Manager Tauri application in Release mode and packages it as a Windows MSI installer.
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       PROJECT MANAGER - BUILD RELEASE MSI SCRIPT       " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Environment check
Write-Host "[1/3] Checking environment prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command "cargo" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Rust / Cargo is not installed or not in PATH!" -ForegroundColor Red
    exit 1
}

# Step 2: Build MSI
Write-Host "[2/3] Building frontend and Rust release MSI package..." -ForegroundColor Yellow
Write-Host "Executing: npx tauri build --bundles msi`n" -ForegroundColor DarkGray

try {
    npx tauri build --bundles msi
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri build command returned exit code $LASTEXITCODE"
    }
} catch {
    Write-Host "`n[ERROR] MSI Packaging failed: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Verify artifact
Write-Host "`n[3/3] Locating generated MSI artifact..." -ForegroundColor Yellow
$MsiDir = Join-Path $ScriptDir "src-tauri\target\release\bundle\msi"

if (Test-Path $MsiDir) {
    $MsiFiles = Get-ChildItem -Path $MsiDir -Filter "*.msi"
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  SUCCESS: MSI Package generated successfully!" -ForegroundColor Green
    Write-Host "  Output Folder: $MsiDir" -ForegroundColor Green
    if ($MsiFiles) {
        Write-Host "  Generated File(s):" -ForegroundColor Green
        foreach ($file in $MsiFiles) {
            Write-Host "   - $($file.Name) ($([math]::Round($file.Length / 1MB, 2)) MB)" -ForegroundColor White
        }
    }
    Write-Host "========================================================" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Build completed but MSI folder was not found at: $MsiDir" -ForegroundColor Yellow
}
