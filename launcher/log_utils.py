from __future__ import annotations

import logging
from pathlib import Path

from .config import ensure_launcher_home


def launcher_log_path() -> Path:
    return ensure_launcher_home() / "logs" / "launcher.log"


def configure_logging(debug: bool = True) -> logging.Logger:
    logger = logging.getLogger("kmfx_launcher")
    if logger.handlers:
        return logger

    level = logging.DEBUG if debug else logging.INFO
    logger.setLevel(level)
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

    file_handler = logging.FileHandler(launcher_log_path(), encoding="utf-8")
    file_handler.setLevel(level)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(level)
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    logger.propagate = False
    return logger


def read_recent_logs(max_lines: int = 200) -> str:
    path = launcher_log_path()
    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    return "\n".join(lines[-max_lines:])
