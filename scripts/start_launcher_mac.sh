#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[KMFX][LAUNCHER] starting Tk launcher from $ROOT_DIR"
python3 -m launcher.app
