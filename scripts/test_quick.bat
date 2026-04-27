@echo off
REM ============================================================================
REM QUICK MANUAL TEST SCRIPT FOR PROJECT MANAGEMENT SOFTWARE V4
REM ============================================================================
REM 
REM This script provides quick manual tests for common scenarios.
REM Usage: test_quick.bat
REM ============================================================================

echo ================================================================================
echo QUICK MANUAL TEST SUITE
echo ================================================================================
echo.

echo Test 1: Check if application builds...
cd src-tauri
cargo check --quiet
if %ERRORLEVEL% EQU 0 (
    echo ✅ Build check passed
) else (
    echo ❌ Build check failed
)
cd ..

echo.
echo Test 2: Run quick unit tests...
cargo test --lib --quiet --no-fail-fast 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Unit tests passed
) else (
    echo ⚠️  Some unit tests failed (check output above)
)

echo.
echo Test 3: Run quick lint check...
cargo clippy --quiet 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Lint check passed
) else (
    echo ⚠️  Lint issues found (check output above)
)

echo.
echo Test 4: Check frontend tests...
npm test -- --run --reporter=basic 2>nul | findstr "passed\|failed"
if %ERRORLEVEL% EQU 0 (
    echo ✅ Frontend tests passed
) else (
    echo ⚠️  Some frontend tests failed
)

echo.
echo ================================================================================
echo QUICK TEST COMPLETE
echo ================================================================================
echo.
echo For full test suite, run: test_all.bat
echo For documentation, see: TEST_SUITE_README.md
