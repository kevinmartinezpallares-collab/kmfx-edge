from __future__ import annotations

import os
import subprocess
from pathlib import Path


COMMON_MT5_PATHS = [
    Path("/Applications"),
    Path.home() / "Applications",
    Path.home() / "Library/Application Support",
    Path.home() / ".wine/drive_c",
]


WINE_ROOT_CANDIDATES = [
    Path("/private/tmp/kmfx_mt5_payload_2025/MetaTrader 5.app/Contents/SharedSupport/wine"),
    Path("/Applications/MetaTrader 5.app/Contents/SharedSupport/wine"),
]


def _wine_prefix_for_terminal(path: Path) -> Path | None:
    parts = path.parts
    if "drive_c" not in parts:
        return None
    index = parts.index("drive_c")
    if index <= 0:
        return None
    return Path(*parts[:index])


def _wine_root() -> Path | None:
    for root in WINE_ROOT_CANDIDATES:
        if (root / "bin" / "wine64").exists():
            return root
    return None


def _open_wine_terminal(path: Path) -> bool:
    wine_prefix = _wine_prefix_for_terminal(path)
    wine_root = _wine_root()
    if not wine_prefix or not wine_root:
        return False

    env = os.environ.copy()
    env["WINEPREFIX"] = str(wine_prefix)
    env["WINEARCH"] = "win64"
    env["WINEDEBUG"] = "-all"
    env["WINEDLLOVERRIDES"] = "mscoree,mshtml="
    env["PATH"] = f"{wine_root / 'bin'}:{env.get('PATH', '')}"
    fallback_library_path = f"{wine_root / 'lib'}:{wine_root / 'lib' / 'external'}"
    if env.get("DYLD_FALLBACK_LIBRARY_PATH"):
        fallback_library_path = f"{fallback_library_path}:{env['DYLD_FALLBACK_LIBRARY_PATH']}"
    env["DYLD_FALLBACK_LIBRARY_PATH"] = fallback_library_path

    subprocess.Popen(
        [str(wine_root / "bin" / "wine64"), str(path), "/portable"],
        cwd=str(path.parent),
        env=env,
    )
    return True


def open_mt5(terminal_path: str) -> bool:
    path = Path(terminal_path)
    try:
        if path.suffix.lower() == ".app":
            subprocess.Popen(["open", str(path)])
            return True
        if path.suffix.lower() == ".exe" and path.exists():
            return _open_wine_terminal(path)
        app_path = Path("/Applications/MetaTrader 5.app")
        if app_path.exists():
            subprocess.Popen(["open", str(app_path)])
            return True
        subprocess.Popen(["open", "-a", "MetaTrader 5"])
        return True
    except Exception:
        return False


def guided_mt5_install() -> bool:
    try:
        subprocess.Popen(["open", "https://www.metatrader5.com/en/download"])
        return True
    except Exception:
        return False
