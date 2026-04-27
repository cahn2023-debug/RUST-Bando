@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo [Antigravity] STARTING APP IN RELEASE MODE
echo ==================================================
echo.
echo [*] Ly do dung ban Release:
echo     - Khong can Node.js (Vite) chay ngam.
echo     - Tiet kiem CPU/RAM toi da cho may 2GB.
echo     - On dinh hon ban Develop.
echo.

set PROTOC=%~dp0src-tauri\tools\protoc\bin\protoc.exe
echo [*] Setting PROTOC path to %PROTOC%

echo [*] Cleaning up old processes...
call cleanup_processes.bat

echo.
echo [*] Buoc 1: Build ung dung (Chi can lam 1 lan neu code khong doi)...
echo [!] Luu y: Buoc nay co the mat vai phut va ton RAM.
set /p build_choice="Ban co muon build lai ung dung khong? (y/n, mac dinh n): "
if /i "%build_choice%"=="y" (
    npm run tauri build
)

echo.
echo [*] Buoc 2: Khoi chay ung dung Native...
cd src-tauri
for /r target\release %%i in (project-manager.exe) do (
    if exist "%%i" (
        echo [OK] Tim thay file thuc thi: %%i
        start "" "%%i"
        goto :end
    )
)

echo [!] Khong tim thay file build. Vui long chon 'y' o buoc Build de tao file.

:end
echo.
echo [Done] Ung dung dang khoi chay. Ban co the dong cua so nay.
timeout /t 5
