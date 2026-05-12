#!/usr/bin/env python3
"""Single-command production gate for KMFX Edge.

This script bundles the local checks we already rely on before shipping:

- git diff --check
- Python syntax compilation for critical backend files
- GitHub governance local audit
- Production smoke checks
- Focused connector/security regression tests
- Optional full test suite

It uses only the Python standard library so it can run anywhere the repo can.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Check:
    name: str
    command: list[str]
    cwd: Path = ROOT


def relpath(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def run_check(check: Check) -> dict[str, object]:
    completed = subprocess.run(
        check.command,
        cwd=check.cwd,
        capture_output=True,
        text=True,
    )
    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()
    output = "\n".join(part for part in (stdout, stderr) if part).strip()
    return {
        "name": check.name,
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "cwd": relpath(check.cwd),
        "command": " ".join(check.command),
        "output": output,
    }


def build_checks(*, full_tests: bool) -> list[Check]:
    python = sys.executable
    checks = [
        Check("git_diff_check", ["git", "diff", "--check"]),
        Check(
            "py_compile_critical_backend",
            [
                python,
                "-m",
                "py_compile",
                "kmfx_connector_api.py",
                "account_service.py",
                "scripts/production_smoke.py",
                "scripts/github_release_governance_audit.py",
            ],
        ),
        Check(
            "github_release_governance_audit",
            [
                python,
                "scripts/github_release_governance_audit.py",
                "--repo",
                "kevinmartinezpallares-collab/kmfx-edge",
                "--branch",
                "main",
            ],
        ),
        Check("production_smoke", [python, "scripts/production_smoke.py"]),
        Check(
            "connector_security_regressions",
            [python, "-m", "unittest", "tests.test_connector_cors_config"],
        ),
    ]

    if full_tests:
        checks.append(Check("full_test_suite", [python, "-m", "unittest", "discover", "-s", "tests"]))

    return checks


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the KMFX Edge production gate.")
    parser.add_argument(
        "--full-tests",
        action="store_true",
        help="Run the complete unittest suite in addition to the focused regression checks.",
    )
    args = parser.parse_args()

    results = [run_check(check) for check in build_checks(full_tests=args.full_tests)]
    failed = [result for result in results if not result["ok"]]

    print(
        json.dumps(
            {
                "ok": not failed,
                "mode": "full" if args.full_tests else "standard",
                "checks": results,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
