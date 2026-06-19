#!/usr/bin/env python3
"""Legacy compatibility wrapper for the KMFX production monitor."""

from __future__ import annotations

import runpy
import os
from pathlib import Path


if __name__ == "__main__":
    os.environ.setdefault("KMFX_MONITOR_CHECK_PREFIX", "beta")
    runpy.run_path(str(Path(__file__).with_name("production_monitor_usage.py")), run_name="__main__")
