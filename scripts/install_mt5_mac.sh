#!/usr/bin/env bash
set -euo pipefail

MT5_URL="https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"

echo "[KMFX][MT5] guided install for macOS"
echo "1. Download MetaTrader 5 for macOS or compatible package."
echo "2. Install MetaTrader 5 / Wine bundle."
echo "3. Open MT5 once so its MQL5 data folders are created."
echo "4. Re-run KMFX Launcher and use 'Redetectar MT5'."

if command -v open >/dev/null 2>&1; then
  open "$MT5_URL"
else
  echo "Open this URL manually: $MT5_URL"
fi
