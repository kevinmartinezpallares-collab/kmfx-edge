from __future__ import annotations

import subprocess
from pathlib import Path


COMMON_MT5_PATHS = [
    Path("/Applications"),
    Path.home() / "Applications",
    Path.home() / "Library/Application Support",
    Path.home() / ".wine/drive_c",
]


def open_mt5(terminal_path: str) -> bool:
    path = Path(terminal_path)
    try:
        if path.suffix.lower() == ".app":
            subprocess.Popen(["open", str(path)])
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
