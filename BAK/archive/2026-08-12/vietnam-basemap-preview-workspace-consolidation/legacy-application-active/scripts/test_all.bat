@echo off
REM ============================================================================
REM MASTER TEST RUNNER FOR PROJECT MANAGEMENT SOFTWARE V4
REM ============================================================================
REM 
REM This script runs ALL tests (frontend + backend) and provides a unified report.
REM
REM Usage: test_all.bat [--release] [--skip-ai] [--skip-sync] [--verbose]
REM ============================================================================

echo ================================================================================
echo MASTER TEST RUNNER - PROJECT MANAGEMENT SOFTWARE V4
echo ================================================================================
echo Start Time: %date% %time%
echo ================================================================================

setlocal enabledelayedexpansion

REM Parse arguments
set ARGS=
set TEST_DIR=%CD%\test_output_full

:arg_loop
if "%1"=="" goto :arg_done
set ARGS=!ARGS! %1
if "%1"=="--release" (
    shift
    goto :arg_loop
)
if "%1"=="--skip-ai" (
    shift
    goto :arg_loop
)
if "%1"=="--skip-sync" (
    shift
    goto :arg_loop
)
if "%1"=="--verbose" (
    shift
    goto :arg_loop
)
if "%1"=="--help" (
    echo Usage: test_all.bat [--release] [--skip-ai] [--skip-sync] [--verbose]
    echo.
    echo Options:
    echo   --release      Run backend tests in release mode
    echo   --skip-ai      Skip AI-related tests
    echo   --skip-sync    Skip sync tests
    echo   --verbose      Enable verbose output
    echo.
    echo Test Suites:
    echo   1. Backend Rust tests (cargo test)
    echo   2. Frontend TypeScript tests (npm test)
    echo   3. Database integration tests (Python)
    echo   4. Build verification
    echo   5. Type checking
    echo   6. Linting
    exit /b 0
)
shift
goto :arg_loop

:arg_done

REM Create test output directory
if not exist "%TEST_DIR%" mkdir "%TEST_DIR%"

echo.
echo ================================================================================
echo PHASE 1: BACKEND TESTS
echo ================================================================================

echo Running backend tests...
call test_backend.bat %ARGS% > "%TEST_DIR%\backend_results.log" 2>&1
set BACKEND_EXIT=!ERRORLEVEL!

if !BACKEND_EXIT! EQU 0 (
    echo ✅ Backend tests passed
    set BACKEND_RESULT=PASS
) else (
    echo ❌ Backend tests failed (see %TEST_DIR%\backend_results.log)
    set BACKEND_RESULT=FAIL
)

echo.
echo ================================================================================
echo PHASE 2: FRONTEND TESTS
echo ================================================================================

echo Running frontend tests...
call npm run test -- --run --reporter=verbose > "%TEST_DIR%\frontend_results.log" 2>&1
set FRONTEND_EXIT=!ERRORLEVEL!

if !FRONTEND_EXIT! EQU 0 (
    echo ✅ Frontend tests passed
    set FRONTEND_RESULT=PASS
) else (
    echo ❌ Frontend tests failed (see %TEST_DIR%\frontend_results.log)
    set FRONTEND_RESULT=FAIL
)

echo.
echo ================================================================================
echo PHASE 3: DATABASE INTEGRATION TESTS
echo ================================================================================

echo Running database integration tests...
python scripts\test_comprehensive.py --test-dir "%TEST_DIR%\db_tests" --verbose > "%TEST_DIR%\db_results.log" 2>&1
set DB_EXIT=!ERRORLEVEL!

if !DB_EXIT! EQU 0 (
    echo ✅ Database tests passed
    set DB_RESULT=PASS
) else (
    echo ❌ Database tests failed (see %TEST_DIR%\db_results.log)
    set DB_RESULT=FAIL
)

echo.
echo ================================================================================
echo PHASE 4: BUILD VERIFICATION
echo ================================================================================

