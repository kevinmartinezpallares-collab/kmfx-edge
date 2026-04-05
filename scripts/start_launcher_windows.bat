@echo off
setlocal
cd /d %~dp0\..
echo [KMFX][LAUNCHER] starting Tk launcher
python -m launcher.app
endlocal
