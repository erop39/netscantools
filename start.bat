@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Python not found. Install Python 3.12+ and try again.
  pause
  exit /b 1
)

python run.py %*
set EXITCODE=%ERRORLEVEL%
if not %EXITCODE%==0 (
  echo.
  echo Launcher exited with code %EXITCODE%
  pause
)
exit /b %EXITCODE%