echo Verifying full application build...
call npm run build > "%TEST_DIR%\build_results.log" 2>&1
set BUILD_EXIT=!ERRORLEVEL!

if !BUILD_EXIT! EQU 0 (
    echo ✅ Build successful
    set BUILD_RESULT=PASS
) else (
    echo ❌ Build failed (see %TEST_DIR%\build_results.log)
    set BUILD_RESULT=FAIL
)

echo.
echo ================================================================================
echo PHASE 5: TYPE CHECKING
echo ================================================================================

echo Running TypeScript type checks...
call npm run type-check > "%TEST_DIR%\typecheck_results.log" 2>&1
set TYPE_EXIT=!ERRORLEVEL!

if !TYPE_EXIT! EQU 0 (
    echo ✅ Type checking passed
    set TYPE_RESULT=PASS
) else (
    echo ❌ Type checking failed (see %TEST_DIR%\typecheck_results.log)
    set TYPE_RESULT=FAIL
)

echo.
echo ================================================================================
echo PHASE 6: LINTING
echo ================================================================================

echo Running linter...
call npm run lint > "%TEST_DIR%\lint_results.log" 2>&1
set LINT_EXIT=!ERRORLEVEL!

if !LINT_EXIT! EQU 0 (
    echo ✅ Linting passed
    set LINT_RESULT=PASS
) else (
    echo ❌ Linting failed (see %TEST_DIR%\lint_results.log)
    set LINT_RESULT=FAIL
)

echo.
echo ================================================================================
echo FINAL TEST SUMMARY
echo ================================================================================
echo.
echo Test Suite Results:
echo   Backend Tests:          !BACKEND_RESULT!
echo   Frontend Tests:         !FRONTEND_RESULT!
echo   Database Tests:         !DB_RESULT!
echo   Build Verification:     !BUILD_RESULT!
echo   Type Checking:          !TYPE_RESULT!
echo   Linting:                !LINT_RESULT!
echo.

REM Count failures
set FAIL_COUNT=0
if "!BACKEND_RESULT!"=="FAIL" set /a FAIL_COUNT+=1
if "!FRONTEND_RESULT!"=="FAIL" set /a FAIL_COUNT+=1
if "!DB_RESULT!"=="FAIL" set /a FAIL_COUNT+=1
if "!BUILD_RESULT!"=="FAIL" set /a FAIL_COUNT+=1
if "!TYPE_RESULT!"=="FAIL" set /a FAIL_COUNT+=1
if "!LINT_RESULT!"=="FAIL" set /a FAIL_COUNT+=1

if !FAIL_COUNT! EQU 0 (
    echo ================================================================================
    echo ✅ ALL TESTS PASSED
    echo ================================================================================
    echo.
    echo Test artifacts available in: %TEST_DIR%
    echo.
    echo Next steps:
    echo   - Review test logs: dir /s %TEST_DIR%\*.log
    echo   - Open test reports: start %TEST_DIR%
    echo.
    exit /b 0
) else (
    echo ================================================================================
    echo ❌ !FAIL_COUNT! TEST SUITE^(S^) FAILED
    echo ================================================================================
    echo.
    echo Failed test suites (check logs):
    if "!BACKEND_RESULT!"=="FAIL" echo   - Backend: %TEST_DIR%\backend_results.log
    if "!FRONTEND_RESULT!"=="FAIL" echo   - Frontend: %TEST_DIR%\frontend_results.log
    if "!DB_RESULT!"=="FAIL" echo   - Database: %TEST_DIR%\db_results.log
    if "!BUILD_RESULT!"=="FAIL" echo   - Build: %TEST_DIR%\build_results.log
    if "!TYPE_RESULT!"=="FAIL" echo   - Type check: %TEST_DIR%\typecheck_results.log
    if "!LINT_RESULT!"=="FAIL" echo   - Lint: %TEST_DIR%\lint_results.log
    echo.
    echo Test artifacts available in: %TEST_DIR%
    echo.
    exit /b 1
)
