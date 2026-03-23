#!/bin/bash
echo ""
echo " ╔══════════════════════════════════════════════╗"
echo " ║     KMFX Edge — Bridge Server               ║"
echo " ╚══════════════════════════════════════════════╝"
echo ""

# Ir al directorio del script
cd "$(dirname "$0")"

# Instalar dependencias si no están
pip3 install websockets MetaTrader5 2>/dev/null || pip install websockets 2>/dev/null

echo " Iniciando bridge en ws://localhost:8765"
echo " Ctrl+C para detener"
echo ""
python3 kmfx_bridge.py
