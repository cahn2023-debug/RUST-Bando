@echo off
echo ==================================================
echo [Antigravity] STARTING APP IN OPTIMIZED DEV MODE
echo ==================================================
echo [!] LUU Y: Neu may ban co 2GB RAM va bi treo, hay dung file 'run_release.bat'
echo     de chay ung dung ma khong can Node.js (Vite).
echo ==================================================
echo.
set PROTOC=%~dp0src-tauri\tools\protoc\bin\protoc.exe
echo [AI] Setting PROTOC path to %PROTOC%
echo [AI] Cleaning up old processes...
call cleanup_processes.bat
echo [AI] Starting app in optimized development mode...
npm run tauri dev -- -- --jobs 2
pause
