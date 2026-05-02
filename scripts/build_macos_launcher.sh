#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC_FILE="$ROOT_DIR/launcher/packaging/macos/KMFXLauncher.spec"
ICON_SOURCE="$ROOT_DIR/assets/logos/kmfx-edge-glass-mark-1024.png"
ICONSET_DIR="$ROOT_DIR/build/macos/KMFXLauncher.iconset"
ICON_FILE="$ROOT_DIR/launcher/packaging/macos/KMFXLauncher.icns"
APP_PATH="$ROOT_DIR/dist/KMFX Launcher.app"
DMG_PATH="$ROOT_DIR/dist/KMFX Launcher.dmg"

cd "$ROOT_DIR"

if [[ ! -f "$ICON_SOURCE" ]]; then
  echo "[KMFX][BUILD][ERROR] Missing icon source: $ICON_SOURCE" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/KMFXConnector.ex5" ]]; then
  echo "[KMFX][BUILD][WARN] KMFXConnector.ex5 not found; the bundle will include KMFXConnector.mq5 only." >&2
fi

if ! command -v sips >/dev/null 2>&1 || ! command -v iconutil >/dev/null 2>&1; then
  echo "[KMFX][BUILD][ERROR] macOS icon tools not found. Run this script on macOS." >&2
  exit 1
fi

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR" "$(dirname "$ICON_FILE")"

sips -z 16 16 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null
if ! iconutil --convert icns "$ICONSET_DIR" --output "$ICON_FILE"; then
  echo "[KMFX][BUILD][WARN] iconutil rejected the iconset; writing modern PNG-based icns fallback."
  python3 - "$ICONSET_DIR" "$ICON_FILE" <<'PY'
from pathlib import Path
import sys

iconset = Path(sys.argv[1])
output = Path(sys.argv[2])
items = [
    ("icp4", "icon_16x16.png"),
    ("icp5", "icon_32x32.png"),
    ("icp6", "icon_32x32@2x.png"),
    ("ic07", "icon_128x128.png"),
    ("ic08", "icon_256x256.png"),
    ("ic09", "icon_512x512.png"),
    ("ic10", "icon_512x512@2x.png"),
]
chunks = []
for icon_type, filename in items:
    data = (iconset / filename).read_bytes()
    chunks.append(icon_type.encode("ascii") + (len(data) + 8).to_bytes(4, "big") + data)
body = b"".join(chunks)
output.write_bytes(b"icns" + (len(body) + 8).to_bytes(4, "big") + body)
PY
fi
echo "[KMFX][BUILD] icon ready: $ICON_FILE"

if ! python3 -c "import PyInstaller" >/dev/null 2>&1; then
  echo "[KMFX][BUILD][ERROR] PyInstaller is missing. Install build dependencies with:" >&2
  echo "  python3 -m pip install -r requirements.txt -r requirements-build.txt" >&2
  exit 1
fi

python3 -m PyInstaller --clean --noconfirm "$SPEC_FILE"

SIGN_WORK_DIR=""
SIGN_APP_PATH=""
if command -v codesign >/dev/null 2>&1; then
  SIGN_WORK_DIR="$(mktemp -d)"
  SIGN_APP_PATH="$SIGN_WORK_DIR/KMFX Launcher.app"
  ditto --noextattr --noqtn "$APP_PATH" "$SIGN_APP_PATH"
  xattr -cr "$SIGN_APP_PATH" 2>/dev/null || true
  if codesign --force --deep --sign - "$SIGN_APP_PATH" && codesign --verify --deep --strict "$SIGN_APP_PATH"; then
    rm -rf "$APP_PATH"
    ditto --noextattr --noqtn "$SIGN_APP_PATH" "$APP_PATH"
    echo "[KMFX][BUILD] app ad-hoc signed"
  else
    echo "[KMFX][BUILD][WARN] ad-hoc codesign failed; sign/notarize manually before distribution." >&2
    SIGN_APP_PATH=""
  fi
fi
echo "[KMFX][BUILD] app ready: $APP_PATH"

if [[ "${1:-}" == "--dmg" ]]; then
  rm -f "$DMG_PATH"
  hdiutil create -volname "KMFX Launcher" -srcfolder "${SIGN_APP_PATH:-$APP_PATH}" -ov -format UDZO "$DMG_PATH"
  echo "[KMFX][BUILD] dmg ready: $DMG_PATH"
fi

if [[ -n "$SIGN_WORK_DIR" ]]; then
  rm -rf "$SIGN_WORK_DIR"
fi
