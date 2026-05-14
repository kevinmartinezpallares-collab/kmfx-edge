#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MT5_APP_PATH="${MT5_APP_PATH:-/Applications/MetaTrader 5.app}"
WINE_PREFIX="${WINE_PREFIX:-$HOME/Library/Application Support/net.metaquotes.wine.metatrader5}"
MT5_PROGRAM_DIR="$WINE_PREFIX/drive_c/Program Files/MetaTrader 5"
EXPERTS_DIR="$MT5_PROGRAM_DIR/MQL5/Experts"
WINE_BIN="$MT5_APP_PATH/Contents/SharedSupport/wine/bin/wine"
SOURCE_FILE="$ROOT_DIR/KMFXConnector.mq5"
COMPILED_BINARY="$EXPERTS_DIR/KMFXConnector.ex5"
TARGET_BINARY="$ROOT_DIR/KMFXConnector.ex5"
TARGET_SHA="$ROOT_DIR/KMFXConnector.ex5.sha256"

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "[KMFX][EA][ERROR] Missing EA source: $SOURCE_FILE" >&2
  exit 1
fi

if [[ ! -x "$WINE_BIN" ]]; then
  echo "[KMFX][EA][ERROR] Missing MetaTrader wine runtime: $WINE_BIN" >&2
  exit 1
fi

if [[ ! -d "$EXPERTS_DIR" ]]; then
  echo "[KMFX][EA][ERROR] Missing MT5 Experts directory: $EXPERTS_DIR" >&2
  exit 1
fi

mkdir -p "$EXPERTS_DIR"
cp "$SOURCE_FILE" "$EXPERTS_DIR/KMFXConnector.mq5"

before_mtime="0"
if [[ -f "$COMPILED_BINARY" ]]; then
  before_mtime="$(stat -f '%m' "$COMPILED_BINARY")"
fi

set +e
(
  cd "$MT5_PROGRAM_DIR"
  WINEPREFIX="$WINE_PREFIX" "$WINE_BIN" ./MetaEditor64.exe /portable /compile:"MQL5\\Experts\\KMFXConnector.mq5"
)
wine_exit=$?
set -e

if [[ ! -f "$COMPILED_BINARY" ]]; then
  echo "[KMFX][EA][ERROR] MetaEditor did not produce $COMPILED_BINARY" >&2
  exit 1
fi

after_mtime="$(stat -f '%m' "$COMPILED_BINARY")"
if [[ "$after_mtime" -le "$before_mtime" ]]; then
  echo "[KMFX][EA][ERROR] MetaEditor finished without refreshing KMFXConnector.ex5 (wine_exit=$wine_exit)" >&2
  exit 1
fi

cp "$COMPILED_BINARY" "$TARGET_BINARY"
(cd "$ROOT_DIR" && shasum -a 256 KMFXConnector.ex5 > KMFXConnector.ex5.sha256)
python3 "$ROOT_DIR/scripts/verify_ea_release.py"

echo "[KMFX][EA] compiled and refreshed:"
echo "  binary: $TARGET_BINARY"
echo "  sha256: $(cat "$TARGET_SHA")"
