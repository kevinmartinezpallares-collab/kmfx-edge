#!/usr/bin/env python3
"""Compatibility entrypoint for the KMFX production preflight.

The implementation still lives in next_beta_preflight.py so existing automation
keeps working while production commands use production naming.
"""

from __future__ import annotations

import runpy
from pathlib import Path


if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("next_beta_preflight.py")), run_name="__main__")
