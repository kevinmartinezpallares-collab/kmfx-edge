from __future__ import annotations

import platform
from dataclasses import dataclass
from pathlib import Path

from .platform_mac import COMMON_MT5_PATHS as MAC_PATHS
from .platform_windows import COMMON_MT5_PATHS as WINDOWS_PATHS


@dataclass
class MT5Installation:
    label: str
    terminal_path: str
    data_path: str
    experts_path: str
    presets_path: str
    platform_name: str


def _glob_installations(root: Path, platform_name: str) -> list[MT5Installation]:
    installations: list[MT5Installation] = []
    if not root.exists():
        return installations

    experts_dirs = list(root.glob("**/MQL5/Experts"))
    for experts_dir in experts_dirs:
        data_path = experts_dir.parent.parent
        presets_path = str(data_path / "Profiles" / "Presets")
        terminal_candidates = [
            data_path / "terminal64.exe",
            data_path / "terminal.exe",
            data_path.parent / "terminal64.exe",
            data_path.parent / "terminal.exe",
        ]
        terminal_candidates = [path for path in terminal_candidates if path.exists()]
        terminal_path = str(terminal_candidates[0]) if terminal_candidates else ""
        label_parts = [platform_name]
        prefix_name = _wine_prefix_name(data_path)
        if prefix_name:
            label_parts.append(prefix_name)
        label_parts.append(data_path.name)
        label = " · ".join(label_parts)
        installations.append(
            MT5Installation(
                label=label,
                terminal_path=terminal_path,
                data_path=str(data_path),
                experts_path=str(experts_dir),
                presets_path=presets_path,
                platform_name=platform_name,
            )
        )
    return installations


def _wine_prefix_name(path: Path) -> str:
    parts = path.parts
    if "drive_c" not in parts:
        return ""
    index = parts.index("drive_c")
    if index <= 0:
        return ""
    return parts[index - 1]


def detect_mt5_installations() -> list[MT5Installation]:
    system = platform.system().lower()
    roots = MAC_PATHS if system == "darwin" else WINDOWS_PATHS
    platform_name = "mac" if system == "darwin" else "windows"
    found: dict[str, MT5Installation] = {}
    for root in roots:
        for installation in _glob_installations(root, platform_name):
            found[installation.experts_path] = installation
    return sorted(found.values(), key=lambda item: item.label.lower())
