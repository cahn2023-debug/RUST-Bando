@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo [Antigravity] CLEANUP PROJECT PROCESSES
echo ==================================================

echo.
echo [1/2] Checking for Node.js (Vite/Tauri) processes...
tasklist /FI "IMAGENAME eq node.exe" | find /I "node.exe" > nul
if %errorlevel% equ 0 (
    echo [!] Found Node.js processes. Terminating...
    taskkill /F /IM node.exe /T
    echo [OK] Node.js processes terminated.
) else (
    echo [OK] No Node.js processes found.
)

echo.
echo [2/2] Checking for leftover Rust Analyzers...
tasklist /FI "IMAGENAME eq language_server_windows_x64.exe" | find /I "language_server_windows_x64.exe" > nul
if %errorlevel% equ 0 (
    echo [!] Found Language Server. Terminating...
    taskkill /F /IM language_server_windows_x64.exe /T
    echo [OK] Language Server terminated.
) else (
    echo [OK] No leftover Language Servers found.
)

echo.
echo ==================================================
echo [Done] Cleanup finished. You can now start the app.
echo ==================================================
timeout /t 2 > nul
