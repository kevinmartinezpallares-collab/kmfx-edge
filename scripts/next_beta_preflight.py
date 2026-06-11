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
DEFAULT_NEXT_BASE_URL = "https://beta.kmfxedge.com"


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
    body: bytes | None = None,
) -> tuple[int, Any, dict[str, str]]:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "KMFX-Next-Beta-Preflight/1.0",
        **(headers or {}),
    }
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
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


def request_json_payload(
    url: str,
    payload: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
    method: str = "POST",
    timeout: int = 20,
) -> tuple[int, Any, dict[str, str]]:
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return request_json_with_headers(
        url,
        headers=request_headers,
        method=method,
        timeout=timeout,
        body=body,
    )


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


def payload_has_sensitive_account_key(payload: Any) -> bool:
    if isinstance(payload, dict):
        for key, value in payload.items():
            normalized_key = str(key).lower().replace("-", "_")
            if normalized_key in {"connection_key", "kmfx_key", "account_key"} and value:
                return True
            if normalized_key == "key" and isinstance(value, str) and value.strip():
                return True
            if payload_has_sensitive_account_key(value):
                return True
    if isinstance(payload, list):
        return any(payload_has_sensitive_account_key(item) for item in payload)
    return False


def student_surface_audit(api_base_url: str) -> dict[str, Any]:
    base_url = api_base_url.rstrip("/")
    snapshot_status, snapshot_payload, _snapshot_headers = request_json_with_headers(
        f"{base_url}/api/accounts/snapshot?view=summary",
        timeout=20,
    )
    snapshot_accounts = snapshot_payload.get("accounts") if isinstance(snapshot_payload, dict) else None
    snapshot_closed = (
        snapshot_status == 200
        and isinstance(snapshot_payload, dict)
        and snapshot_payload.get("auth_required") is True
        and snapshot_accounts == []
    )

    checkout_status, checkout_payload, _checkout_headers = request_json_payload(
        f"{base_url}/api/billing/checkout",
        {},
        timeout=20,
    )
    checkout_open = (
        200 <= checkout_status < 300
        and isinstance(checkout_payload, dict)
        and bool(checkout_payload.get("checkout_url") or checkout_payload.get("url"))
    )
    checkout_requires_auth = checkout_status == 401 and (
        isinstance(checkout_payload, dict) and checkout_payload.get("reason") == "auth_required"
    )

    portal_status, portal_payload, _portal_headers = request_json_payload(
        f"{base_url}/api/billing/portal",
        {},
        timeout=20,
    )
    portal_open = (
        200 <= portal_status < 300
        and isinstance(portal_payload, dict)
        and bool(portal_payload.get("portal_url") or portal_payload.get("url"))
    )
    portal_requires_auth = portal_status == 401 and (
        isinstance(portal_payload, dict) and portal_payload.get("reason") == "auth_required"
    )

    link_status, link_payload, _link_headers = request_json_payload(
        f"{base_url}/api/accounts/link",
        {"alias": "KMFX preflight unauth"},
        timeout=20,
    )
    link_open = (
        200 <= link_status < 300
        and isinstance(link_payload, dict)
        and link_payload.get("ok") is True
        and (bool(link_payload.get("account") or link_payload.get("account_id")) or payload_has_sensitive_account_key(link_payload))
    )
    link_requires_auth = link_status == 401 and (
        isinstance(link_payload, dict) and link_payload.get("reason") == "auth_required"
    )

    fake_account_id = "preflight-no-auth-account"
    key_status, key_payload, _key_headers = request_json_with_headers(
        f"{base_url}/api/accounts/{urllib.parse.quote(fake_account_id, safe='')}/connection-key",
        timeout=20,
    )
    connection_key_open = 200 <= key_status < 300 and payload_has_sensitive_account_key(key_payload)
    connection_key_requires_auth = key_status == 401 and (
        isinstance(key_payload, dict) and key_payload.get("reason") == "auth_required"
    )

    student_auth_confirmed = env_value("KMFX_STUDENT_BETA_AUTH_READY") in {"1", "true", "TRUE", "yes", "YES"}
    student_billing_confirmed = env_value("KMFX_STUDENT_BETA_BILLING_VERIFIED") in {"1", "true", "TRUE", "yes", "YES"}
    student_launcher_confirmed = env_value("KMFX_STUDENT_BETA_LAUNCHER_VERIFIED") in {"1", "true", "TRUE", "yes", "YES"}
    student_reconciliation_confirmed = env_value("KMFX_STUDENT_BETA_RECONCILIATION_VERIFIED") in {
        "1",
        "true",
        "TRUE",
        "yes",
        "YES",
    }

    return {
        "snapshot_closed_without_auth": snapshot_closed,
        "snapshot_status": snapshot_status,
        "checkout_requires_auth": checkout_requires_auth,
        "checkout_status": checkout_status,
        "checkout_open_without_auth": checkout_open,
        "portal_requires_auth": portal_requires_auth,
        "portal_status": portal_status,
        "portal_open_without_auth": portal_open,
        "account_link_requires_auth": link_requires_auth,
        "account_link_status": link_status,
        "account_link_open_without_auth": link_open,
        "connection_key_requires_auth": connection_key_requires_auth,
        "connection_key_status": key_status,
        "connection_key_open_without_auth": connection_key_open,
        "auth_confirmed": student_auth_confirmed,
        "billing_confirmed": student_billing_confirmed,
        "launcher_confirmed": student_launcher_confirmed,
        "reconciliation_confirmed": student_reconciliation_confirmed,
    }


