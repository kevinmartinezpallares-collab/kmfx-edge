from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

APPDATA = Path(os.getenv("APPDATA", ""))
LOCALAPPDATA = Path(os.getenv("LOCALAPPDATA", ""))

COMMON_MT5_PATHS = [
    Path(os.getenv("PROGRAMFILES", r"C:\Program Files")),
    Path(os.getenv("PROGRAMFILES(X86)", r"C:\Program Files (x86)")),
    APPDATA / "MetaQuotes" / "Terminal" if APPDATA else Path(""),
    LOCALAPPDATA / "MetaQuotes" / "Terminal" if LOCALAPPDATA else Path(""),
]


def open_mt5(terminal_path: str, display_name: str = "") -> bool:
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


def register_launcher_url_protocol() -> bool:
    """Register kmfx-launcher:// for the packaged launcher in the current user hive."""
    if os.name != "nt":
        return False
    try:
        import winreg
    except ImportError:
        return False

    executable = Path(sys.executable).resolve()
    command = f'"{executable}" "%1"'
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\kmfx-launcher") as scheme_key:
            winreg.SetValueEx(scheme_key, "", 0, winreg.REG_SZ, "URL:KMFX Launcher")
            winreg.SetValueEx(scheme_key, "URL Protocol", 0, winreg.REG_SZ, "")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\kmfx-launcher\DefaultIcon") as icon_key:
            winreg.SetValueEx(icon_key, "", 0, winreg.REG_SZ, str(executable))
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\kmfx-launcher\shell\open\command") as command_key:
            winreg.SetValueEx(command_key, "", 0, winreg.REG_SZ, command)
        return True
    except OSError:
        return False
