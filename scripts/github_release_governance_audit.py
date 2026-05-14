#!/usr/bin/env python3
"""Audit GitHub release-governance settings for KMFX Edge.

The script intentionally avoids third-party dependencies. It checks local repo
files and, when a GitHub token is available, validates platform settings that
cannot be inferred from the checkout.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_REPO = "kevinmartinezpallares-collab/kmfx-edge"
DEFAULT_BRANCH = "main"

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_WORKFLOWS = {
    ".github/workflows/ci.yml": [
        "name: CI",
        "Backend and connector tests",
        "Static app checks",
        "actions/checkout@v6",
    ],
    ".github/workflows/production-smoke.yml": [
        "name: Production Smoke",
        "workflow_dispatch:",
        "schedule:",
        "scripts/production_smoke.py",
        "actions/checkout@v6",
    ],
    ".github/workflows/windows-launcher.yml": [
        "name: Build Windows Launcher",
        "Build Windows launcher",
        "actions/checkout@v6",
        "actions/upload-artifact@v4",
    ],
    ".github/workflows/macos-launcher.yml": [
        "name: Build macOS Launcher",
        "Build macOS launcher",
        "actions/checkout@v6",
        "actions/upload-artifact@v4",
    ],
}

REQUIRED_CHECKS = {
    "Backend and connector tests",
    "Static app checks",
    "Build Windows launcher",
}


def github_get(path: str, token: str | None) -> tuple[int, Any]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "kmfx-release-governance-audit",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(f"https://api.github.com{path}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            body = response.read().decode("utf-8")
            return response.status, json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload: Any = json.loads(body)
        except json.JSONDecodeError:
            payload = {"message": body.strip() or exc.reason}
        return exc.code, payload
    except OSError as exc:
        return 0, {"message": str(exc)}


def status_line(ok: bool | None, label: str, detail: str = "") -> str:
    if ok is True:
        marker = "[OK]"
    elif ok is False:
        marker = "[FAIL]"
    else:
        marker = "[WARN]"
    return f"{marker} {label}{': ' + detail if detail else ''}"


def audit_local_files() -> tuple[list[str], bool]:
    lines: list[str] = ["Local repository checks"]
    ok = True

    codeowners = ROOT / ".github" / "CODEOWNERS"
    if codeowners.exists() and codeowners.read_text(encoding="utf-8").strip():
        lines.append(status_line(True, "CODEOWNERS exists", str(codeowners.relative_to(ROOT))))
    else:
        lines.append(status_line(False, "CODEOWNERS exists"))
        ok = False

    dependabot = ROOT / ".github" / "dependabot.yml"
    if dependabot.exists():
        text = dependabot.read_text(encoding="utf-8")
        required_ecosystems = ["github-actions", "npm", "pip"]
        missing = [eco for eco in required_ecosystems if eco not in text]
        if missing:
            lines.append(status_line(False, "Dependabot version updates", f"missing {', '.join(missing)}"))
            ok = False
        else:
            lines.append(status_line(True, "Dependabot version updates", "github-actions, npm, pip"))
    else:
        lines.append(status_line(False, "Dependabot version updates", "missing .github/dependabot.yml"))
        ok = False

    for relpath, expected in REQUIRED_WORKFLOWS.items():
        path = ROOT / relpath
        if not path.exists():
            lines.append(status_line(False, relpath, "missing"))
            ok = False
            continue
        text = path.read_text(encoding="utf-8")
        missing = [needle for needle in expected if needle not in text]
        if missing:
            lines.append(status_line(False, relpath, f"missing {', '.join(missing)}"))
            ok = False
        else:
            lines.append(status_line(True, relpath))

    return lines, ok


def audit_platform(repo: str, branch: str, token: str | None) -> tuple[list[str], bool]:
    lines: list[str] = ["GitHub platform checks"]
    ok = True

    if not token:
        lines.append(
            status_line(
                None,
                "GITHUB_TOKEN not set",
                "private platform settings cannot be verified from this checkout",
            )
        )

    status, repo_payload = github_get(f"/repos/{repo}", token)
    if status == 200 and isinstance(repo_payload, dict):
        analysis = repo_payload.get("security_and_analysis") or {}
        checks = {
            "secret scanning": analysis.get("secret_scanning", {}).get("status"),
            "push protection": analysis.get("secret_scanning_push_protection", {}).get("status"),
            "Dependabot security updates": analysis.get("dependabot_security_updates", {}).get("status"),
        }
        for label, setting in checks.items():
            if setting == "enabled":
                lines.append(status_line(True, label, "enabled"))
            elif setting:
                lines.append(status_line(False, label, setting))
                ok = False
            else:
                lines.append(status_line(None, label, "not exposed by current token/API response"))
    else:
        message = repo_payload.get("message") if isinstance(repo_payload, dict) else str(repo_payload)
        lines.append(status_line(None, "repository security settings", f"HTTP {status}: {message}"))

    status, protection = github_get(f"/repos/{repo}/branches/{branch}/protection", token)
    if status == 200 and isinstance(protection, dict):
        required_status = protection.get("required_status_checks") or {}
        contexts = set(required_status.get("contexts") or [])
        missing = sorted(REQUIRED_CHECKS - contexts)
        if missing:
            lines.append(status_line(False, f"branch protection required checks on {branch}", f"missing {', '.join(missing)}"))
            ok = False
        else:
            lines.append(status_line(True, f"branch protection required checks on {branch}"))

        pull_request_reviews = protection.get("required_pull_request_reviews") or {}
        if pull_request_reviews:
            lines.append(status_line(True, "pull request review protection"))
        else:
            lines.append(status_line(False, "pull request review protection", "not enabled"))
            ok = False

        if protection.get("allow_force_pushes", {}).get("enabled") is False:
            lines.append(status_line(True, "force pushes blocked"))
        else:
            lines.append(status_line(False, "force pushes blocked"))
            ok = False

        if protection.get("allow_deletions", {}).get("enabled") is False:
            lines.append(status_line(True, "branch deletion blocked"))
        else:
            lines.append(status_line(False, "branch deletion blocked"))
            ok = False
    else:
        message = protection.get("message") if isinstance(protection, dict) else str(protection)
        lines.append(status_line(None, f"branch protection on {branch}", f"HTTP {status}: {message}"))
        ok = False

    return lines, ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit GitHub release governance for KMFX Edge.")
    parser.add_argument("--repo", default=DEFAULT_REPO, help="Repository in owner/name form.")
    parser.add_argument("--branch", default=DEFAULT_BRANCH, help="Protected branch to audit.")
    parser.add_argument(
        "--token-env",
        default="GITHUB_TOKEN",
        help="Environment variable containing a GitHub token with admin/security read permissions.",
    )
    parser.add_argument("--strict", action="store_true", help="Return non-zero when platform checks are missing or failing.")
    args = parser.parse_args()

    token = os.environ.get(args.token_env)
    sections: list[str] = []

    local_lines, local_ok = audit_local_files()
    platform_lines, platform_ok = audit_platform(args.repo, args.branch, token)

    sections.extend(local_lines)
    sections.append("")
    sections.extend(platform_lines)

    print("\n".join(sections))

    if not local_ok:
        return 1
    if args.strict and not platform_ok:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
