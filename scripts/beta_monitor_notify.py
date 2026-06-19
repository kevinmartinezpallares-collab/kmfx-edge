#!/usr/bin/env python3
"""Legacy compatibility wrapper for the KMFX production monitor notifier."""

from __future__ import annotations

import runpy
from pathlib import Path


if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("production_monitor_notify.py")), run_name="__main__")
