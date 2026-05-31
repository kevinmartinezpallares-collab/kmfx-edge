#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


HOME = Path.home()
APP_SUPPORT = HOME / "Library" / "Application Support"
DESKTOP_ROOT = HOME / "Desktop" / "KMFX MT5 Data"

INSTANCES = (
    "MT5-Darwinex",
    "MT5-FTMO",
    "MT5-Orion",
    "MT5-Demo",
    "MT5-Icmarkets",
    "MT5-BOT",
)


def instance_root(name: str) -> Path:
    return APP_SUPPORT / name / "drive_c" / "Program Files" / "MetaTrader 5"


def refresh_shortcut(link_path: Path, target_path: Path) -> None:
    if link_path.exists() or link_path.is_symlink():
        link_path.unlink()
    link_path.symlink_to(target_path)


def main() -> None:
    DESKTOP_ROOT.mkdir(parents=True, exist_ok=True)

    for name in INSTANCES:
        root = instance_root(name)
        if not root.exists():
            print(f"[WARN] No existe la instancia {name}: {root}")
            continue

        refresh_shortcut(DESKTOP_ROOT / f"{name} Data", root)
        refresh_shortcut(DESKTOP_ROOT / f"{name} MQL5", root / "MQL5")
        refresh_shortcut(DESKTOP_ROOT / f"{name} Experts", root / "MQL5" / "Experts")
        refresh_shortcut(DESKTOP_ROOT / f"{name} Advisors", root / "MQL5" / "Experts" / "Advisors")
        refresh_shortcut(DESKTOP_ROOT / f"{name} Files", root / "MQL5" / "Files")
        refresh_shortcut(DESKTOP_ROOT / f"{name} Presets", root / "profiles" / "Presets")

    print(f"[OK] Accesos creados en {DESKTOP_ROOT}")


if __name__ == "__main__":
    main()
