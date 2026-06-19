#!/usr/bin/env python3
"""Operational production monitor for KMFX Edge.

This script intentionally avoids dependencies. It loads optional secrets from
~/.kmfx-production-monitor.env or the legacy ~/.kmfx-beta-monitor.env, then
checks the frontend, backend, MT5 proxy and best-effort Render usage signals.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ENV = Path.home() / ".kmfx-production-monitor.env"
LEGACY_PRIVATE_ENV = Path.home() / ".kmfx-beta-monitor.env"
DEFAULT_FRONTEND_URL = "https://kmfxedge.com"
DEFAULT_BACKEND_URL = "https://kmfx-edge-api.onrender.com"
DEFAULT_MT5_API_URL = "https://mt5-api.kmfxedge.com"
LATENCY_WARNING_MS = 2500
DEFAULT_MAX_BANDWIDTH_USAGE = 0.05
DEFAULT_CHECK_PREFIX = "production"
WORKSPACE_PRIVATE_ROUTES = (
    "/dashboard",
    "/accounts",
    "/capital",
    "/analytics",
    "/analytics/daily",
    "/analytics/hourly",
    "/analytics/risk",
    "/trades",
    "/notes",
    "/calendar",
    "/tools/calculator",
    "/study",
    "/settings",
    "/settings/subscription",
    "/subscription",
)


def load_private_env() -> list[str]:
    warnings: list[str] = []
    env_files = [path for path in (PRIVATE_ENV, LEGACY_PRIVATE_ENV) if path.exists()]
    if not env_files:
        warnings.append(f"private_env_missing:{PRIVATE_ENV}")
        return warnings

    for env_file in env_files:
        try:
            for raw_line in env_file.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        except OSError as exc:
            warnings.append(f"private_env_read_failed:{env_file}:{exc}")
    return warnings


def request(method: str, url: str, *, headers: dict[str, str] | None = None) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        method=method,
        headers={
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "KMFX-Production-Usage-Monitor/1.0",
            **(headers or {}),
        },
    )
    start = time.perf_counter()
    try:
        opener = urllib.request.build_opener(NoRedirectHandler)
        with opener.open(req, timeout=20) as resp:
            body = resp.read()
            return {
                "status": resp.status,
                "headers": {str(k).lower(): str(v) for k, v in resp.headers.items()},
                "body": body.decode("utf-8", errors="replace")[:800],
                "elapsed_ms": round((time.perf_counter() - start) * 1000),
            }
    except urllib.error.HTTPError as exc:
        body = exc.read()
        return {
            "status": exc.code,
            "headers": {str(k).lower(): str(v) for k, v in exc.headers.items()},
            "body": body.decode("utf-8", errors="replace")[:800],
            "elapsed_ms": round((time.perf_counter() - start) * 1000),
        }
    except urllib.error.URLError as exc:
        return {
            "status": 0,
            "headers": {},
            "body": str(exc),
            "elapsed_ms": round((time.perf_counter() - start) * 1000),
        }


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


def json_body(response: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(str(response.get("body") or "{}"))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def normalize_base_url(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def env_value(primary: str, legacy: str, default: str = "") -> str:
    return os.environ.get(primary) or os.environ.get(legacy) or default


def parse_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(str(value or "").strip())
    except ValueError:
        return fallback


def is_login_redirect(location: str) -> bool:
    parsed = urllib.parse.urlparse(location)
    return parsed.path == "/login"


def is_vercel_deployment_protection_response(response: dict[str, Any]) -> bool:
    headers = response.get("headers", {})
    body = str(response.get("body") or "").lower()
    set_cookie = str(headers.get("set-cookie") or "").lower()
    return int(response.get("status") or 0) == 401 and (
        "_vercel_sso_nonce=" in set_cookie
        or "authentication required" in body
        or "deployment-protection" in body
        or "protection-bypass-automation" in body
    )


def check_response_latency(response: dict[str, Any], name: str, warnings: list[str]) -> None:
    elapsed = int(response.get("elapsed_ms") or 0)
    if elapsed > LATENCY_WARNING_MS:
        warnings.append(f"slow_check:{name}:{elapsed}ms")


def append_check(
    checks: list[dict[str, Any]],
    warnings: list[str],
    *,
    name: str,
    ok: bool,
    response: dict[str, Any] | None = None,
    **details: Any,
) -> None:
    if response is not None:
        check_response_latency(response, name, warnings)
        details.setdefault("status", response.get("status"))
        details.setdefault("elapsed_ms", response.get("elapsed_ms"))
    checks.append({"name": name, "ok": bool(ok), **details})


def check_name(prefix: str, name: str) -> str:
    return f"{prefix}_{name}" if prefix else name


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
    frontend_url = normalize_base_url(
        env_value("KMFX_PRODUCTION_FRONTEND_URL", "KMFX_BETA_FRONTEND_URL", DEFAULT_FRONTEND_URL),
    )
    backend_url = normalize_base_url(
        env_value("KMFX_PRODUCTION_BACKEND_URL", "KMFX_BETA_BACKEND_URL", DEFAULT_BACKEND_URL),
    )
    mt5_api_url = normalize_base_url(
        env_value("KMFX_PRODUCTION_MT5_API_URL", "KMFX_BETA_MT5_API_URL", DEFAULT_MT5_API_URL),
    )
    mt5_cors_origin = normalize_base_url(
        env_value("KMFX_PRODUCTION_MT5_CORS_ORIGIN", "KMFX_BETA_MT5_CORS_ORIGIN", "https://kmfxedge.com"),
    )
    check_prefix = str(os.environ.get("KMFX_MONITOR_CHECK_PREFIX") or DEFAULT_CHECK_PREFIX).strip()
    max_bandwidth_usage = parse_float(
        env_value("KMFX_PRODUCTION_MAX_BANDWIDTH_USAGE", "KMFX_BETA_MAX_BANDWIDTH_USAGE"),
        DEFAULT_MAX_BANDWIDTH_USAGE,
    )

    root = request("HEAD", f"{frontend_url}/")
    login = request("GET", f"{frontend_url}/login")
    frontend_vercel_protected = is_vercel_deployment_protection_response(root) or (
        is_vercel_deployment_protection_response(login)
    )
    if frontend_vercel_protected:
        warnings.append(check_name(check_prefix, "frontend_vercel_deployment_protection_enabled"))

    append_check(
        checks,
        warnings,
        name=check_name(check_prefix, "root_loads"),
        ok=frontend_vercel_protected
        or root["status"] == 200
        or (
            root["status"] in {302, 303, 307, 308}
            and is_login_redirect(root["headers"].get("location", ""))
        ),
        response=root,
        location=root["headers"].get("location", ""),
        protected=frontend_vercel_protected,
    )

    version = request("GET", f"{frontend_url}/api/kmfx/version")
    version_payload = json_body(version)
    append_check(
        checks,
        warnings,
        name=check_name(check_prefix, "version_endpoint"),
        ok=frontend_vercel_protected
        or (
            version["status"] == 200
            and version_payload.get("ok") is True
            and bool(version_payload.get("deploymentId"))
        ),
        response=version,
        deployment_id=version_payload.get("deploymentId", ""),
        environment=version_payload.get("environment", ""),
        protected=frontend_vercel_protected,
    )

    public_auth = request("GET", f"{frontend_url}/api/kmfx/public-auth-config")
    public_auth_payload = json_body(public_auth)
    append_check(
        checks,
        warnings,
        name=check_name(check_prefix, "public_auth_config"),
        ok=frontend_vercel_protected
        or (
            public_auth["status"] == 200
            and public_auth_payload.get("ok") is True
            and bool(public_auth_payload.get("supabaseUrl"))
            and bool(public_auth_payload.get("supabasePublishableKey"))
        ),
        response=public_auth,
        supabase_host=urllib.parse.urlparse(str(public_auth_payload.get("supabaseUrl") or "")).netloc,
        protected=frontend_vercel_protected,
    )

    append_check(
        checks,
        warnings,
        name=check_name(check_prefix, "login_page_loads"),
        ok=frontend_vercel_protected or login["status"] == 200,
        response=login,
        protected=frontend_vercel_protected,
    )

    dashboard = request("HEAD", f"{frontend_url}/dashboard")
    append_check(
        checks,
        warnings,
        name=check_name(check_prefix, "no_basic_auth"),
        ok="basic" not in dashboard["headers"].get("www-authenticate", "").lower(),
        response=dashboard,
        location=dashboard["headers"].get("location", ""),
    )

    for path in WORKSPACE_PRIVATE_ROUTES:
        response = dashboard if path == "/dashboard" else request("HEAD", f"{frontend_url}{path}")
        append_check(
            checks,
            warnings,
            name=check_name(check_prefix, f"route_{path.strip('/')}_requires_login"),
            ok=frontend_vercel_protected
            or (
                response["status"] in {302, 303, 307, 308}
                and is_login_redirect(response["headers"].get("location", ""))
            ),
            response=response,
            location=response["headers"].get("location", ""),
            protected=frontend_vercel_protected,
        )

    billing_status = request("GET", f"{frontend_url}/api/kmfx/billing/status")
    billing_status_payload = json_body(billing_status)
    append_check(
        checks,
        warnings,
        name=check_name(check_prefix, "billing_status_requires_auth"),
        ok=frontend_vercel_protected
        or (billing_status["status"] == 401 and billing_status_payload.get("auth_required") is True)
        or (
            billing_status["status"] in {302, 303, 307, 308}
            and is_login_redirect(billing_status["headers"].get("location", ""))
        ),
        response=billing_status,
        location=billing_status["headers"].get("location", ""),
        reason=billing_status_payload.get("reason", ""),
        protected=frontend_vercel_protected,
    )

    checkout = request(
        "POST",
        f"{frontend_url}/api/kmfx/billing/checkout",
        headers={"Content-Type": "application/json"},
    )
    checkout_payload = json_body(checkout)
    append_check(
        checks,
        warnings,
        name=check_name(check_prefix, "checkout_requires_auth"),
        ok=frontend_vercel_protected
        or (checkout["status"] == 401 and checkout_payload.get("auth_required") is True)
        or (
            checkout["status"] in {302, 303, 307, 308}
            and is_login_redirect(checkout["headers"].get("location", ""))
        ),
        response=checkout,
        location=checkout["headers"].get("location", ""),
        reason=checkout_payload.get("reason", ""),
        protected=frontend_vercel_protected,
    )

    pending = request("GET", f"{frontend_url}/api/kmfx/accounts/pending")
    pending_payload = json_body(pending)
    append_check(
        checks,
        warnings,
        name=check_name(check_prefix, "pending_accounts_requires_auth"),
        ok=frontend_vercel_protected
        or (pending["status"] == 401 and pending_payload.get("auth_required") is True)
        or (
            pending["status"] in {302, 303, 307, 308}
            and is_login_redirect(pending["headers"].get("location", ""))
        ),
        response=pending,
        location=pending["headers"].get("location", ""),
        reason=pending_payload.get("reason", ""),
        protected=frontend_vercel_protected,
    )

    for path in (
        "/downloads/KMFX-Launcher-macOS.zip",
        "/downloads/KMFX-Launcher-Windows.exe",
        "/KMFXConnector.ex5",
    ):
        response = request("HEAD", f"{frontend_url}{path}")
        append_check(
            checks,
            warnings,
            name=check_name(check_prefix, f"download_{Path(path).name}_requires_login"),
            ok=frontend_vercel_protected
            or (
                response["status"] in {302, 303, 307, 308}
                and is_login_redirect(response["headers"].get("location", ""))
            ),
            response=response,
            location=response["headers"].get("location", ""),
            protected=frontend_vercel_protected,
        )

    for name, url in {
        "backend_health": f"{backend_url}/health",
        "mt5_api_health": f"{mt5_api_url}/health",
    }.items():
        response = request("GET", url)
        payload = json_body(response)
        append_check(
            checks,
            warnings,
            name=name,
            ok=response["status"] == 200 and payload.get("ok") is True,
            response=response,
        )

    snapshot = request(
        "GET",
        f"{backend_url}/api/accounts/snapshot?view=summary",
        headers={"Origin": frontend_url},
    )
    snapshot_payload = json_body(snapshot)
    snapshot_bandwidth_usage = parse_float(snapshot["headers"].get("x-kmfx-bandwidth-usage", "0"))
    append_check(
        checks,
        warnings,
        name="snapshot_public_requires_auth",
        ok=(
            snapshot["status"] == 200
            and snapshot_payload.get("auth_required") is True
            and snapshot_payload.get("accounts") == []
        )
        or (
            snapshot["status"] == 403
            and snapshot_payload.get("reason") == "legacy_dashboard_live_disabled"
        ),
        response=snapshot,
        bandwidth_guard=snapshot["headers"].get("x-kmfx-bandwidth-guard", ""),
        bandwidth_usage=snapshot["headers"].get("x-kmfx-bandwidth-usage", ""),
        reason=snapshot_payload.get("reason", ""),
    )
    append_check(
        checks,
        warnings,
        name="snapshot_bandwidth_usage_below_threshold",
        ok=snapshot_bandwidth_usage <= max_bandwidth_usage,
        bandwidth_usage=snapshot_bandwidth_usage,
        max_bandwidth_usage=max_bandwidth_usage,
    )

    mt5_cors = request(
        "OPTIONS",
        f"{mt5_api_url}/api/mt5/sync",
        headers={
            "Origin": mt5_cors_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-kmfx-connection-key",
        },
    )
    append_check(
        checks,
        warnings,
        name="mt5_api_cors_allows_expected_origin",
        ok=mt5_cors["headers"].get("access-control-allow-origin") == mt5_cors_origin
        and "X-KMFX-Connection-Key" in mt5_cors["headers"].get("access-control-allow-headers", ""),
        response=mt5_cors,
        allow_origin=mt5_cors["headers"].get("access-control-allow-origin", ""),
        allow_headers=mt5_cors["headers"].get("access-control-allow-headers", ""),
        expected_origin=mt5_cors_origin,
    )

    mt5_cors_unexpected = request(
        "OPTIONS",
        f"{mt5_api_url}/api/mt5/sync",
        headers={
            "Origin": "https://example.invalid",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-kmfx-connection-key",
        },
    )
    append_check(
        checks,
        warnings,
        name="mt5_api_cors_blocks_unexpected_origin",
        ok=mt5_cors_unexpected["headers"].get("access-control-allow-origin") != "https://example.invalid",
        response=mt5_cors_unexpected,
        allow_origin=mt5_cors_unexpected["headers"].get("access-control-allow-origin", ""),
    )

    mt5_accounts = request(
        "GET",
        f"{mt5_api_url}/api/accounts/snapshot?view=summary",
        headers={"Origin": frontend_url},
    )
    append_check(
        checks,
        warnings,
        name="mt5_api_accounts_route_not_proxied",
        ok=mt5_accounts["status"] == 404
        and "access-control-allow-origin" not in mt5_accounts["headers"],
        response=mt5_accounts,
    )

    render_usage = render_pipeline_usage()
    if not render_usage.get("ok"):
        warnings.append(str(render_usage.get("reason") or "render_usage_unavailable"))

    failed = [check for check in checks if not check.get("ok")]
    result = {
        "ok": not failed,
        "frontend_url": frontend_url,
        "backend_url": backend_url,
        "mt5_api_url": mt5_api_url,
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
