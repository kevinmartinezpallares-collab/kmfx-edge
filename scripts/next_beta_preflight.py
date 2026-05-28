#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
WEB_NEXT = ROOT / "apps" / "web-next"
RENDER_API_BASE = "https://api.render.com/v1"
DEFAULT_RENDER_SERVICE_ID = "srv-d79k3b75r7bs73fspuu0"
DEFAULT_API_BASE_URL = "https://kmfx-edge-api.onrender.com"
DEFAULT_WORKER_BASE_URL = "https://mt5-api.kmfxedge.com"


def env_value(*names: str) -> str:
    for name in names:
        value = str(os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def normalize_headers(headers: Any) -> dict[str, str]:
    return {str(key).lower(): str(value) for key, value in headers.items()}


def request_json_with_headers(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    method: str = "GET",
    timeout: int = 20,
) -> tuple[int, Any, dict[str, str]]:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "KMFX-Next-Beta-Preflight/1.0",
        **(headers or {}),
    }
    request = urllib.request.Request(url, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            status = int(response.status)
            response_headers = normalize_headers(response.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        status = int(exc.code)
        response_headers = normalize_headers(exc.headers)
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else {}
    except json.JSONDecodeError:
        payload = {"raw": raw.decode("utf-8", errors="replace")[:300]}
    return status, payload, response_headers


def request_json(url: str, *, headers: dict[str, str] | None = None, timeout: int = 20) -> tuple[int, Any]:
    status, payload, _headers = request_json_with_headers(url, headers=headers, timeout=timeout)
    return status, payload


def render_env(service_id: str, key: str) -> str:
    token = env_value("RENDER_API_KEY", "RENDER_API_TOKEN", "RENDER_TOKEN")
    if not token or not service_id:
        return ""
    quoted_service = urllib.parse.quote(service_id)
    quoted_key = urllib.parse.quote(key)
    status, payload = request_json(
        f"{RENDER_API_BASE}/services/{quoted_service}/env-vars/{quoted_key}",
        headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    if status == 404:
        return ""
    if status < 200 or status >= 300:
        raise RuntimeError(f"render_env_http_{status}:{key}")
    return str(payload.get("value") or "").strip() if isinstance(payload, dict) else ""


def resolve_preview_headers(service_id: str) -> tuple[dict[str, str], list[str]]:
    warnings: list[str] = []
    token = env_value("KMFX_PREVIEW_BEARER_TOKEN") or render_env(service_id, "KMFX_PREVIEW_BEARER_TOKEN")
    email = env_value("KMFX_PREVIEW_USER_EMAIL") or render_env(service_id, "KMFX_PREVIEW_USER_EMAIL")
    user_id = env_value("KMFX_PREVIEW_USER_ID") or render_env(service_id, "KMFX_PREVIEW_USER_ID")
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    else:
        warnings.append("preview_bearer_missing")
    if email:
        headers["X-KMFX-User-Email"] = email
    if user_id:
        headers["X-KMFX-User-Id"] = user_id
    if token and not (email or user_id):
        warnings.append("preview_identity_missing")
    return headers, warnings


def health_check(base_url: str) -> dict[str, Any]:
    status, payload = request_json(
        f"{base_url.rstrip('/')}/health",
        headers={"Accept": "application/json", "User-Agent": "KMFX-Next-Beta-Preflight/1.0"},
    )
    ok = status == 200 and isinstance(payload, dict) and payload.get("ok") is True
    return {
        "ok": ok,
        "status": status,
        "commit": payload.get("render_git_commit") if isinstance(payload, dict) else "",
        "store": payload.get("account_store") if isinstance(payload, dict) else "",
    }


def snapshot_audit(base_url: str, headers: dict[str, str]) -> dict[str, Any]:
    status, payload = request_json(
        f"{base_url.rstrip('/')}/api/accounts/snapshot?view=summary",
        headers=headers,
        timeout=30,
    )
    accounts = payload.get("accounts") if isinstance(payload, dict) else []
    accounts = accounts if isinstance(accounts, list) else []
    now = datetime.now(timezone.utc)
    ready = 0
    stale = 0
    missing_payload = 0
    for account in accounts:
        if not isinstance(account, dict):
            continue
        payload_data = account.get("dashboard_payload") if isinstance(account.get("dashboard_payload"), dict) else {}
        if not payload_data:
            missing_payload += 1
        raw_sync = str(account.get("last_sync_at") or "")
        try:
            parsed_dt = datetime.fromisoformat(raw_sync.replace("Z", "+00:00"))
            if parsed_dt.tzinfo is None:
                parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
            age_minutes = max(0, round((now - parsed_dt.astimezone(timezone.utc)).total_seconds() / 60))
        except ValueError:
            age_minutes = 999999
        if payload_data and age_minutes <= 20:
            ready += 1
        elif payload_data:
            stale += 1
    return {
        "ok": status == 200 and ready > 0,
        "status": status,
        "accounts": len(accounts),
        "ready": ready,
        "stale": stale,
        "missing_payload": missing_payload,
        "auth_required": bool(payload.get("auth_required")) if isinstance(payload, dict) else False,
    }


def browser_surface_audit(api_base_url: str, worker_base_url: str) -> dict[str, Any]:
    origin = "https://kmfxedge.com"
    backend_status, backend_payload, backend_headers = request_json_with_headers(
        f"{api_base_url.rstrip('/')}/api/accounts/snapshot?view=summary",
        headers={"Accept": "application/json", "Origin": origin},
        timeout=20,
    )
    backend_reason = str(backend_payload.get("reason") or "") if isinstance(backend_payload, dict) else ""
    backend_legacy_blocked = (
        backend_status == 403
        and backend_reason == "legacy_dashboard_live_disabled"
        and "access-control-allow-origin" not in backend_headers
    )

    worker_accounts_status, _worker_accounts_payload, worker_accounts_headers = request_json_with_headers(
        f"{worker_base_url.rstrip('/')}/api/accounts/snapshot?view=summary",
        headers={"Accept": "application/json", "Origin": origin},
        timeout=20,
    )
    worker_accounts_closed = (
        worker_accounts_status == 404
        and "access-control-allow-origin" not in worker_accounts_headers
    )

    mt5_status, _mt5_payload, mt5_headers = request_json_with_headers(
        f"{worker_base_url.rstrip('/')}/api/mt5/sync",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-kmfx-connection-key",
        },
        method="OPTIONS",
        timeout=20,
    )
    allow_headers = mt5_headers.get("access-control-allow-headers", "")
    worker_mt5_cors_ok = (
        mt5_status == 204
        and mt5_headers.get("access-control-allow-origin") == origin
        and "X-KMFX-Connection-Key" in allow_headers
        and "X-KMFX-User-Email" not in allow_headers
    )

    return {
        "backend_legacy_blocked": backend_legacy_blocked,
        "backend_legacy_status": backend_status,
        "backend_legacy_reason": backend_reason,
        "backend_legacy_has_browser_cors": "access-control-allow-origin" in backend_headers,
        "worker_accounts_closed": worker_accounts_closed,
        "worker_accounts_status": worker_accounts_status,
        "worker_accounts_has_browser_cors": "access-control-allow-origin" in worker_accounts_headers,
        "worker_mt5_cors_ok": worker_mt5_cors_ok,
        "worker_mt5_preflight_status": mt5_status,
    }


def local_next_checks() -> dict[str, Any]:
    package_json_path = WEB_NEXT / "package.json"
    result = {
        "exists": WEB_NEXT.exists(),
        "package_json": package_json_path.exists(),
        "scripts": {},
    }
    if not package_json_path.exists():
        return result
    package_json = json.loads(package_json_path.read_text(encoding="utf-8"))
    scripts = package_json.get("scripts") if isinstance(package_json, dict) else {}
    expected = ["validate:cascade", "test:smoke:routes", "qa:mobile:v1", "qa:live:snapshot", "qa:live:integrity"]
    result["scripts"] = {name: name in scripts for name in expected}
    return result


def vercel_local_check() -> dict[str, Any]:
    project_path = ROOT / ".vercel" / "project.json"
    if not project_path.exists():
        return {"linked": False}
    payload = json.loads(project_path.read_text(encoding="utf-8"))
    return {
        "linked": True,
        "projectName": payload.get("projectName"),
        "projectId": payload.get("projectId"),
        "warning": "root_vercel_project_is_legacy_surface_do_not_cutover_next_here",
    }


def git_summary() -> dict[str, Any]:
    branch = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    ).stdout.strip()
    status = subprocess.run(
        ["git", "status", "--short", "--branch"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    ).stdout.splitlines()
    return {
        "branch": branch,
        "ahead": any("ahead" in line for line in status[:1]),
        "dirty_entries": max(0, len(status) - 1),
    }


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    scope = str(getattr(args, "scope", "full") or "full")
    service_id = args.render_service_id or env_value("RENDER_SERVICE_ID") or DEFAULT_RENDER_SERVICE_ID
    api_base_url = args.api_base_url or env_value("KMFX_API_BASE_URL") or DEFAULT_API_BASE_URL
    worker_base_url = args.worker_base_url or DEFAULT_WORKER_BASE_URL
    headers, preview_warnings = resolve_preview_headers(service_id)
    render_health = health_check(api_base_url)
    worker_health = health_check(worker_base_url)
    snapshot = snapshot_audit(api_base_url, headers)
    surface = browser_surface_audit(api_base_url, worker_base_url)
    local_next = local_next_checks()
    vercel = vercel_local_check()
    git = git_summary()
    blockers: list[str] = []
    warnings = list(preview_warnings)

    if not local_next.get("exists") or not local_next.get("package_json"):
        blockers.append("apps_web_next_missing")
    for name, present in (local_next.get("scripts") or {}).items():
        if not present:
            blockers.append(f"missing_next_script:{name}")
    if not render_health["ok"]:
        blockers.append("render_health_failed")
    if not worker_health["ok"]:
        blockers.append("worker_health_failed")
    if not surface["backend_legacy_blocked"]:
        blockers.append("legacy_dashboard_live_block_missing")
    if not surface["worker_accounts_closed"]:
        blockers.append("worker_accounts_route_cors_not_closed")
    if not surface["worker_mt5_cors_ok"]:
        blockers.append("worker_mt5_cors_preflight_failed")
    if scope == "full" and not snapshot["ok"]:
        blockers.append("snapshot_has_no_ready_account")
    elif scope == "platform" and not snapshot["ok"]:
        warnings.append("snapshot_not_ready_ignored_in_platform_scope")
    if snapshot["stale"]:
        warnings.append(f"snapshot_has_stale_accounts:{snapshot['stale']}")
    if vercel.get("warning"):
        warnings.append(str(vercel["warning"]))
    if git["ahead"]:
        warnings.append("local_branch_ahead_of_origin")
    if git["dirty_entries"]:
        warnings.append(f"dirty_worktree_entries:{git['dirty_entries']}")

    return {
        "status": "blocked" if blockers else "ready",
        "scope": scope,
        "api_base_url": api_base_url,
        "worker_base_url": worker_base_url,
        "render": render_health,
        "worker": worker_health,
        "surface": surface,
        "snapshot": snapshot,
        "local_next": local_next,
        "vercel": vercel,
        "git": git,
        "blockers": blockers,
        "warnings": warnings,
    }


def print_human(report: dict[str, Any]) -> None:
    print("Next beta preflight")
    print(f"Estado: {report['status']} | scope={report['scope']}")
    print(f"Backend: {report['api_base_url']} | ok={report['render']['ok']} | commit={report['render'].get('commit')}")
    print(f"Worker: {report['worker_base_url']} | ok={report['worker']['ok']} | commit={report['worker'].get('commit')}")
    surface = report["surface"]
    print(
        "Surface: backend_legacy_blocked={backend_legacy_blocked}, worker_accounts_closed={worker_accounts_closed}, worker_mt5_cors_ok={worker_mt5_cors_ok}".format(
            **surface
        )
    )
    snapshot = report["snapshot"]
    print(
        "Snapshot: accounts={accounts}, ready={ready}, stale={stale}, missing_payload={missing_payload}, auth_required={auth_required}".format(
            **snapshot
        )
    )
    print(f"Next local: exists={report['local_next']['exists']} scripts={report['local_next']['scripts']}")
    print(f"Vercel local: linked={report['vercel'].get('linked')} project={report['vercel'].get('projectName')}")
    print(f"Git: branch={report['git']['branch']} ahead={report['git']['ahead']} dirty_entries={report['git']['dirty_entries']}")
    if report["warnings"]:
        print("Avisos:")
        for item in report["warnings"]:
            print(f"- {item}")
    if report["blockers"]:
        print("Bloqueos:")
        for item in report["blockers"]:
            print(f"- {item}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight seguro para beta Next read-only.")
    parser.add_argument("--render-service-id", default="")
    parser.add_argument("--api-base-url", default="")
    parser.add_argument("--worker-base-url", default="")
    parser.add_argument("--scope", choices=("full", "platform"), default="full")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = build_report(args)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_human(report)
    return 1 if report["status"] == "blocked" else 0


if __name__ == "__main__":
    sys.exit(main())
