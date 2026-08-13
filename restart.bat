@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo === netscantools: RESTART ===
echo.

call "%~dp0stop.bat" /nopause

echo.
echo Starting API + UI...
echo   UI  http://127.0.0.1:5173
echo   API http://127.0.0.1:8000
echo   Login admin / admin
echo   Stop: Ctrl+C in this window, or stop.bat
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo Python not found. Install Python 3.12+ and try again.
  pause
  exit /b 1
)

title netscantools
python run.py --skip-install %*
set EXITCODE=%ERRORLEVEL%
if not %EXITCODE%==0 (
  echo.
  echo Launcher exited with code %EXITCODE%
  pause
)
exit /b %EXITCODE%
