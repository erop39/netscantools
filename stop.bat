@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo === netscantools: STOP ===
echo Killing listeners on 8000 (API) and 5173 (UI)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$ports = 8000,5173;" ^
  "$pids = [System.Collections.Generic.HashSet[int]]::new();" ^
  "foreach ($p in $ports) {" ^
  "  Get-NetTCPConnection -LocalPort $p -State Listen | ForEach-Object { [void]$pids.Add([int]$_.OwningProcess) };" ^
  "  netstat -ano | Select-String (':{0}\s' -f $p) | Select-String 'LISTENING' | ForEach-Object {" ^
  "    $parts = ($_ -split '\s+') | Where-Object { $_ };" ^
  "    $id = 0; if ([int]::TryParse($parts[-1], [ref]$id) -and $id -gt 0) { [void]$pids.Add($id) }" ^
  "  }" ^
  "};" ^
  "if ($pids.Count -eq 0) { Write-Host '  (nothing listening)'; exit 0 };" ^
  "foreach ($id in @($pids)) {" ^
  "  if ($id -le 4) { continue }" ^
  "  $proc = Get-Process -Id $id -ErrorAction SilentlyContinue;" ^
  "  if (-not $proc) {" ^
  "    Write-Host ('  skip PID {0} (already gone / stale netstat entry)' -f $id);" ^
  "    continue" ^
  "  }" ^
  "  Write-Host ('  kill PID {0} ({1})' -f $id, $proc.ProcessName);" ^
  "  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue;" ^
  "  & taskkill.exe /F /T /PID $id 2>$null | Out-Null;" ^
  "}"

timeout /t 1 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "foreach ($p in 8000,5173) {" ^
  "  Get-NetTCPConnection -LocalPort $p -State Listen | ForEach-Object {" ^
  "    $id = [int]$_.OwningProcess;" ^
  "    if ($id -le 4) { continue }" ^
  "    if (-not (Get-Process -Id $id -ErrorAction SilentlyContinue)) { continue }" ^
  "    Write-Host ('  re-kill PID {0} (port {1})' -f $id, $p);" ^
  "    Stop-Process -Id $id -Force;" ^
  "    & taskkill.exe /F /T /PID $id 2>$null | Out-Null;" ^
  "  }" ^
  "}"

timeout /t 1 /nobreak >nul

echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$alive = @();" ^
  "foreach ($p in 8000,5173) {" ^
  "  Get-NetTCPConnection -LocalPort $p -State Listen | ForEach-Object {" ^
  "    $id = [int]$_.OwningProcess;" ^
  "    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue;" ^
  "    if ($proc) { $alive += ('  TCP :{0}  PID {1} ({2})' -f $p, $id, $proc.ProcessName) }" ^
  "  }" ^
  "};" ^
  "if ($alive.Count -eq 0) {" ^
  "  Write-Host 'Ports 8000 / 5173 are free (or only stale OS entries remain).'" ^
  "} else {" ^
  "  Write-Host 'WARNING: still listening:';" ^
  "  $alive | ForEach-Object { Write-Host $_ };" ^
  "  Write-Host '';" ^
  "  Write-Host 'Tip: close other netscantools windows, then run stop.bat again.';" ^
  "}"

echo.
if /i "%~1"=="/nopause" exit /b 0
if /i "%~1"=="--nopause" exit /b 0
pause
exit /b 0
