@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo        PROJECT MANAGER - BUILD RELEASE MSI SCRIPT        
echo ========================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo [1/3] Checking environment prerequisites...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    exit /b 1
)

where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Rust / Cargo is not installed or not in PATH!
    exit /b 1
)

echo [2/3] Building frontend and Rust release MSI installer...
echo Executing: npx tauri build --bundles msi
echo.

call npx tauri build --bundles msi
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] MSI Packaging failed! Please check logs above.
    exit /b %errorlevel%
)

echo.
echo [3/3] Locating generated MSI artifact...
set "MSI_DIR=%ROOT_DIR%src-tauri\target\release\bundle\msi"

if exist "%MSI_DIR%" (
    echo.
    echo ========================================================
    echo  SUCCESS: MSI Package generated successfully!
    echo  Output Folder: %MSI_DIR%
    echo  Files:
    dir /b "%MSI_DIR%\*.msi" 2>nul
    echo ========================================================
) else (
    echo [WARNING] Build completed but MSI directory not found at: %MSI_DIR%
)

endlocal
