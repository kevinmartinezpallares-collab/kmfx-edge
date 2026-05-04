from __future__ import annotations

import os
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


SKIPPED_SCAN_DIRS = {
    ".git",
    "__pycache__",
    "cache",
    "caches",
    "code cache",
    "gpucache",
    "node_modules",
    "temp",
    "tmp",
}


def _should_descend(directory: Path) -> bool:
    return directory.name.strip().lower() not in SKIPPED_SCAN_DIRS


def _iter_experts_dirs(root: Path) -> list[Path]:
    experts_dirs: list[Path] = []
    if not root.exists():
        return experts_dirs

    def ignore_scan_error(_: OSError) -> None:
        return None

    for current, dirnames, _ in os.walk(root, topdown=True, onerror=ignore_scan_error, followlinks=False):
        current_path = Path(current)
        dirnames[:] = [dirname for dirname in dirnames if _should_descend(current_path / dirname)]
        if current_path.name != "MQL5" or "Experts" not in dirnames:
            continue
        experts_dir = current_path / "Experts"
        if experts_dir.is_dir():
            experts_dirs.append(experts_dir)
        dirnames[:] = [dirname for dirname in dirnames if dirname != "Experts"]
    return experts_dirs


def _glob_installations(root: Path, platform_name: str) -> list[MT5Installation]:
    installations: list[MT5Installation] = []
    if not root.exists():
        return installations

    for experts_dir in _iter_experts_dirs(root):
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
