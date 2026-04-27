# Build & Test Automation Script
# Usage: .\scripts\run_all_checks.ps1

Write-Host "🚀 Project Manager - Build & Test Automation" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$ErrorCount = 0
$StartTime = Get-Date

# Phase 1: Lint Check
Write-Host "📋 Phase 1: Running ESLint..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ESLint failed" -ForegroundColor Red
    $ErrorCount++
} else {
    Write-Host "✅ ESLint passed" -ForegroundColor Green
}
Write-Host ""

# Phase 2: Type Check
Write-Host "🔍 Phase 2: Running TypeScript type check..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ TypeScript type check failed" -ForegroundColor Red
    $ErrorCount++
} else {
    Write-Host "✅ TypeScript type check passed" -ForegroundColor Green
}
Write-Host ""

# Phase 3: Run Tests
Write-Host "🧪 Phase 3: Running unit tests..." -ForegroundColor Yellow
npm run test:ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Tests failed" -ForegroundColor Red
    $ErrorCount++
} else {
    Write-Host "✅ Tests passed" -ForegroundColor Green
}
Write-Host ""

# Phase 4: Rust Check
Write-Host "🦀 Phase 4: Running Rust checks..." -ForegroundColor Yellow
Set-Location src-tauri
cargo check --workspace
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Rust check failed" -ForegroundColor Red
    $ErrorCount++
} else {
    Write-Host "✅ Rust check passed" -ForegroundColor Green
}
Write-Host ""

# Phase 5: Rust Tests
Write-Host "🧪 Phase 5: Running Rust tests..." -ForegroundColor Yellow
cargo test --workspace
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Rust tests failed" -ForegroundColor Red
    $ErrorCount++
} else {
    Write-Host "✅ Rust tests passed" -ForegroundColor Green
}
Set-Location ..
Write-Host ""

# Phase 6: Clippy
Write-Host "🔍 Phase 6: Running Rust Clippy..." -ForegroundColor Yellow
Set-Location src-tauri
cargo clippy -- -D warnings
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Clippy warnings found (non-blocking)" -ForegroundColor Yellow
    # Don't count as error for now, just warn
} else {
    Write-Host "✅ Clippy passed" -ForegroundColor Green
}
Set-Location ..
Write-Host ""

# Summary
$EndTime = Get-Date
$Duration = ($EndTime - $StartTime).TotalSeconds

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "📊 SUMMARY" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Duration: $([math]::Round($Duration, 2))s" -ForegroundColor White
Write-Host "Errors: $ErrorCount" -ForegroundColor $(if ($ErrorCount -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($ErrorCount -eq 0) {
    Write-Host "✅ ALL CHECKS PASSED!" -ForegroundColor Green
    Write-Host "🚀 Ready for commit" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "❌ $ErrorCount check(s) failed" -ForegroundColor Red
    Write-Host "🔧 Please fix errors before committing" -ForegroundColor Yellow
    exit 1
}
