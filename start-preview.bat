@echo off
setlocal
cd /d "%~dp0" || goto :failed

powershell.exe -NoProfile -Command ^
    "try { $health = curl.exe --noproxy '*' --fail --silent --max-time 1 'http://127.0.0.1:15286/__statify_health' | ConvertFrom-Json -ErrorAction Stop } catch { exit 1 };" ^
    "if ($LASTEXITCODE -eq 0 -and $health.project -eq 'statify-ai-local' -and $health.root.TrimEnd('\') -eq (Get-Location).Path) { exit 0 };" ^
    "exit 1"
if not errorlevel 1 (
    echo Statify AI preview is already running on port 15286.
    if /i not "%BROWSER%"=="none" start "" "http://127.0.0.1:15286/"
    exit /b 0
)

call npm.cmd run start:global
if errorlevel 1 goto :failed
exit /b 0

:failed
echo Statify AI preview failed to start. Check the error above.
echo If dependencies are missing, run npm ci in the project folder.
pause
exit /b 1
