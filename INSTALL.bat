@echo off
title KMFX Edge — Bridge Installer
color 0A
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║     KMFX Edge — Bridge Installer            ║
echo  ║     Instalacion automatica de dependencias  ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python no encontrado.
    echo  Descarga Python 3.10+ desde: https://www.python.org/downloads/
    echo  IMPORTANTE: Marca "Add Python to PATH" durante la instalacion
    pause
    exit /b 1
)

echo  [OK] Python detectado
python --version

echo.
echo  Instalando dependencias...
echo.

pip install MetaTrader5 --quiet
if errorlevel 1 (echo  [WARN] MetaTrader5 no disponible ^(modo demo activo^)) else (echo  [OK] MetaTrader5)

pip install websockets --quiet
if errorlevel 1 (echo  [ERROR] websockets fallo) else (echo  [OK] websockets)

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║  PASO SIGUIENTE: Configurar MT5              ║
echo  ║                                              ║
echo  ║  1. Abre MetaTrader 5                        ║
echo  ║  2. Tools ^> Options ^> Expert Advisors        ║
echo  ║  3. Marca: Allow algorithmic trading         ║
echo  ║  4. Marca: Allow WebRequest for listed URL   ║
echo  ║  5. Añade: http://localhost:8766             ║
echo  ║  6. Copia KMFXBridge.mq5 a:                 ║
echo  ║     %AppData%\MetaQuotes\Terminal\           ║
echo  ║     [ID_TERMINAL]\MQL5\Experts\             ║
echo  ║  7. Compila en MetaEditor (F7)               ║
echo  ║  8. Arrastra el EA a cualquier chart         ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Instalacion completada. Ejecuta LAUNCH_BRIDGE.bat para arrancar.
echo.
pause
