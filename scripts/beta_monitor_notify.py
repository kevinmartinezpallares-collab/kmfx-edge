#!/usr/bin/env python3
"""Send an optional beta monitor failure notification.

The notifier is intentionally dependency-free and webhook-provider agnostic. If
the URL looks like Discord it sends `{content}`, otherwise it sends Slack-style
`{text}` JSON. Missing webhook config is not a failure because GitHub Actions
already marks the monitor job red.
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


def load_report(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def compact_check_list(checks: list[dict[str, Any]], *, failed_only: bool) -> str:
    selected = [check for check in checks if (not failed_only or not check.get("ok"))]
    if not selected:
        return "ninguno"
    names = [str(check.get("name") or "unknown") for check in selected[:6]]
    suffix = "" if len(selected) <= 6 else f" (+{len(selected) - 6} mas)"
    return ", ".join(names) + suffix


def build_message(report: dict[str, Any]) -> str:
    checks = report.get("checks")
    checks = checks if isinstance(checks, list) else []
    warnings = report.get("warnings")
    warnings = warnings if isinstance(warnings, list) else []
    render_usage = report.get("render_pipeline_usage")
    render_usage = render_usage if isinstance(render_usage, dict) else {}
    totals = render_usage.get("totals")
    totals = totals if isinstance(totals, dict) else {}

    run_id = os.environ.get("GITHUB_RUN_ID", "")
    server_url = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    run_url = f"{server_url}/{repository}/actions/runs/{run_id}" if repository and run_id else ""
    deployment_id = next(
        (
            str(check.get("deployment_id"))
            for check in checks
            if check.get("name") == "beta_version_endpoint" and check.get("deployment_id")
        ),
        "",
    )

    lines = [
        "KMFX Beta Monitor fallo",
        f"Frontend: {report.get('frontend_url') or 'desconocido'}",
        f"Backend: {report.get('backend_url') or 'desconocido'}",
        f"MT5 API: {report.get('mt5_api_url') or 'desconocido'}",
        f"Deployment: {deployment_id or 'desconocido'}",
        f"Checks fallidos: {compact_check_list(checks, failed_only=True)}",
        f"Warnings: {', '.join(str(item) for item in warnings[:6]) if warnings else 'ninguno'}",
        f"Render deploy minutes MTD: {totals.get('deploy_minutes_sum', 'n/d')}",
    ]
    if run_url:
        lines.append(f"GitHub Actions: {run_url}")
    return "\n".join(lines)


def post_webhook(url: str, message: str) -> tuple[bool, str]:
    payload = {"content": message} if "discord.com/api/webhooks" in url else {"text": message}
    request = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "KMFX-Beta-Monitor-Notifier/1.0",
        },
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return 200 <= response.status < 300, f"status={response.status}"
    except urllib.error.HTTPError as exc:
        return False, f"status={exc.code}"
    except urllib.error.URLError as exc:
        return False, str(exc.reason)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default="beta-monitor.json")
    args = parser.parse_args()

    webhook_url = (os.environ.get("BETA_MONITOR_WEBHOOK_URL") or "").strip()
    if not webhook_url:
        print("BETA_MONITOR_WEBHOOK_URL not set; relying on GitHub Actions failure notification.")
        return 0

    report = load_report(Path(args.report))
    message = build_message(report)
    ok, detail = post_webhook(webhook_url, message)
    if ok:
        print(f"beta monitor notification sent: {detail}")
        return 0

    print(f"beta monitor notification failed: {detail}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
