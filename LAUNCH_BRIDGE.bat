@echo off
title KMFX Edge — Bridge Server
color 0A
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║     KMFX Edge — Bridge Server               ║
echo  ║     ws://localhost:8765  (WebSocket)         ║
echo  ║     http://localhost:8766 (EA HTTP receiver) ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Mantenlo abierto mientras usas el dashboard.
echo  Ctrl+C para detener.
echo.

cd /d "%~dp0"
python kmfx_bridge.py
if errorlevel 1 (
    echo.
    echo  [ERROR] El bridge fallo. Asegurate de ejecutar INSTALL.bat primero.
    pause
)
