@echo off
rem ============================================================
rem  Antigravity Chinese Pack - uninstaller entry point
rem ============================================================
setlocal
chcp 936 >nul 2>&1
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo Done.
) else (
    echo Failed with exit code %RC%.
)
echo.
pause
exit /b %RC%