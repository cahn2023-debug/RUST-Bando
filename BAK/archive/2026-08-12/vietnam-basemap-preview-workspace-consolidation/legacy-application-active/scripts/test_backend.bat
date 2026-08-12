@echo off
REM ============================================================================
REM COMPREHENSIVE BACKEND TEST SCRIPT FOR PROJECT MANAGEMENT SOFTWARE V4
REM ============================================================================
REM 
REM This script runs all backend tests including:
REM 1. Rust unit tests
REM 2. Integration tests
REM 3. Database tests
REM 4. AI tests (if feature enabled)
REM 5. Sync tests
REM 6. Build verification
REM 7. Type checking
REM 8. Linting
REM
REM Usage: test_backend.bat [--release] [--skip-ai] [--verbose]
REM ============================================================================

echo ================================================================================
echo BACKEND TEST SUITE FOR PROJECT MANAGEMENT SOFTWARE V4
echo ================================================================================
echo Start Time: %date% %time%
echo ================================================================================

setlocal enabledelayedexpansion

REM Parse arguments
set RELEASE_FLAG=
set SKIP_AI_FLAG=
set VERBOSE_FLAG=
set TEST_DIR=%CD%\test_output_backend

:arg_loop
if "%1"=="" goto :arg_done
if "%1"=="--release" (
    set RELEASE_FLAG=--release
    shift
    goto :arg_loop
)
if "%1"=="--skip-ai" (
    set SKIP_AI_FLAG=--skip-ai
    shift
    goto :arg_loop
)
if "%1"=="--verbose" (
    set VERBOSE_FLAG=--verbose
    shift
    goto :arg_loop
)
if "%1"=="--help" (
    echo Usage: test_backend.bat [--release] [--skip-ai] [--verbose]
    echo   --release    Run tests in release mode
    echo   --skip-ai    Skip AI-related tests
    echo   --verbose    Enable verbose output
    exit /b 0
)
shift
goto :arg_loop

:arg_done

REM Create test output directory
if not exist "%TEST_DIR%" mkdir "%TEST_DIR%"
echo.
echo 📁 Test directory: %TEST_DIR%

REM Track test results
set PASS_COUNT=0
set FAIL_COUNT=0
set SKIP_COUNT=0

echo.
echo ================================================================================
echo TEST 1: BUILD VERIFICATION
echo ================================================================================

echo Building project...
cd src-tauri
cargo check %RELEASE_FLAG%
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Build failed
    set /a FAIL_COUNT+=1
    goto :test_end
) else (
    echo ✅ PASS: Build successful
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 2: TYPE CHECKING
echo ================================================================================

echo Running type checks...
cargo check --all-targets %RELEASE_FLAG%
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Type checking failed
    set /a FAIL_COUNT+=1
) else (
    echo ✅ PASS: Type checking passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 3: LINTING
echo ================================================================================

echo Running linter...
cargo clippy --all-targets -- -D warnings
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Linting failed
    set /a FAIL_COUNT+=1
) else (
    echo ✅ PASS: Linting passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 4: CORE UNIT TESTS
echo ================================================================================

echo Running core unit tests...
cargo test --lib --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Core unit tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\test_output.log"
) else (
    echo ✅ PASS: Core unit tests passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 5: DATABASE TESTS
echo ================================================================================

echo Running database tests...
cargo test --lib db --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\db_test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Database tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\db_test_output.log"
) else (
    echo ✅ PASS: Database tests passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 6: V2 MIGRATION TESTS
echo ================================================================================

echo Running V2 migration tests...
cargo test --lib migration --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\migration_test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Migration tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\migration_test_output.log"
) else (
    echo ✅ PASS: Migration tests passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 7: V2 SYNC TESTS
echo ================================================================================

echo Running V2 sync tests...
cargo test --lib sync --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\sync_test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Sync tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\sync_test_output.log"
) else (
    echo ✅ PASS: Sync tests passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 8: V2 EVENT TESTS
echo ================================================================================

echo Running V2 event tests...
cargo test --lib events --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\event_test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Event tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\event_test_output.log"
) else (
    echo ✅ PASS: Event tests passed
    set /a PASS_COUNT+=1
)

if not "%SKIP_AI_FLAG%"=="" (
    echo.
    echo ================================================================================
    echo TEST 9: AI TESTS (SKIPPED)
    echo ================================================================================
    echo ⏭️  SKIP: AI tests skipped by configuration
    set /a SKIP_COUNT+=1
) else (
    echo.
    echo ================================================================================
    echo TEST 9: AI TESTS
    echo ================================================================================

    echo Running AI tests...
    cargo test --lib ai --no-fail-fast --features ai %VERBOSE_FLAG% 2> "%TEST_DIR%\ai_test_output.log"
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ FAIL: AI tests failed
        set /a FAIL_COUNT+=1
        type "%TEST_DIR%\ai_test_output.log"
    ) else (
        echo ✅ PASS: AI tests passed
        set /a PASS_COUNT+=1
    )
)

echo.
echo ================================================================================
echo TEST 10: GEOMETRY TESTS
echo ================================================================================

echo Running geometry tests...
cargo test --lib geometry --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\geometry_test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Geometry tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\geometry_test_output.log"
) else (
    echo ✅ PASS: Geometry tests passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 11: IMPORT TESTS
echo ================================================================================

echo Running import tests...
cargo test --lib import --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\import_test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Import tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\import_test_output.log"
) else (
    echo ✅ PASS: Import tests passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 12: INTEGRATION TESTS
echo ================================================================================

echo Running integration tests...
cargo test --test '*' --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\integration_test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Integration tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\integration_test_output.log"
) else (
    echo ✅ PASS: Integration tests passed
    set /a PASS_COUNT+=1
)

echo.
echo ================================================================================
echo TEST 13: DOC TESTS
echo ================================================================================

echo Running doc tests...
cargo test --doc --no-fail-fast %VERBOSE_FLAG% 2> "%TEST_DIR%\doc_test_output.log"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ FAIL: Doc tests failed
    set /a FAIL_COUNT+=1
    type "%TEST_DIR%\doc_test_output.log"
) else (
    echo ✅ PASS: Doc tests passed
    set /a PASS_COUNT+=1
)

:test_end
cd ..

echo.
echo ================================================================================
echo TEST SUMMARY
echo ================================================================================
set /a TOTAL=PASS_COUNT+FAIL_COUNT+SKIP_COUNT
echo Total Tests: %TOTAL%
echo ✅ Passed:   %PASS_COUNT%
echo ❌ Failed:   %FAIL_COUNT%
echo ⏭️  Skipped:  %SKIP_COUNT%
echo ================================================================================

if %FAIL_COUNT% GTR 0 (
    echo.
    echo ❌ SOME TESTS FAILED
    echo Please check the log files in: %TEST_DIR%
    exit /b 1
) else (
    echo.
    echo ✅ ALL TESTS PASSED
    exit /b 0
)
