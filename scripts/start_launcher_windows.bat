@echo off
setlocal
cd /d %~dp0\..
echo [KMFX][LAUNCHER] starting Tk launcher
if "%KMFX_ENV%"=="" set KMFX_ENV=production
python -m launcher.app
endlocal