def next_frontend_audit(next_base_url: str) -> dict[str, Any]:
    base_url = next_base_url.rstrip("/")
    dashboard_status, dashboard_payload, dashboard_headers = request_json_with_headers(
        f"{base_url}/dashboard",
        timeout=20,
    )
    login_status, _login_payload, login_headers = request_json_with_headers(
        f"{base_url}/login",
        timeout=20,
    )
    public_auth_status, public_auth_payload, public_auth_headers = request_json_with_headers(
        f"{base_url}/api/kmfx/public-auth-config",
        timeout=20,
    )
    public_auth = public_auth_payload if isinstance(public_auth_payload, dict) else {}
    supabase_url = str(public_auth.get("supabaseUrl") or "").strip()
    publishable_key = str(public_auth.get("supabasePublishableKey") or "").strip()
    supabase_host = ""
    if supabase_url:
        try:
            supabase_host = urllib.parse.urlparse(supabase_url).netloc
        except ValueError:
            supabase_host = ""

    dashboard_basic_auth = "basic" in dashboard_headers.get("www-authenticate", "").lower()
    login_basic_auth = "basic" in login_headers.get("www-authenticate", "").lower()

    return {
        "base_url": base_url,
        "dashboard_status": dashboard_status,
        "dashboard_basic_auth_gate": dashboard_basic_auth,
        "dashboard_server_error": dashboard_status >= 500,
        "login_status": login_status,
        "login_basic_auth_gate": login_basic_auth,
        "login_server_error": login_status >= 500,
        "public_auth_config_status": public_auth_status,
        "public_auth_config_ok": public_auth_status == 200 and public_auth.get("ok") is True,
        "public_auth_cache_control": public_auth_headers.get("cache-control", ""),
        "has_supabase_url": bool(supabase_url),
        "has_supabase_publishable_key": bool(publishable_key),
        "supabase_host": supabase_host,
        "raw_error": str(dashboard_payload.get("raw") or "")[:120]
        if isinstance(dashboard_payload, dict)
        else "",
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
    expected = [
        "validate:cascade",
        "test:smoke:routes",
        "qa:mobile:v1",
        "qa:live:snapshot",
        "qa:live:integrity",
        "preflight:beta",
        "preflight:platform",
    ]
    result["scripts"] = {name: name in scripts for name in expected}
    return result


def vercel_local_check() -> dict[str, Any]:
    root_project_path = ROOT / ".vercel" / "project.json"
    web_next_project_path = WEB_NEXT / ".vercel" / "project.json"

    def load_project(path: Path) -> dict[str, Any]:
        if not path.exists():
            return {"linked": False}
        payload = json.loads(path.read_text(encoding="utf-8"))
        return {
            "linked": True,
            "projectName": payload.get("projectName"),
            "projectId": payload.get("projectId"),
        }

    root_project = load_project(root_project_path)
    web_next_project = load_project(web_next_project_path)
    warnings: list[str] = []
    blockers: list[str] = []

    if root_project.get("linked"):
        warnings.append("root_vercel_project_is_legacy_surface_do_not_cutover_next_here")
    if not web_next_project.get("linked"):
        blockers.append("apps_web_next_vercel_project_not_linked")
    elif web_next_project.get("projectName") != "kmfx-edge-next-beta":
        blockers.append("apps_web_next_vercel_project_is_not_beta")

    return {
        "linked": bool(web_next_project.get("linked")),
        "projectName": web_next_project.get("projectName"),
        "projectId": web_next_project.get("projectId"),
        "rootProjectName": root_project.get("projectName"),
        "rootProjectId": root_project.get("projectId"),
        "warnings": warnings,
        "blockers": blockers,
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
    next_base_url = args.next_base_url or env_value("KMFX_NEXT_BASE_URL") or DEFAULT_NEXT_BASE_URL
    headers, preview_warnings = resolve_preview_headers(service_id)
    render_health = health_check(api_base_url)
    worker_health = health_check(worker_base_url)
    next_frontend = next_frontend_audit(next_base_url)
    snapshot = snapshot_audit(api_base_url, headers)
    surface = browser_surface_audit(api_base_url, worker_base_url)
    student = student_surface_audit(api_base_url) if scope == "student" else {}
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
    if next_frontend["dashboard_basic_auth_gate"] or next_frontend["login_basic_auth_gate"]:
        blockers.append("next_beta_basic_auth_gate_enabled")
    if next_frontend["dashboard_server_error"]:
        blockers.append("next_dashboard_server_error")
    if next_frontend["login_server_error"]:
        blockers.append("next_login_server_error")
    if not next_frontend["public_auth_config_ok"]:
        blockers.append("next_public_auth_config_missing")
    if not next_frontend["has_supabase_url"]:
        blockers.append("next_public_supabase_url_missing")
    if not next_frontend["has_supabase_publishable_key"]:
        blockers.append("next_public_supabase_publishable_key_missing")
    if "no-store" not in str(next_frontend.get("public_auth_cache_control") or "").lower():
        warnings.append("next_public_auth_config_not_no_store")
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
    elif scope == "student" and not snapshot["ok"]:
        warnings.append("snapshot_not_ready_ignored_until_student_auth_scope_has_user")
    if scope == "student":
        if not student.get("snapshot_closed_without_auth"):
            blockers.append("student_snapshot_without_auth_not_closed")
        if not student.get("checkout_requires_auth"):
            blockers.append("student_billing_checkout_auth_contract_failed")
        if student.get("checkout_open_without_auth"):
            blockers.append("student_billing_checkout_open_without_auth")
        if not student.get("portal_requires_auth"):
            blockers.append("student_billing_portal_auth_contract_failed")
        if student.get("portal_open_without_auth"):
            blockers.append("student_billing_portal_open_without_auth")
        if not student.get("account_link_requires_auth"):
            blockers.append("student_account_link_auth_contract_failed")
        if student.get("account_link_open_without_auth"):
            blockers.append("student_account_link_open_without_auth")
        if not student.get("connection_key_requires_auth"):
            blockers.append("student_connection_key_auth_contract_failed")
        if student.get("connection_key_open_without_auth"):
            blockers.append("student_connection_key_open_without_auth")
        if not student.get("auth_confirmed"):
            blockers.append("student_auth_user_isolation_not_confirmed")
        if not student.get("billing_confirmed"):
            blockers.append("student_billing_live_rehearsal_not_confirmed")
        if not student.get("launcher_confirmed"):
            blockers.append("student_launcher_flow_not_confirmed")
        if not student.get("reconciliation_confirmed"):
            blockers.append("student_mt5_reconciliation_not_confirmed")
    if snapshot["stale"]:
        warnings.append(f"snapshot_has_stale_accounts:{snapshot['stale']}")
    warnings.extend(str(item) for item in vercel.get("warnings", []))
    blockers.extend(str(item) for item in vercel.get("blockers", []))
    if git["ahead"]:
        warnings.append("local_branch_ahead_of_origin")
    if git["dirty_entries"]:
        warnings.append(f"dirty_worktree_entries:{git['dirty_entries']}")

    return {
        "status": "blocked" if blockers else "ready",
        "scope": scope,
        "api_base_url": api_base_url,
        "worker_base_url": worker_base_url,
        "next_base_url": next_base_url,
        "render": render_health,
        "worker": worker_health,
        "next_frontend": next_frontend,
        "surface": surface,
        "student": student,
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
    next_frontend = report["next_frontend"]
    print(
        "Next beta: {base_url} | dashboard={dashboard_status} | login={login_status} | public_auth={public_auth_config_ok} | supabase_host={supabase_host}".format(
            **next_frontend
        )
    )
    surface = report["surface"]
    print(
        "Surface: backend_legacy_blocked={backend_legacy_blocked}, worker_accounts_closed={worker_accounts_closed}, worker_mt5_cors_ok={worker_mt5_cors_ok}".format(
            **surface
        )
    )
    if report.get("student"):
        student = report["student"]
        print(
            "Student gates: snapshot_closed={snapshot_closed_without_auth}, checkout_auth={checkout_requires_auth}, portal_auth={portal_requires_auth}, account_link_auth={account_link_requires_auth}, key_auth={connection_key_requires_auth}".format(
                **student
            )
        )
        print(
            "Student confirmations: auth={auth_confirmed}, billing={billing_confirmed}, launcher={launcher_confirmed}, reconciliation={reconciliation_confirmed}".format(
                **student
            )
        )
    snapshot = report["snapshot"]
    print(
        "Snapshot: accounts={accounts}, ready={ready}, stale={stale}, missing_payload={missing_payload}, auth_required={auth_required}".format(
            **snapshot
        )
    )
    print(f"Next local: exists={report['local_next']['exists']} scripts={report['local_next']['scripts']}")
    print(
        "Vercel local: linked={linked} project={projectName} root_project={rootProjectName}".format(
            **report["vercel"]
        )
    )
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
    parser.add_argument("--next-base-url", default="")
    parser.add_argument("--scope", choices=("full", "platform", "student"), default="full")
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
