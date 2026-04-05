from __future__ import annotations

import os
import subprocess
from pathlib import Path


COMMON_MT5_PATHS = [
    Path(os.getenv("PROGRAMFILES", r"C:\Program Files")),
    Path(os.getenv("PROGRAMFILES(X86)", r"C:\Program Files (x86)")),
    Path(os.getenv("APPDATA", "")),
    Path(os.getenv("LOCALAPPDATA", "")),
]


def open_mt5(terminal_path: str) -> bool:
    try:
        subprocess.Popen([terminal_path], shell=False)
        return True
    except Exception:
        return False


def guided_mt5_install() -> bool:
    try:
        subprocess.Popen(["cmd", "/c", "start", "https://www.metatrader5.com/en/download"])
        return True
    except Exception:
        return False
