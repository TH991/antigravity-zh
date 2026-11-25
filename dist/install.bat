@echo off
rem ============================================================
rem  Antigravity Chinese Pack - installer entry point
rem  All user-facing text is printed by install.ps1 (UTF-8 BOM),
rem  so this file stays pure ASCII to avoid codepage problems.
rem ============================================================
setlocal
chcp 936 >nul 2>&1
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo Done.
) else (
    echo Failed with exit code %RC%.
    echo Exit code 2 = Antigravity not found.
    echo Exit code 3 = package incomplete.
    echo Exit code 6 = invalid proxy port.
)
echo.
pause
exit /b %RC%