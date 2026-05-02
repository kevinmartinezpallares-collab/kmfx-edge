#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_VERSION="${KMFX_WINDOWS_PYTHON_VERSION:-3.11.9}"
PYTHON_TAG="${PYTHON_VERSION//./}"
TOOLCHAIN_DIR="${ROOT_DIR}/build/windows-toolchain"
PYTHON_ZIP="${TOOLCHAIN_DIR}/python-${PYTHON_VERSION}-embed-amd64.zip"
PYTHON_DIR="${TOOLCHAIN_DIR}/python${PYTHON_TAG}embed"
GET_PIP="${TOOLCHAIN_DIR}/get-pip.py"
WINEPREFIX_DIR="${ROOT_DIR}/build/windows-wine-prefix"
WINE_BIN="${KMFX_WINE_BIN:-/Applications/MetaTrader 5.app/Contents/SharedSupport/wine/bin/wine}"
WINE_PATH_DIR="$(dirname "${WINE_BIN}")"
OUTPUT_DIR="${ROOT_DIR}/dist/KMFX Launcher"
OUTPUT_ZIP="${ROOT_DIR}/downloads/KMFX-Launcher-Windows.zip"
OUTPUT_SHA="${OUTPUT_ZIP}.sha256"

if [[ ! -x "${WINE_BIN}" ]]; then
  echo "[KMFX][BUILD][ERROR] Wine no encontrado en: ${WINE_BIN}" >&2
  echo "Define KMFX_WINE_BIN=/ruta/a/wine si lo tienes en otro sitio." >&2
  exit 1
fi

mkdir -p "${TOOLCHAIN_DIR}" "${ROOT_DIR}/downloads"

if [[ ! -f "${PYTHON_ZIP}" ]]; then
  curl -L "https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip" -o "${PYTHON_ZIP}"
fi

if [[ ! -d "${PYTHON_DIR}" ]]; then
  mkdir -p "${PYTHON_DIR}"
  ditto -x -k "${PYTHON_ZIP}" "${PYTHON_DIR}"
fi

PTH_FILE="${PYTHON_DIR}/python${PYTHON_TAG:0:3}._pth"
if [[ -f "${PTH_FILE}" ]] && ! grep -q "^import site$" "${PTH_FILE}"; then
  perl -0pi -e 's/#import site/import site/' "${PTH_FILE}"
fi

if [[ ! -f "${GET_PIP}" ]]; then
  curl -L "https://bootstrap.pypa.io/get-pip.py" -o "${GET_PIP}"
fi

export WINEPREFIX="${WINEPREFIX_DIR}"
export WINEARCH=win64
export WINEDEBUG=-all
export PATH="${WINE_PATH_DIR}:${PATH}"

"${WINE_BIN}" "${PYTHON_DIR}/python.exe" "${GET_PIP}" --no-warn-script-location
"${WINE_BIN}" "${PYTHON_DIR}/python.exe" -m pip install --no-warn-script-location -r "${ROOT_DIR}/requirements.txt" -r "${ROOT_DIR}/requirements-build.txt"

rm -rf "${OUTPUT_DIR}" "${ROOT_DIR}/build/KMFXLauncher"
"${WINE_BIN}" "${PYTHON_DIR}/python.exe" -m PyInstaller --clean --noconfirm "${ROOT_DIR}/launcher/packaging/windows/KMFXLauncher.spec"

if [[ ! -f "${OUTPUT_DIR}/KMFX Launcher.exe" ]]; then
  echo "[KMFX][BUILD][ERROR] No se encontro el ejecutable esperado." >&2
  exit 1
fi

rm -f "${OUTPUT_ZIP}" "${OUTPUT_SHA}"
(cd "${ROOT_DIR}/dist" && zip -qry "${OUTPUT_ZIP}" "KMFX Launcher")

WINDOWS_HASH="$(shasum -a 256 "${OUTPUT_ZIP}" | awk '{print $1}')"
printf "%s  KMFX-Launcher-Windows.zip\n" "${WINDOWS_HASH}" > "${OUTPUT_SHA}"

echo "[KMFX][BUILD] Windows launcher listo: ${OUTPUT_ZIP}"
echo "[KMFX][BUILD] SHA256: ${WINDOWS_HASH}"
