#!/usr/bin/env python3
"""Operational beta monitor for KMFX Edge.

This script intentionally avoids dependencies. It loads optional secrets from
~/.kmfx-beta-monitor.env, then checks the beta frontend, backend, MT5 proxy and
best-effort Render usage signals.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ENV = Path.home() / ".kmfx-beta-monitor.env"


def load_private_env() -> list[str]:
    warnings: list[str] = []
    if not PRIVATE_ENV.exists():
        warnings.append(f"private_env_missing:{PRIVATE_ENV}")
        return warnings

    try:
        for raw_line in PRIVATE_ENV.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError as exc:
        warnings.append(f"private_env_read_failed:{exc}")
    return warnings


def request(method: str, url: str, *, headers: dict[str, str] | None = None) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        method=method,
        headers={
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "KMFX-Beta-Usage-Monitor/1.0",
            **(headers or {}),
        },
    )
    try:
        opener = urllib.request.build_opener(NoRedirectHandler)
        with opener.open(req, timeout=20) as resp:
            body = resp.read()
            return {
                "status": resp.status,
                "headers": {str(k).lower(): str(v) for k, v in resp.headers.items()},
                "body": body.decode("utf-8", errors="replace")[:800],
            }
    except urllib.error.HTTPError as exc:
        body = exc.read()
        return {
            "status": exc.code,
            "headers": {str(k).lower(): str(v) for k, v in exc.headers.items()},
            "body": body.decode("utf-8", errors="replace")[:800],
        }
    except urllib.error.URLError as exc:
        return {"status": 0, "headers": {}, "body": str(exc)}


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


def json_body(response: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(str(response.get("body") or "{}"))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def render_pipeline_usage() -> dict[str, Any]:
    token = (
        os.environ.get("RENDER_API_KEY")
        or os.environ.get("RENDER_API_TOKEN")
        or os.environ.get("RENDER_TOKEN")
        or ""
    ).strip()
    if not token:
        return {"ok": False, "reason": "missing_render_api_key"}

    env = dict(os.environ)
    env["RENDER_API_KEY"] = token
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "render_pipeline_minutes_mtd.py"), "--name-contains", "kmfx"],
        cwd=str(ROOT),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        payload = {"ok": False, "reason": "render_pipeline_output_not_json", "stderr": proc.stderr[:400]}
    payload["returncode"] = proc.returncode
    return payload


def main() -> int:
    warnings = load_private_env()
    checks: list[dict[str, Any]] = []

    dashboard = request("HEAD", "https://beta.kmfxedge.com/dashboard")
    checks.append(
        {
            "name": "beta_no_basic_auth",
            "ok": "basic" not in dashboard["headers"].get("www-authenticate", "").lower(),
            "status": dashboard["status"],
            "location": dashboard["headers"].get("location", ""),
        }
    )
    checks.append(
        {
            "name": "beta_dashboard_requires_login",
            "ok": dashboard["status"] in {302, 303, 307, 308}
            and dashboard["headers"].get("location", "").startswith("/login"),
            "status": dashboard["status"],
            "location": dashboard["headers"].get("location", ""),
        }
    )

    for name, url in {
        "backend_health": "https://kmfx-edge-api.onrender.com/health",
        "mt5_api_health": "https://mt5-api.kmfxedge.com/health",
    }.items():
        response = request("GET", url)
        payload = json_body(response)
        checks.append({"name": name, "ok": response["status"] == 200 and payload.get("ok") is True})

    snapshot = request(
        "GET",
        "https://kmfx-edge-api.onrender.com/api/accounts/snapshot?view=summary",
        headers={"Origin": "https://beta.kmfxedge.com"},
    )
    snapshot_payload = json_body(snapshot)
    checks.append(
        {
            "name": "snapshot_public_requires_auth",
            "ok": snapshot["status"] == 200
            and snapshot_payload.get("auth_required") is True
            and snapshot_payload.get("accounts") == [],
            "bandwidth_guard": snapshot["headers"].get("x-kmfx-bandwidth-guard", ""),
            "bandwidth_usage": snapshot["headers"].get("x-kmfx-bandwidth-usage", ""),
        }
    )

    render_usage = render_pipeline_usage()
    if not render_usage.get("ok"):
        warnings.append(str(render_usage.get("reason") or "render_usage_unavailable"))

    failed = [check for check in checks if not check.get("ok")]
    result = {
        "ok": not failed,
        "checks": checks,
        "warnings": warnings,
        "render_pipeline_usage": render_usage,
        "tokens_present": {
            "render": bool(
                os.environ.get("RENDER_API_KEY")
                or os.environ.get("RENDER_API_TOKEN")
                or os.environ.get("RENDER_TOKEN")
            ),
            "supabase": bool(os.environ.get("SUPABASE_ACCESS_TOKEN")),
        },
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
