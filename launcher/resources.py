from __future__ import annotations

import sys
from pathlib import Path


def is_packaged() -> bool:
    return bool(getattr(sys, "frozen", False))


def app_root() -> Path:
    if is_packaged():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parent.parent


def resource_path(*parts: str) -> Path:
    return app_root().joinpath(*parts)
