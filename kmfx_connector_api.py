from __future__ import annotations

import asyncio
import base64
from copy import deepcopy
import hmac
import hashlib
import html as html_lib
import json
import logging
import os
import re
import tempfile
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any
import urllib.error
import urllib.parse
import urllib.request
from uuid import UUID

from fastapi import FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware

from account_keys import hash_connection_key as storage_connection_key_hash
from account_service import AccountService, account_summary_fields_from_payload, compact_dashboard_payload_from_payload
from account_store import JsonFileAccountStore, SupabaseAccountStore
from ai_evidence_report import build_ai_evidence_report
from backtest_real_engine import build_backtest_vs_real_report
from direct_mt5_provider import (
    DirectMt5ProviderError,
    DirectMt5ProviderUnavailable,
    direct_provider_status_dict,
    get_direct_mt5_provider,
    infer_broker_from_server,
    list_direct_mt5_servers,
)
from mt5_strategy_tester_importer import parse_mt5_strategy_tester_reports
from post_trade_review_store import (
    JsonFilePostTradeReviewStore,
    SupabasePostTradeReviewStore,
    normalize_review_record,
)
from risk_enforcement_engine import build_risk_status
from risk_metrics_engine import aggregate_portfolio_risk, build_risk_metrics, extract_previous_risk_snapshot
from risk_policy_engine import build_policy_snapshot, evaluate_risk_policy


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("kmfx_connector_api")

RUNTIME_SYNC_KEY_LOOKUP_MARKER = "sync-key-any-user-6d8a6ab-20260411"
SUPABASE_PROJECT_URL = str(os.getenv("SUPABASE_URL") or os.getenv("KMFX_SUPABASE_URL") or "https://uuhiqreifisppqkawzif.supabase.co").strip().rstrip("/")
SUPABASE_ANON_KEY = str(os.getenv("SUPABASE_ANON_KEY") or os.getenv("KMFX_SUPABASE_ANON_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1aGlxcmVpZmlzcHBxa2F3emlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNDY0MDIsImV4cCI6MjA4OTgyMjQwMn0.-9nOoN8smRXiYscUeNzOCkeDKSakv416JflmhnhVHfM").strip()


PRODUCTION_CORS_ORIGINS = (
    "https://kmfxedge.com",
    "https://www.kmfxedge.com",
    "https://dashboard.kmfxedge.com",
)
LOCAL_CORS_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"


def _env_value(*names: str) -> str:
    for name in names:
        value = str(os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _env_flag(name: str, *, default: bool = False) -> bool:
    value = str(os.getenv(name) or "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "y", "on"}


def _env_int(name: str, *, default: int) -> int:
    value = str(os.getenv(name) or "").strip()
    if not value:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return parsed if parsed >= 0 else default


def _env_float(name: str, *, default: float) -> float:
    value = str(os.getenv(name) or "").strip()
    if not value:
        return default
    try:
        parsed = float(value)
    except ValueError:
        return default
    return parsed if parsed >= 0 else default


def _is_production_runtime() -> bool:
    runtime = _env_value("KMFX_ENV", "APP_ENV", "ENVIRONMENT", "PYTHON_ENV").lower()
    if runtime in {"production", "prod"}:
        return True
    if runtime in {"development", "dev", "local", "test", "testing"}:
        return False
    return _env_flag("KMFX_PRODUCTION") or _env_flag("RENDER")


def _env_bool_override(name: str) -> bool | None:
    value = str(os.getenv(name) or "").strip().lower()
    if not value:
        return None
    if value in {"1", "true", "yes", "y", "on", "enabled"}:
        return True
    if value in {"0", "false", "no", "n", "off", "disabled"}:
        return False
    return None


FEATURE_FLAG_ENV = {
    "direct_mt5": ("KMFX_FEATURE_DIRECT_MT5", "KMFX_ENABLE_DIRECT_MT5"),
    "billing": ("KMFX_FEATURE_BILLING", "KMFX_ENABLE_BILLING"),
    "exports": ("KMFX_FEATURE_EXPORTS", "KMFX_ENABLE_EXPORTS"),
    "journal_ai": ("KMFX_FEATURE_JOURNAL_AI", "KMFX_ENABLE_JOURNAL_AI"),
    "risk_editor": ("KMFX_FEATURE_RISK_EDITOR", "KMFX_ENABLE_RISK_EDITOR"),
}


def kmfx_feature_enabled(feature: str, *, default: bool = True) -> bool:
    normalized = safe_str(feature).lower().replace("-", "_")
    disabled = _env_bool_override(f"KMFX_DISABLE_{normalized.upper()}")
    if disabled is True:
        return False
    for name in FEATURE_FLAG_ENV.get(normalized, (f"KMFX_FEATURE_{normalized.upper()}",)):
        override = _env_bool_override(name)
        if override is not None:
            return override
    return default


def _split_env_list(value: str) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for raw_item in str(value or "").replace(";", ",").split(","):
        item = raw_item.strip().rstrip("/")
        if not item or item == "*" or item in seen:
            continue
        seen.add(item)
        items.append(item)
    return items


def _clean_header_value(value: Any) -> str:
    return str(value or "").strip()


def _origin_host(value: Any) -> str:
    parsed = urllib.parse.urlparse(_clean_header_value(value))
    return parsed.netloc.lower()


def legacy_dashboard_live_block_enabled() -> bool:
    return _env_flag("KMFX_BLOCK_LEGACY_DASHBOARD_LIVE", default=False)


def is_legacy_dashboard_live_path(path: str) -> bool:
    normalized_path = _clean_header_value(path)
    return any(
        normalized_path == prefix or normalized_path.startswith(f"{prefix}/")
        for prefix in LEGACY_DASHBOARD_LIVE_BLOCK_PATH_PREFIXES
    )


def is_legacy_dashboard_live_origin(headers: dict[str, Any]) -> bool:
    origin = _origin_host(headers.get("origin") or headers.get("Origin"))
    referer = _origin_host(headers.get("referer") or headers.get("Referer"))
    return origin in LEGACY_DASHBOARD_LIVE_BLOCK_ORIGINS or referer in LEGACY_DASHBOARD_LIVE_BLOCK_ORIGINS


def legacy_dashboard_live_block_reason(path: str, headers: dict[str, Any]) -> str:
    if not legacy_dashboard_live_block_enabled():
        return ""
    if not is_legacy_dashboard_live_path(path):
        return ""
    if not is_legacy_dashboard_live_origin(headers):
        return ""
    return "legacy_dashboard_live_disabled"


def _parse_admin_launcher_connection_key_mappings(value: str) -> dict[str, set[str]]:
    mappings: dict[str, set[str]] = {}
    for mapping in str(value or "").replace(";", ",").split(","):
        separator = "=" if "=" in mapping else ":"
        if separator not in mapping:
            continue
        user_id, connection_keys = mapping.split(separator, 1)
        normalized_user_id = user_id.strip().lower()
        if not normalized_user_id:
            continue
        normalized_keys = {
            connection_key.strip().lower()
            for connection_key in connection_keys.replace("|", " ").split()
            if connection_key.strip()
        }
        if normalized_keys:
            mappings.setdefault(normalized_user_id, set()).update(normalized_keys)
    return mappings


DEFAULT_ADMIN_USER_IDS: set[str] = set()
DEFAULT_ADMIN_EMAILS = {"kevinmartinezpallares@gmail.com"}


def resolve_admin_user_ids() -> set[str]:
    return set(DEFAULT_ADMIN_USER_IDS)


def resolve_admin_emails() -> set[str]:
    return {email.lower() for email in DEFAULT_ADMIN_EMAILS}


def resolve_admin_launcher_connection_keys_by_user_id() -> dict[str, set[str]]:
    configured = _env_value("KMFX_ADMIN_LAUNCHER_CONNECTION_KEYS")
    if not configured:
        return {}
    return _parse_admin_launcher_connection_key_mappings(configured)


def resolve_cors_allow_origins() -> list[str]:
    explicit_origins = _env_value("KMFX_CORS_ALLOW_ORIGINS", "CORS_ALLOW_ORIGINS")
    if explicit_origins:
        return _split_env_list(explicit_origins)
    return list(PRODUCTION_CORS_ORIGINS)


def resolve_cors_allow_origin_regex() -> str | None:
    explicit_regex = _env_value("KMFX_CORS_ALLOW_ORIGIN_REGEX", "CORS_ALLOW_ORIGIN_REGEX")
    if explicit_regex:
        return explicit_regex
    if _env_flag("KMFX_ALLOW_LOCAL_CORS", default=not _is_production_runtime()):
        return LOCAL_CORS_ORIGIN_REGEX
    return None


CORS_ALLOW_ORIGINS = resolve_cors_allow_origins()
CORS_ALLOW_ORIGIN_REGEX = resolve_cors_allow_origin_regex()
CORS_ALLOW_METHODS = ["GET", "POST", "DELETE", "OPTIONS"]
CORS_ALLOW_HEADERS = [
    "Authorization",
    "Content-Type",
    "X-KMFX-Connection-Key",
    "X-KMFX-User-Email",
    "X-KMFX-User-ID",
    "X-Requested-With",
]
LEGACY_DASHBOARD_LIVE_BLOCK_PATH_PREFIXES = (
    "/accounts",
    "/api/accounts",
    "/api/direct-mt5",
)
LEGACY_DASHBOARD_LIVE_BLOCK_ORIGINS = frozenset(
    urllib.parse.urlparse(origin).netloc.lower()
    for origin in PRODUCTION_CORS_ORIGINS
    if urllib.parse.urlparse(origin).netloc
)
DEFAULT_CONNECTION_PLAN_LIMITS = {
    "disabled": 0,
    "free": 1,
    "core": 2,
    "starter": 2,
    "pro": 5,
    "unlimited": 1000,
    "business": 25,
    "admin": 1000,
}
PLAN_DISPLAY_NAMES = {
    "free": "Free / Demo",
    "core": "Edge Basic",
    "pro": "Edge Pro",
    "unlimited": "Edge Unlimited",
    "desk": "Edge Desk",
}
DEFAULT_PLAN_ENTITLEMENTS: dict[str, dict[str, Any]] = {
    "free": {
        "demoData": True,
        "liveMt5Accounts": 0,
        "launcherConnection": False,
        "dashboardCore": True,
        "riskCore": "partial",
        "riskPolicyEditor": False,
        "localAutoBlock": False,
        "tradesHistory": "limited",
        "calendar": "limited",
        "advancedAnalytics": False,
        "journal": "limited",
        "strategies": False,
        "fundedChallenges": False,
        "portfolio": False,
        "talentProfile": False,
        "rawBridgeDebug": False,
        "exports": False,
        "teamWorkspace": False,
        "prioritySupport": False,
    },
    "core": {
        "demoData": True,
        "liveMt5Accounts": 2,
        "launcherConnection": True,
        "dashboardCore": True,
        "riskCore": True,
        "riskPolicyEditor": "limited",
        "localAutoBlock": False,
        "tradesHistory": True,
        "calendar": True,
        "advancedAnalytics": "limited",
        "journal": "limited",
        "strategies": "limited",
        "fundedChallenges": "limited",
        "portfolio": "limited",
        "talentProfile": "limited",
        "rawBridgeDebug": False,
        "exports": False,
        "teamWorkspace": False,
        "prioritySupport": False,
    },
    "pro": {
        "demoData": True,
        "liveMt5Accounts": 5,
        "launcherConnection": True,
        "dashboardCore": True,
        "riskCore": True,
        "riskPolicyEditor": True,
        "localAutoBlock": True,
        "tradesHistory": True,
        "calendar": True,
        "advancedAnalytics": True,
        "journal": True,
        "strategies": True,
        "fundedChallenges": True,
        "portfolio": True,
        "talentProfile": True,
        "rawBridgeDebug": False,
        "exports": True,
        "teamWorkspace": False,
        "prioritySupport": False,
    },
    "unlimited": {
        "demoData": True,
        "liveMt5Accounts": "custom",
        "launcherConnection": True,
        "dashboardCore": True,
        "riskCore": True,
        "riskPolicyEditor": True,
        "localAutoBlock": True,
        "tradesHistory": True,
        "calendar": True,
        "advancedAnalytics": True,
        "journal": True,
        "strategies": True,
        "fundedChallenges": True,
        "portfolio": True,
        "talentProfile": True,
        "rawBridgeDebug": False,
        "exports": True,
        "teamWorkspace": False,
        "prioritySupport": True,
    },
    "desk": {
        "demoData": True,
        "liveMt5Accounts": "custom",
        "launcherConnection": True,
        "dashboardCore": True,
        "riskCore": True,
        "riskPolicyEditor": True,
        "localAutoBlock": True,
        "tradesHistory": True,
        "calendar": True,
        "advancedAnalytics": True,
        "journal": True,
        "strategies": True,
        "fundedChallenges": True,
        "portfolio": True,
        "talentProfile": True,
        "rawBridgeDebug": True,
        "exports": True,
        "teamWorkspace": True,
        "prioritySupport": True,
    },
}
BILLING_ACTIVE_STATUSES = {"free", "trialing", "active"}
BILLING_ATTENTION_STATUSES = {"past_due"}
BILLING_RESTRICTED_STATUSES = {"unpaid", "paused", "canceled", "incomplete", "incomplete_expired"}
BILLING_STATUS_VALUES = {
    "anonymous",
    *BILLING_ACTIVE_STATUSES,
    *BILLING_ATTENTION_STATUSES,
    *BILLING_RESTRICTED_STATUSES,
}
CONNECTION_RATE_LIMIT_WINDOW_SECONDS = 60
CONNECTION_RATE_LIMIT_BUCKETS: dict[str, tuple[float, int]] = {}
SENSITIVE_RATE_LIMIT_WINDOW_SECONDS = 60
SENSITIVE_RATE_LIMIT_BUCKETS: dict[str, tuple[float, int]] = {}
QUERY_CONNECTION_KEY_FIELD_NAMES = {"connection_key", "kmfxapikey", "api_key"}
SENSITIVE_LOG_FIELD_NAMES = {
    "connection_key",
    "kmfxapikey",
    "api_key",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "password",
    "secret",
    "jwt",
    "bearer",
}
SENSITIVE_LOG_FIELD_HINTS = ("token", "authorization", "password", "secret", "jwt", "bearer")
ADMIN_USER_IDS = resolve_admin_user_ids()
ADMIN_EMAILS = resolve_admin_emails()
ADMIN_LAUNCHER_CONNECTION_KEYS_BY_USER_ID = resolve_admin_launcher_connection_keys_by_user_id()
MT5_CLOUD_BASE_URL = "https://mt5-api.kmfxedge.com"
MT5_CLOUD_SYNC_PATH = "/api/mt5/sync"
MT5_CLOUD_JOURNAL_PATH = "/api/mt5/journal"
MT5_CLOUD_POLICY_PATH = "/api/mt5/policy"
MT5_LOCAL_BASE_URL = "http://127.0.0.1:8766"
MT5_LOCAL_SYNC_PATH = "/mt5/sync"
MT5_LOCAL_JOURNAL_PATH = "/mt5/journal"
MT5_LOCAL_POLICY_PATH = "/mt5/policy"

app = FastAPI(title="KMFX Connector API", version="0.2.0")
app.add_middleware(
    GZipMiddleware,
    minimum_size=max(512, _env_int("KMFX_GZIP_MINIMUM_SIZE_BYTES", default=1024)),
    compresslevel=min(9, max(1, _env_int("KMFX_GZIP_COMPRESS_LEVEL", default=5))),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=CORS_ALLOW_METHODS,
    allow_headers=CORS_ALLOW_HEADERS,
)
log.info(
    "Connector API startup configured | response_helper=connector_json_response marker=%s cors_origins=%s cors_regex=%s admin_ids=%d admin_emails=%d admin_bridge_users=%d routes=%s",
    RUNTIME_SYNC_KEY_LOOKUP_MARKER,
    CORS_ALLOW_ORIGINS,
    CORS_ALLOW_ORIGIN_REGEX or "",
    len(ADMIN_USER_IDS),
    len(ADMIN_EMAILS),
    len(ADMIN_LAUNCHER_CONNECTION_KEYS_BY_USER_ID),
    [
        "/api/mt5/sync",
        "/api/mt5/journal",
        "/api/mt5/policy",
        "/api/accounts/snapshot",
        "/api/billing/status",
        "/api/billing/checkout",
        "/api/billing/portal",
        "/api/billing/webhook",
    ],
)


@app.middleware("http")
async def legacy_dashboard_live_lock(request: Request, call_next):
    reason = legacy_dashboard_live_block_reason(
        request.url.path,
        request.headers,
    )
    if reason:
        return connector_json_response(
            {
                "ok": False,
                "reason": reason,
                "message": "Live account access is disabled from the legacy dashboard during the Next.js beta.",
                "timestamp": now_iso(),
            },
            status_code=403,
        )
    return await call_next(request)


LAST_SYNC_BY_LOGIN: dict[str, dict[str, Any]] = {}
VERIFIED_BEARER_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
VERIFIED_BEARER_CACHE_TTL_SECONDS = _env_int(
    "KMFX_VERIFIED_BEARER_CACHE_TTL_SECONDS",
    default=300 if _is_production_runtime() else 60,
)
ACCOUNTS_SUMMARY_SNAPSHOT_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
ACCOUNTS_SUMMARY_SNAPSHOT_CACHE_TTL_SECONDS = _env_int("KMFX_ACCOUNTS_SUMMARY_CACHE_TTL_SECONDS", default=30)
ACCOUNTS_SUMMARY_SNAPSHOT_CACHE_MAX_ENTRIES = _env_int("KMFX_ACCOUNTS_SUMMARY_CACHE_MAX_ENTRIES", default=128)
BILLING_BACKFILL_FAILURE_CACHE: dict[str, tuple[float, str]] = {}
BILLING_BACKFILL_FAILURE_CACHE_TTL_SECONDS = _env_int("KMFX_BILLING_BACKFILL_FAILURE_CACHE_TTL_SECONDS", default=60)
ACCOUNTS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-accounts.json")
POST_TRADE_REVIEWS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-post-trade-reviews.json")
SYNC_RECEIPTS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-sync-receipts.json")
JOURNAL_RECEIPTS_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-journal-receipts.json")
JOURNAL_TRADES_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-journal-trades.json")
BANDWIDTH_GUARD_STATE_PATH = os.path.join(os.path.dirname(__file__), ".kmfx-bandwidth-guard.json")
SYNC_RECEIPT_TTL = timedelta(days=7)
BILLING_EVENT_PROCESSING_RETRY_AFTER = timedelta(minutes=10)
BANDWIDTH_GUARD_ENABLED = _env_flag("KMFX_BANDWIDTH_GUARD_ENABLED", default=True)
BANDWIDTH_MONTHLY_LIMIT_BYTES = _env_int("KMFX_BANDWIDTH_MONTHLY_LIMIT_BYTES", default=100 * 1024 * 1024 * 1024)
BANDWIDTH_WARNING_RATIO = min(1.0, max(0.0, _env_float("KMFX_BANDWIDTH_WARNING_RATIO", default=0.70)))
BANDWIDTH_SAVING_RATIO = min(1.0, max(BANDWIDTH_WARNING_RATIO, _env_float("KMFX_BANDWIDTH_SAVING_RATIO", default=0.80)))
BANDWIDTH_CRITICAL_RATIO = min(1.0, max(BANDWIDTH_SAVING_RATIO, _env_float("KMFX_BANDWIDTH_CRITICAL_RATIO", default=0.90)))
BANDWIDTH_HARD_RATIO = min(1.0, max(BANDWIDTH_CRITICAL_RATIO, _env_float("KMFX_BANDWIDTH_HARD_RATIO", default=0.95)))
BANDWIDTH_BYTES_FALLBACK_RESPONSE_OVERHEAD = 800
BANDWIDTH_STATE_FLUSH_INTERVAL_SECONDS = min(
    3600.0,
    max(1.0, _env_float("KMFX_BANDWIDTH_STATE_FLUSH_INTERVAL_SECONDS", default=30.0)),
)
BANDWIDTH_STATE_FLUSH_MIN_BYTES = max(0, _env_int("KMFX_BANDWIDTH_STATE_FLUSH_MIN_BYTES", default=1024 * 1024))
BANDWIDTH_FORCED_MODE_VALUES = {"normal", "warning", "saving", "critical", "hard"}
BANDWIDTH_NONESSENTIAL_PREFIXES = (
    "/downloads/",
    "/assets/brand/",
    "/api/admin/",
    "/api/backtests/mt5/import",
)
BANDWIDTH_HEAVY_SUFFIXES = (".zip", ".dmg", ".exe", ".pkg", ".pdf")
BANDWIDTH_CRITICAL_PREFIXES = (
    "/api/mt5/sync",
    "/api/mt5/journal",
    "/api/mt5/policy",
    "/api/accounts/snapshot",
    "/api/billing/",
    "/health",
)


def account_store_service_role_key() -> str:
    return _env_value("SUPABASE_SERVICE_ROLE_KEY", "KMFX_SUPABASE_SERVICE_ROLE_KEY")


def build_account_store():
    requested_store = _env_value("KMFX_ACCOUNT_STORE", "KMFX_ACCOUNT_STORE_BACKEND").lower()
    service_key = account_store_service_role_key()
    should_use_supabase = requested_store in {"supabase", "postgres", "postgresql"} or (_is_production_runtime() and bool(service_key))
    if should_use_supabase and service_key:
        log.info("Account store configured | backend=supabase table=mt5_account_registry")
        return SupabaseAccountStore(SUPABASE_PROJECT_URL, service_key)
    if should_use_supabase and not service_key:
        log.warning("Account store requested Supabase but service role key is missing; falling back to local JSON store.")
    log.info("Account store configured | backend=json path=%s", ACCOUNTS_STATE_PATH)
    return JsonFileAccountStore(ACCOUNTS_STATE_PATH)


account_store = build_account_store()
account_service = AccountService(account_store)


def build_post_trade_review_store():
    requested_store = _env_value("KMFX_POST_TRADE_REVIEW_STORE", "KMFX_ACCOUNT_STORE", "KMFX_ACCOUNT_STORE_BACKEND").lower()
    service_key = account_store_service_role_key()
    should_use_supabase = requested_store in {"supabase", "postgres", "postgresql"} or (_is_production_runtime() and bool(service_key))
    if should_use_supabase and service_key:
        log.info("Post-trade review store configured | backend=supabase table=post_trade_reviews")
        return SupabasePostTradeReviewStore(SUPABASE_PROJECT_URL, service_key)
    if should_use_supabase and not service_key:
        log.warning("Post-trade review store requested Supabase but service role key is missing; falling back to local JSON store.")
    log.info("Post-trade review store configured | backend=json path=%s", POST_TRADE_REVIEWS_STATE_PATH)
    return JsonFilePostTradeReviewStore(POST_TRADE_REVIEWS_STATE_PATH)


post_trade_review_store = build_post_trade_review_store()

# 1003 is our sync validation error bucket:
# the request reached the API, but some required structural field was invalid
# or could not be normalized safely enough for ingestion.
SYNC_ERROR_INVALID_PAYLOAD = 1003


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connector_json_response(content: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=content,
        headers={"Connection": "close"},
    )


def no_store_json_response(content: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=content,
        headers={
            "Connection": "close",
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


def bandwidth_period_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def load_bandwidth_guard_state() -> dict[str, Any]:
    initial_bytes = _env_int("KMFX_BANDWIDTH_INITIAL_EGRESS_BYTES", default=0)
    if not os.path.exists(BANDWIDTH_GUARD_STATE_PATH):
        return {"period": bandwidth_period_key(), "egress_bytes": initial_bytes}
    try:
        with open(BANDWIDTH_GUARD_STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {"period": bandwidth_period_key(), "egress_bytes": 0}
    if not isinstance(payload, dict):
        return {"period": bandwidth_period_key(), "egress_bytes": 0}
    return payload


def save_bandwidth_guard_state(state: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(BANDWIDTH_GUARD_STATE_PATH) or ".", exist_ok=True)
        with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(BANDWIDTH_GUARD_STATE_PATH) or ".", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=True, indent=2)
            temp_path = handle.name
        os.replace(temp_path, BANDWIDTH_GUARD_STATE_PATH)
    except OSError as exc:
        log.warning("Bandwidth guard state could not be saved | error=%s", exc)


def bandwidth_emergency_lockdown_enabled() -> bool:
    """Default production to minimal egress until the Render overage is resolved."""
    return _env_flag("KMFX_BANDWIDTH_EMERGENCY_LOCKDOWN", default=_is_production_runtime())


BANDWIDTH_GUARD_STATE: dict[str, Any] = load_bandwidth_guard_state()
_BANDWIDTH_STATE_LAST_FLUSH_AT = time.monotonic()
_BANDWIDTH_STATE_LAST_FLUSH_BYTES = max(0, int(BANDWIDTH_GUARD_STATE.get("egress_bytes") or 0))
_BANDWIDTH_STATE_DIRTY = False


def maybe_flush_bandwidth_guard_state(*, force: bool = False) -> None:
    global _BANDWIDTH_STATE_LAST_FLUSH_AT
    global _BANDWIDTH_STATE_LAST_FLUSH_BYTES
    global _BANDWIDTH_STATE_DIRTY
    if not _BANDWIDTH_STATE_DIRTY:
        return
    if not force:
        now = time.monotonic()
        elapsed = now - _BANDWIDTH_STATE_LAST_FLUSH_AT
        current_bytes = max(0, int(BANDWIDTH_GUARD_STATE.get("egress_bytes") or 0))
        delta = current_bytes - _BANDWIDTH_STATE_LAST_FLUSH_BYTES
        if elapsed < BANDWIDTH_STATE_FLUSH_INTERVAL_SECONDS and delta < BANDWIDTH_STATE_FLUSH_MIN_BYTES:
            return
        _BANDWIDTH_STATE_LAST_FLUSH_AT = now
        _BANDWIDTH_STATE_LAST_FLUSH_BYTES = current_bytes
    else:
        _BANDWIDTH_STATE_LAST_FLUSH_AT = time.monotonic()
        _BANDWIDTH_STATE_LAST_FLUSH_BYTES = max(0, int(BANDWIDTH_GUARD_STATE.get("egress_bytes") or 0))
    save_bandwidth_guard_state(BANDWIDTH_GUARD_STATE)
    _BANDWIDTH_STATE_DIRTY = False


def bandwidth_guard_snapshot() -> dict[str, Any]:
    if not BANDWIDTH_GUARD_ENABLED or BANDWIDTH_MONTHLY_LIMIT_BYTES <= 0:
        return {"enabled": False, "mode": "disabled", "egress_bytes": 0, "ratio": 0.0}
    current_period = bandwidth_period_key()
    if BANDWIDTH_GUARD_STATE.get("period") != current_period:
        initial_bytes = _env_int("KMFX_BANDWIDTH_INITIAL_EGRESS_BYTES", default=0)
        BANDWIDTH_GUARD_STATE.clear()
        BANDWIDTH_GUARD_STATE.update({"period": current_period, "egress_bytes": initial_bytes})
        global _BANDWIDTH_STATE_DIRTY
        global _BANDWIDTH_STATE_LAST_FLUSH_BYTES
        _BANDWIDTH_STATE_DIRTY = True
        _BANDWIDTH_STATE_LAST_FLUSH_BYTES = initial_bytes
        maybe_flush_bandwidth_guard_state(force=True)
    egress_bytes = max(0, int(BANDWIDTH_GUARD_STATE.get("egress_bytes") or 0))
    ratio = egress_bytes / max(1, BANDWIDTH_MONTHLY_LIMIT_BYTES)
    forced_mode = str(os.getenv("KMFX_BANDWIDTH_FORCE_MODE") or "").strip().lower()
    if forced_mode in BANDWIDTH_FORCED_MODE_VALUES:
        mode = forced_mode
    elif bandwidth_emergency_lockdown_enabled():
        mode = "hard"
    elif ratio >= BANDWIDTH_HARD_RATIO:
        mode = "hard"
    elif ratio >= BANDWIDTH_CRITICAL_RATIO:
        mode = "critical"
    elif ratio >= BANDWIDTH_SAVING_RATIO:
        mode = "saving"
    elif ratio >= BANDWIDTH_WARNING_RATIO:
        mode = "warning"
    else:
        mode = "normal"
    return {
        "enabled": True,
        "period": current_period,
        "mode": mode,
        "egress_bytes": egress_bytes,
        "limit_bytes": BANDWIDTH_MONTHLY_LIMIT_BYTES,
        "ratio": ratio,
        "remaining_bytes": max(0, BANDWIDTH_MONTHLY_LIMIT_BYTES - egress_bytes),
    }


def record_bandwidth_egress(byte_count: int) -> dict[str, Any]:
    snapshot = bandwidth_guard_snapshot()
    if not snapshot.get("enabled"):
        return snapshot
    BANDWIDTH_GUARD_STATE["egress_bytes"] = max(0, int(BANDWIDTH_GUARD_STATE.get("egress_bytes") or 0)) + max(0, int(byte_count))
    BANDWIDTH_GUARD_STATE["updated_at"] = now_iso()
    global _BANDWIDTH_STATE_DIRTY
    _BANDWIDTH_STATE_DIRTY = True
    maybe_flush_bandwidth_guard_state()
    return bandwidth_guard_snapshot()


def bandwidth_route_is_nonessential(path: str) -> bool:
    normalized = str(path or "")
    if any(normalized.startswith(prefix) for prefix in BANDWIDTH_NONESSENTIAL_PREFIXES):
        return True
    return normalized.lower().endswith(BANDWIDTH_HEAVY_SUFFIXES)


def bandwidth_route_is_critical(path: str) -> bool:
    normalized = str(path or "")
    if normalized == "/":
        return True
    return any(normalized.startswith(prefix) for prefix in BANDWIDTH_CRITICAL_PREFIXES)


def bandwidth_sync_interval_seconds() -> int:
    mode = bandwidth_guard_snapshot().get("mode")
    if mode == "hard":
        return _env_int("KMFX_BANDWIDTH_HARD_SYNC_INTERVAL_SECONDS", default=300)
    if mode == "critical":
        return _env_int("KMFX_BANDWIDTH_CRITICAL_SYNC_INTERVAL_SECONDS", default=180)
    if mode == "saving":
        return _env_int("KMFX_BANDWIDTH_SAVING_SYNC_INTERVAL_SECONDS", default=120)
    return _env_int("KMFX_BANDWIDTH_NORMAL_SYNC_INTERVAL_SECONDS", default=60)


def bandwidth_policy_payload() -> dict[str, Any]:
    snapshot = bandwidth_guard_snapshot()
    return {
        "bandwidth_guard": {
            "enabled": bool(snapshot.get("enabled")),
            "mode": snapshot.get("mode", "disabled"),
            "period": snapshot.get("period", ""),
            "egress_bytes": snapshot.get("egress_bytes", 0),
            "limit_bytes": snapshot.get("limit_bytes", 0),
            "usage_ratio": round(float(snapshot.get("ratio") or 0), 6),
        },
        "next_sync_after_seconds": bandwidth_sync_interval_seconds(),
    }


def bandwidth_guard_rejection_response(request: Request) -> JSONResponse | None:
    snapshot = bandwidth_guard_snapshot()
    mode = str(snapshot.get("mode") or "normal")
    path = str(getattr(getattr(request, "url", None), "path", "") or "")
    if mode in {"saving", "critical", "hard"} and bandwidth_route_is_nonessential(path):
        return connector_json_response(
            {
                "ok": False,
                "reason": "bandwidth_guard",
                "error": "bandwidth_guard",
                "mode": mode,
                "message": "Ruta no esencial bloqueada temporalmente para evitar overage de bandwidth.",
                **bandwidth_policy_payload(),
                "timestamp": now_iso(),
            },
            status_code=429 if mode != "hard" else 503,
        )
    if mode == "hard" and not bandwidth_route_is_critical(path):
        return connector_json_response(
            {
                "ok": False,
                "reason": "bandwidth_guard_hard_cap",
                "error": "bandwidth_guard_hard_cap",
                "mode": mode,
                "message": "Servicio en modo minimo para evitar cargos extra de bandwidth.",
                **bandwidth_policy_payload(),
                "timestamp": now_iso(),
            },
            status_code=503,
        )
    return None


@app.middleware("http")
async def bandwidth_guard_middleware(request: Request, call_next):
    rejected = bandwidth_guard_rejection_response(request)
    if rejected is not None:
        snapshot = record_bandwidth_egress(len(rejected.body or b"") + BANDWIDTH_BYTES_FALLBACK_RESPONSE_OVERHEAD)
        rejected.headers["X-KMFX-Bandwidth-Guard"] = str(snapshot.get("mode", "disabled"))
        rejected.headers["X-KMFX-Bandwidth-Usage"] = f"{float(snapshot.get('ratio') or 0):.6f}"
        return rejected

    response = await call_next(request)
    content_length = response.headers.get("content-length")
    try:
        body_size = int(content_length) if content_length else 0
    except (TypeError, ValueError):
        body_size = 0

    snapshot = record_bandwidth_egress(body_size + BANDWIDTH_BYTES_FALLBACK_RESPONSE_OVERHEAD)
    response.headers["X-KMFX-Bandwidth-Guard"] = str(snapshot.get("mode", "disabled"))
    response.headers["X-KMFX-Bandwidth-Usage"] = f"{float(snapshot.get('ratio') or 0):.6f}"
    return response


def feature_disabled_response(feature: str, *, status_code: int = 503) -> JSONResponse:
    normalized = safe_str(feature, "feature").lower().replace("-", "_")
    return connector_json_response(
        {
            "ok": False,
            "reason": "feature_disabled",
            "error": "feature_disabled",
            "feature": normalized,
            "message": "Esta funcionalidad esta desactivada temporalmente.",
            "timestamp": now_iso(),
        },
        status_code=status_code,
    )


def _parse_datetime(value: object) -> datetime | None:
    text = safe_str(value)
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        parsed = None
    if parsed is None:
        for pattern in ("%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M"):
            try:
                parsed = datetime.strptime(text, pattern)
                break
            except ValueError:
                continue
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def load_sync_receipts() -> dict[str, dict[str, Any]]:
    if not os.path.exists(SYNC_RECEIPTS_STATE_PATH):
        return {}
    try:
        with open(SYNC_RECEIPTS_STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    records = payload.get("sync_receipts") if isinstance(payload, dict) else {}
    if not isinstance(records, dict):
        return {}
    return {str(key): value for key, value in records.items() if isinstance(value, dict)}


def load_journal_receipts() -> dict[str, dict[str, Any]]:
    if not os.path.exists(JOURNAL_RECEIPTS_STATE_PATH):
        return {}
    try:
        with open(JOURNAL_RECEIPTS_STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    records = payload.get("journal_receipts") if isinstance(payload, dict) else {}
    if not isinstance(records, dict):
        return {}
    return {str(key): value for key, value in records.items() if isinstance(value, dict)}


def load_journal_trade_store() -> dict[str, list[dict[str, Any]]]:
    if not os.path.exists(JOURNAL_TRADES_STATE_PATH):
        return {}
    try:
        with open(JOURNAL_TRADES_STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    records = payload.get("journal_trades") if isinstance(payload, dict) else {}
    if not isinstance(records, dict):
        return {}
    return {
        str(key): [item for item in value if isinstance(item, dict)]
        for key, value in records.items()
        if isinstance(value, list)
    }


def save_sync_receipts(records: dict[str, dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(SYNC_RECEIPTS_STATE_PATH) or ".", exist_ok=True)
    payload = {
        "sync_receipts": records,
        "saved_at": now_iso(),
    }
    with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(SYNC_RECEIPTS_STATE_PATH) or ".", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
        temp_path = handle.name
    os.replace(temp_path, SYNC_RECEIPTS_STATE_PATH)


def save_journal_receipts(records: dict[str, dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(JOURNAL_RECEIPTS_STATE_PATH) or ".", exist_ok=True)
    payload = {
        "journal_receipts": records,
        "saved_at": now_iso(),
    }
    with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(JOURNAL_RECEIPTS_STATE_PATH) or ".", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
        temp_path = handle.name
    os.replace(temp_path, JOURNAL_RECEIPTS_STATE_PATH)


def save_journal_trade_store(records: dict[str, list[dict[str, Any]]]) -> None:
    os.makedirs(os.path.dirname(JOURNAL_TRADES_STATE_PATH) or ".", exist_ok=True)
    payload = {
        "journal_trades": records,
        "saved_at": now_iso(),
    }
    with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(JOURNAL_TRADES_STATE_PATH) or ".", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
        temp_path = handle.name
    os.replace(temp_path, JOURNAL_TRADES_STATE_PATH)


PROCESSED_SYNC_RECEIPTS: dict[str, dict[str, Any]] = load_sync_receipts()
PROCESSED_JOURNAL_RECEIPTS: dict[str, dict[str, Any]] = load_journal_receipts()
JOURNAL_TRADES_BY_IDENTITY: dict[str, list[dict[str, Any]]] = load_journal_trade_store()
RECENT_LIVE_ACCOUNTS: dict[str, dict[str, Any]] = {}


def accounts_summary_snapshot_cache_key(scope_user_id: str, allowed_connection_keys: set[str] | None = None) -> str:
    normalized_user_id = safe_str(scope_user_id, "local").lower()
    key_hashes = [
        storage_connection_key_hash(safe_str(connection_key).lower())
        for connection_key in (allowed_connection_keys or set())
        if safe_str(connection_key)
    ]
    key_signature = hashlib.sha256("|".join(sorted(key_hashes)).encode("utf-8")).hexdigest()[:16]
    return f"{normalized_user_id}:{key_signature}"


def clear_accounts_summary_snapshot_cache() -> None:
    ACCOUNTS_SUMMARY_SNAPSHOT_CACHE.clear()


def cached_accounts_summary_snapshot(cache_key: str) -> dict[str, Any] | None:
    if ACCOUNTS_SUMMARY_SNAPSHOT_CACHE_TTL_SECONDS <= 0:
        return None
    record = ACCOUNTS_SUMMARY_SNAPSHOT_CACHE.get(cache_key)
    if not record:
        return None
    expires_at, snapshot = record
    if expires_at <= time.time():
        ACCOUNTS_SUMMARY_SNAPSHOT_CACHE.pop(cache_key, None)
        return None
    return deepcopy(snapshot)


def remember_accounts_summary_snapshot(cache_key: str, snapshot: dict[str, Any]) -> None:
    if ACCOUNTS_SUMMARY_SNAPSHOT_CACHE_TTL_SECONDS <= 0:
        return
    if len(ACCOUNTS_SUMMARY_SNAPSHOT_CACHE) >= ACCOUNTS_SUMMARY_SNAPSHOT_CACHE_MAX_ENTRIES:
        oldest_key = min(
            ACCOUNTS_SUMMARY_SNAPSHOT_CACHE,
            key=lambda key: ACCOUNTS_SUMMARY_SNAPSHOT_CACHE[key][0],
        )
        ACCOUNTS_SUMMARY_SNAPSHOT_CACHE.pop(oldest_key, None)
    ACCOUNTS_SUMMARY_SNAPSHOT_CACHE[cache_key] = (
        time.time() + ACCOUNTS_SUMMARY_SNAPSHOT_CACHE_TTL_SECONDS,
        deepcopy(snapshot),
    )


def billing_backfill_failure_cache_key(context: dict[str, Any]) -> str:
    user_id = safe_str(context.get("user_id")).lower()
    email = safe_str(context.get("email")).lower()
    return user_id or email


def cached_billing_backfill_failure_reason(context: dict[str, Any]) -> str:
    if BILLING_BACKFILL_FAILURE_CACHE_TTL_SECONDS <= 0:
        return ""
    cache_key = billing_backfill_failure_cache_key(context)
    if not cache_key:
        return ""
    record = BILLING_BACKFILL_FAILURE_CACHE.get(cache_key)
    if not record:
        return ""
    expires_at, reason = record
    if expires_at <= time.time():
        BILLING_BACKFILL_FAILURE_CACHE.pop(cache_key, None)
        return ""
    return reason


def remember_billing_backfill_failure(context: dict[str, Any], reason: str) -> None:
    if BILLING_BACKFILL_FAILURE_CACHE_TTL_SECONDS <= 0:
        return
    cache_key = billing_backfill_failure_cache_key(context)
    if not cache_key:
        return
    BILLING_BACKFILL_FAILURE_CACHE[cache_key] = (
        time.time() + BILLING_BACKFILL_FAILURE_CACHE_TTL_SECONDS,
        safe_str(reason, "billing_backfill_failed"),
    )


def purge_expired_sync_receipts() -> None:
    cutoff = datetime.now(timezone.utc) - SYNC_RECEIPT_TTL
    expired_ids = [
        sync_id
        for sync_id, record in PROCESSED_SYNC_RECEIPTS.items()
        if (_parse_datetime(record.get("received_at")) or datetime.min.replace(tzinfo=timezone.utc)) < cutoff
    ]
    if not expired_ids:
        return
    for sync_id in expired_ids:
        PROCESSED_SYNC_RECEIPTS.pop(sync_id, None)
    save_sync_receipts(PROCESSED_SYNC_RECEIPTS)
    expired_batch_ids = [
        batch_id
        for batch_id, record in PROCESSED_JOURNAL_RECEIPTS.items()
        if (_parse_datetime(record.get("received_at")) or datetime.min.replace(tzinfo=timezone.utc)) < cutoff
    ]
    for batch_id in expired_batch_ids:
        PROCESSED_JOURNAL_RECEIPTS.pop(batch_id, None)
    if expired_batch_ids:
        save_journal_receipts(PROCESSED_JOURNAL_RECEIPTS)


def get_processed_sync_receipt(sync_id: str) -> dict[str, Any] | None:
    purge_expired_sync_receipts()
    return PROCESSED_SYNC_RECEIPTS.get(sync_id)


def remember_processed_sync(sync_id: str, *, login: str, account_id: str, policy_hash: str) -> None:
    purge_expired_sync_receipts()
    PROCESSED_SYNC_RECEIPTS[sync_id] = {
        "sync_id": sync_id,
        "login": login,
        "account_id": account_id,
        "policy_hash": policy_hash,
        "received_at": now_iso(),
    }
    save_sync_receipts(PROCESSED_SYNC_RECEIPTS)


def get_processed_journal_receipt(batch_id: str) -> dict[str, Any] | None:
    purge_expired_sync_receipts()
    return PROCESSED_JOURNAL_RECEIPTS.get(batch_id)


def remember_processed_journal(batch_id: str, *, identity_key: str, trade_count: int) -> None:
    purge_expired_sync_receipts()
    PROCESSED_JOURNAL_RECEIPTS[batch_id] = {
        "batch_id": batch_id,
        "identity_key": identity_key,
        "trade_count": trade_count,
        "received_at": now_iso(),
    }
    save_journal_receipts(PROCESSED_JOURNAL_RECEIPTS)


def resolve_connection_key(payload: dict[str, Any], request: Request | None = None) -> str:
    if request is not None:
        header_value = safe_str(request.headers.get("x-kmfx-connection-key")) or safe_str(request.headers.get("x-kmfx-api-key"))
        if header_value:
            return header_value
    explicit = safe_str(payload.get("connection_key")) or safe_str(payload.get("KMFXApiKey")) or safe_str(payload.get("api_key"))
    if explicit:
        return explicit
    if request is not None and allow_query_connection_key_compat():
        query_key = request_query_connection_key(request)
        if query_key:
            log.warning(
                "MT5 legacy query connection key accepted in explicit non-production compatibility mode | key=%s",
                mask_connection_key(query_key),
            )
            return query_key
    return ""


def payload_without_connection_key(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    cleaned = dict(payload)
    for key in ("connection_key", "KMFXApiKey", "api_key"):
        cleaned.pop(key, None)
    return redact_sensitive_data(cleaned)


def resolve_identity_key(connection_key: str, login: str) -> str:
    return connection_key or login


def resolve_account_by_connection_key(connection_key: str):
    normalized = safe_str(connection_key)
    if not normalized:
        return None
    return account_service.get_account_by_api_key_any_user(normalized)


def is_bootstrap_connection_key(connection_key: str) -> bool:
    normalized = safe_str(connection_key)
    if not normalized:
        return False
    try:
        return str(UUID(normalized)) == normalized.lower()
    except ValueError:
        return False


def bootstrap_account_for_sync(connection_key: str, account: dict[str, Any]):
    normalized = safe_str(connection_key)
    login = safe_str(account.get("login"))
    if not normalized or not login or not is_bootstrap_connection_key(normalized):
        return None
    if not allow_public_connection_key_bootstrap():
        log.warning(
            "[KMFX][CONNECTION_KEY_VALIDATION] event=key_bootstrap_blocked reason=production_requires_preissued_key key=%s",
            mask_connection_key(normalized),
        )
        return None
    if account_service.is_connection_key_revoked_any_user(normalized):
        log.warning(
            "[KMFX][CONNECTION_KEY_VALIDATION] event=key_bootstrap_blocked reason=revoked_key key=%s",
            mask_connection_key(normalized),
        )
        return None
    broker = safe_str(account.get("broker"))
    server = safe_str(account.get("server"))
    alias_parts = [part for part in (broker, login) if part]
    alias = " · ".join(alias_parts) or f"MT5 {login}"
    created = account_service.create_pending_account_with_key(
        user_id="local",
        alias=alias,
        connection_key=normalized,
        platform="mt5",
    )
    if created is None:
        return None
    log.info(
        "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s status=%s event=sync_key_bootstrap login=%s broker=%s server=%s key=%s",
        created.account_id,
        created.user_id,
        created.status,
        login,
        broker,
        server,
        mask_connection_key(normalized),
    )
    return created


def log_connection_key_validation(endpoint: str, connection_key: str, found: bool) -> None:
    log.info(
        "[KMFX][CONNECTION_KEY_VALIDATION] endpoint=%s key=%s lookup=get_account_by_api_key_any_user found=%s",
        endpoint,
        mask_connection_key(connection_key),
        found,
    )


def mask_connection_key(connection_key: str) -> str:
    normalized = safe_str(connection_key)
    if not normalized:
        return ""
    if len(normalized) <= 10:
        return "[masked]"
    return f"{normalized[:6]}...{normalized[-4:]}"


def is_sensitive_log_field(key: str) -> bool:
    normalized = safe_str(key).lower()
    return normalized in SENSITIVE_LOG_FIELD_NAMES or any(hint in normalized for hint in SENSITIVE_LOG_FIELD_HINTS)


def redact_sensitive_data(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            if is_sensitive_log_field(str(key)):
                if safe_str(item) and str(key).lower() in QUERY_CONNECTION_KEY_FIELD_NAMES | {"api_key"}:
                    redacted[key] = mask_connection_key(safe_str(item)) or "[masked]"
                else:
                    redacted[key] = "[masked]"
            else:
                redacted[key] = redact_sensitive_data(item)
        return redacted
    if isinstance(value, list):
        return [redact_sensitive_data(item) for item in value]
    return value


def audit_event_details(details: dict[str, Any] | None = None) -> str:
    safe_details = redact_sensitive_data(ensure_dict(details))
    try:
        return json.dumps(safe_details, ensure_ascii=True, sort_keys=True)
    except (TypeError, ValueError):
        return "{}"


def emit_audit_event(
    event: str,
    *,
    context: dict[str, Any] | None = None,
    user_id: str = "",
    account_id: str = "",
    status: str = "ok",
    details: dict[str, Any] | None = None,
) -> None:
    safe_context = ensure_dict(context)
    actor_user_id = safe_str(safe_context.get("user_id") or user_id)
    actor_email = mask_email_for_log(safe_str(safe_context.get("email")))
    actor_role = "admin" if safe_context.get("is_admin") else "user"
    log.info(
        "[KMFX][AUDIT] event=%s status=%s user_id=%s account_id=%s actor_role=%s actor_email=%s details=%s",
        safe_str(event, "unknown"),
        safe_str(status, "ok"),
        actor_user_id,
        safe_str(account_id),
        actor_role,
        actor_email,
        audit_event_details(details),
    )


def emit_operational_alert(
    event: str,
    *,
    severity: str = "warning",
    context: dict[str, Any] | None = None,
    user_id: str = "",
    account_id: str = "",
    details: dict[str, Any] | None = None,
) -> None:
    safe_context = ensure_dict(context)
    actor_user_id = safe_str(safe_context.get("user_id") or user_id)
    actor_email = mask_email_for_log(safe_str(safe_context.get("email")))
    actor_role = "admin" if safe_context.get("is_admin") else "user"
    log.warning(
        "[KMFX][ALERT] event=%s severity=%s user_id=%s account_id=%s actor_role=%s actor_email=%s details=%s",
        safe_str(event, "unknown"),
        safe_str(severity, "warning"),
        actor_user_id,
        safe_str(account_id),
        actor_role,
        actor_email,
        audit_event_details(details),
    )


def emit_mt5_reject_alert(
    reason: str,
    *,
    endpoint: str,
    severity: str = "warning",
    user_id: str = "",
    account_id: str = "",
    details: dict[str, Any] | None = None,
) -> None:
    emit_operational_alert(
        "mt5_sync_rejected_abnormal",
        severity=severity,
        user_id=user_id,
        account_id=account_id,
        details={
            "endpoint": endpoint,
            "reason": reason,
            **ensure_dict(details),
        },
    )


@app.middleware("http")
async def operational_alert_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception as exc:
        emit_operational_alert(
            "api_unhandled_exception",
            severity="critical",
            details={
                "method": safe_str(getattr(request, "method", "")),
                "path": safe_str(getattr(getattr(request, "url", None), "path", "")),
                "error_type": type(exc).__name__,
            },
        )
        raise
    if getattr(response, "status_code", 200) >= 500:
        emit_operational_alert(
            "api_5xx_response",
            severity="error",
            details={
                "method": safe_str(getattr(request, "method", "")),
                "path": safe_str(getattr(getattr(request, "url", None), "path", "")),
                "status_code": getattr(response, "status_code", 0),
            },
        )
    return response


def allow_query_connection_key_compat() -> bool:
    return _env_flag("KMFX_ALLOW_QUERY_CONNECTION_KEY", default=False) and not _is_production_runtime()


def request_query_connection_key_fields(request: Request) -> dict[str, str]:
    found: dict[str, str] = {}
    try:
        items = list(request.query_params.multi_items())
    except AttributeError:
        query_params = getattr(request, "query_params", {}) or {}
        items = list(query_params.items()) if hasattr(query_params, "items") else []
    for key, value in items:
        normalized_key = safe_str(key).lower()
        if normalized_key in QUERY_CONNECTION_KEY_FIELD_NAMES:
            found[safe_str(key)] = safe_str(value)
    return found


def request_query_connection_key(request: Request) -> str:
    for value in request_query_connection_key_fields(request).values():
        normalized = safe_str(value)
        if normalized:
            return normalized
    return ""


def query_connection_key_rejection_response(endpoint: str, request: Request) -> JSONResponse | None:
    query_fields = request_query_connection_key_fields(request)
    if not query_fields:
        return None
    if allow_query_connection_key_compat():
        log.warning(
            "%s legacy query connection key allowed only because KMFX_ALLOW_QUERY_CONNECTION_KEY=1 and runtime is non-production | fields=%s",
            endpoint,
            sorted(query_fields.keys()),
        )
        return None
    log.warning(
        "%s rejected | reason=query_connection_key_not_allowed fields=%s",
        endpoint,
        sorted(query_fields.keys()),
    )
    emit_audit_event(
        "mt5_sync_rejected",
        status="rejected",
        details={
            "endpoint": endpoint,
            "reason": "query_connection_key_not_allowed",
            "fields": sorted(query_fields.keys()),
        },
    )
    emit_mt5_reject_alert(
        "query_connection_key_not_allowed",
        endpoint=endpoint,
        severity="warning",
        details={"fields": sorted(query_fields.keys())},
    )
    return connector_json_response(
        {
            "ok": False,
            "received": False,
            "disposition": "rejected",
            "reason": "query_connection_key_not_allowed",
            "error": "query_connection_key_not_allowed",
            "details": {
                "fields": sorted(query_fields.keys()),
                "transport": "header_or_body_required",
            },
            "timestamp": now_iso(),
        },
        status_code=400,
    )


def _decode_base64url_json(segment: str) -> dict[str, Any]:
    padded = f"{segment}{'=' * (-len(segment) % 4)}"
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
        payload = json.loads(decoded.decode("utf-8"))
    except (ValueError, OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _extract_bearer_token(request: Request) -> str:
    authorization = safe_str(request.headers.get("authorization"))
    if not authorization.lower().startswith("bearer "):
        return ""
    return authorization.split(" ", 1)[1].strip()


def _resolve_signed_bearer_claims(request: Request) -> dict[str, Any]:
    token = _extract_bearer_token(request)
    secret = safe_str(os.getenv("SUPABASE_JWT_SECRET"))
    if not token or not secret:
        return {}
    parts = token.split(".")
    if len(parts) != 3:
        return {}
    header = _decode_base64url_json(parts[0])
    if safe_str(header.get("alg")).upper() != "HS256":
        return {}
    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    expected = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")
    if not hmac.compare_digest(expected, parts[2]):
        return {}
    return _decode_base64url_json(parts[1])


def _resolve_supabase_user_claims(request: Request) -> dict[str, Any]:
    token = _extract_bearer_token(request)
    if not token or not SUPABASE_PROJECT_URL or not SUPABASE_ANON_KEY:
        return {}
    cache_key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    cached = VERIFIED_BEARER_CACHE.get(cache_key)
    if cached and cached[0] > time.time():
        return deepcopy(cached[1])
    request_url = f"{SUPABASE_PROJECT_URL}/auth/v1/user"
    auth_request = urllib.request.Request(
        request_url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "apikey": SUPABASE_ANON_KEY,
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(auth_request, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        log.warning("Supabase bearer verification failed | source=auth_user endpoint=%s error=%s", request_url, exc)
        return {}
    if not isinstance(payload, dict) or not safe_str(payload.get("id")):
        return {}
    claims = {
        "sub": safe_str(payload.get("id")),
        "email": safe_str(payload.get("email")).lower(),
        "user_metadata": ensure_dict(payload.get("user_metadata")),
        "app_metadata": ensure_dict(payload.get("app_metadata")),
        "source": "supabase_auth_user",
    }
    VERIFIED_BEARER_CACHE[cache_key] = (time.time() + VERIFIED_BEARER_CACHE_TTL_SECONDS, claims)
    return deepcopy(claims)


def _resolve_verified_bearer_claims(request: Request) -> dict[str, Any]:
    # Prefer local JWT validation when SUPABASE_JWT_SECRET is configured, but
    # refresh metadata from Supabase Auth when possible. JWT app_metadata can be
    # stale until the user's session refreshes; the Auth user endpoint gives the
    # current server-side app_metadata for the same verified bearer token.
    signed_claims = _resolve_signed_bearer_claims(request)
    auth_user_claims = _resolve_supabase_user_claims(request)
    if not signed_claims:
        return auth_user_claims
    if not auth_user_claims:
        return signed_claims

    signed_sub = safe_str(signed_claims.get("sub"))
    auth_user_sub = safe_str(auth_user_claims.get("sub"))
    if signed_sub and auth_user_sub and signed_sub != auth_user_sub:
        log.warning("Supabase bearer verification rejected | reason=sub_mismatch")
        return {}

    merged_claims = deepcopy(signed_claims)
    for key in ("sub", "email"):
        fresh_value = safe_str(auth_user_claims.get(key))
        if fresh_value:
            merged_claims[key] = fresh_value
    for key in ("app_metadata", "user_metadata"):
        merged_claims[key] = {
            **ensure_dict(merged_claims.get(key)),
            **ensure_dict(auth_user_claims.get(key)),
        }
    merged_claims["source"] = "signed_bearer+supabase_auth_user"
    return merged_claims


def _resolve_verified_bearer_email(request: Request) -> str:
    claims = _resolve_verified_bearer_claims(request)
    email = safe_str(claims.get("email") or ensure_dict(claims.get("user_metadata")).get("email")).lower()
    return email


def _resolve_preview_bearer_claims(request: Request) -> dict[str, Any]:
    expected = safe_str(os.getenv("KMFX_PREVIEW_BEARER_TOKEN"))
    token = _extract_bearer_token(request)
    if not expected or not token or not hmac.compare_digest(token, expected):
        return {}

    email = safe_str(os.getenv("KMFX_PREVIEW_USER_EMAIL") or request.headers.get("x-kmfx-user-email")).lower()
    user_id = safe_str(os.getenv("KMFX_PREVIEW_USER_ID") or request.headers.get("x-kmfx-user-id")).lower()
    if not (email or user_id):
        return {}

    plan = safe_str(os.getenv("KMFX_PREVIEW_PLAN"), "pro").lower()
    return {
        "sub": user_id or email,
        "email": email,
        "source": "preview_bearer",
        "app_metadata": {
            "kmfx_preview": True,
            "plan": plan or "pro",
            "billing_status": "active",
        },
        "user_metadata": {},
    }


def _resolve_preview_bearer_email(request: Request) -> str:
    claims = _resolve_preview_bearer_claims(request)
    return safe_str(claims.get("email")).lower()


def _is_local_request(request: Request) -> bool:
    client_host = safe_str(getattr(request.client, "host", "") if request.client else "").lower()
    return client_host in {"127.0.0.1", "::1", "localhost"}


def _allow_no_key_mt5_ingest(request: Request) -> bool:
    if _is_production_runtime():
        return False
    if _is_local_request(request):
        return True
    return _env_flag("KMFX_ALLOW_NO_KEY_MT5_INGEST", default=False)


def _auth_identity_key(user_id: str, login: str) -> str:
    normalized_user = safe_str(user_id)
    normalized_login = safe_str(login)
    if normalized_user and normalized_login:
        return f"user:{normalized_user}:login:{normalized_login}"
    return normalized_user or normalized_login


def mt5_missing_connection_key_response(endpoint: str, sync_id: str = "", batch_id: str = "") -> JSONResponse:
    log.warning("%s rejected | reason=missing_connection_key", endpoint)
    emit_audit_event(
        "mt5_sync_rejected",
        status="rejected",
        details={
            "endpoint": endpoint,
            "reason": "missing_connection_key",
            "sync_id": sync_id,
            "batch_id": batch_id,
        },
    )
    emit_mt5_reject_alert(
        "missing_connection_key",
        endpoint=endpoint,
        severity="warning",
        details={
            "sync_id": sync_id,
            "batch_id": batch_id,
        },
    )
    payload: dict[str, Any] = {
        "ok": False,
        "received": False,
        "disposition": "rejected",
        "reason": "missing_connection_key",
        "error": "missing_connection_key",
        "details": {
            "field": "connection_key",
            "problem": "required_for_remote_write",
        },
        "timestamp": now_iso(),
    }
    if sync_id:
        payload["sync_id"] = sync_id
    if batch_id:
        payload["batch_id"] = batch_id
    return connector_json_response(payload, status_code=401)


def is_account_store_unavailable_exception(exc: BaseException) -> bool:
    message = safe_str(exc)
    return isinstance(exc, OSError) and (
        "supabase_account_store_" in message
        or "account_store" in message
    )


async def account_store_io(operation: str, func, *args, **kwargs):
    return await asyncio.to_thread(func, *args, **kwargs)


def mt5_account_store_unavailable_response(
    endpoint: str,
    exc: BaseException,
    *,
    operation: str,
    connection_key: str = "",
    sync_id: str = "",
    batch_id: str = "",
) -> JSONResponse:
    log.warning(
        "%s rejected | reason=account_store_unavailable operation=%s error_type=%s key=%s",
        endpoint,
        operation,
        type(exc).__name__,
        mask_connection_key(connection_key),
    )
    emit_operational_alert(
        "account_store_unavailable",
        severity="error",
        details={
            "endpoint": endpoint,
            "operation": operation,
            "error_type": type(exc).__name__,
            "connection_key": mask_connection_key(connection_key),
            "sync_id": sync_id,
            "batch_id": batch_id,
        },
    )
    payload: dict[str, Any] = {
        "ok": False,
        "received": False,
        "disposition": "retry",
        "reason": "account_store_unavailable",
        "error": "account_store_unavailable",
        "error_code": 5031,
        "retryable": True,
        "details": {
            "field": "connection_key",
            "problem": "account_store_unavailable",
            "operation": operation,
        },
        "timestamp": now_iso(),
    }
    if sync_id:
        payload["sync_id"] = sync_id
    if batch_id:
        payload["batch_id"] = batch_id
    return connector_json_response(payload, status_code=503)


def _resolve_trusted_header_email(request: Request) -> str:
    if not _is_local_request(request):
        return ""
    return safe_str(request.headers.get("x-kmfx-user-email")).lower()


def _resolve_trusted_header_user_id(request: Request) -> str:
    if not _is_local_request(request):
        return ""
    return safe_str(request.headers.get("x-kmfx-user-id")).lower()


def resolve_authenticated_email(request: Request) -> str:
    return _resolve_verified_bearer_email(request) or _resolve_preview_bearer_email(request) or _resolve_trusted_header_email(request)


def resolve_authenticated_identity(request: Request) -> dict[str, str]:
    claims = _resolve_verified_bearer_claims(request)
    email = safe_str(claims.get("email") or ensure_dict(claims.get("user_metadata")).get("email")).lower()
    user_id = safe_str(claims.get("sub"))
    if email or user_id:
        return {
            "email": email,
            "user_id": user_id or email,
            "source": "verified_bearer",
            "app_metadata": ensure_dict(claims.get("app_metadata")),
            "user_metadata": ensure_dict(claims.get("user_metadata")),
        }

    preview_claims = _resolve_preview_bearer_claims(request)
    preview_email = safe_str(preview_claims.get("email")).lower()
    preview_user_id = safe_str(preview_claims.get("sub"))
    if preview_email or preview_user_id:
        return {
            "email": preview_email,
            "user_id": preview_user_id or preview_email,
            "source": "preview_bearer",
            "app_metadata": ensure_dict(preview_claims.get("app_metadata")),
            "user_metadata": {},
        }

    trusted_email = _resolve_trusted_header_email(request)
    trusted_user_id = _resolve_trusted_header_user_id(request)
    if trusted_email or trusted_user_id:
        return {
            "email": trusted_email,
            "user_id": trusted_user_id or trusted_email,
            "source": "trusted_header",
            "app_metadata": {},
            "user_metadata": {},
        }

    return {"email": "", "user_id": "", "source": "", "app_metadata": {}, "user_metadata": {}}


def build_admin_context(request: Request) -> dict[str, Any]:
    identity = resolve_authenticated_identity(request)
    email = identity["email"]
    user_id = safe_str(identity["user_id"]).lower()
    app_metadata = ensure_dict(identity.get("app_metadata"))
    user_metadata = ensure_dict(identity.get("user_metadata"))
    is_admin = bool(email and email in ADMIN_EMAILS)
    return {
        "email": email,
        "user_id": user_id,
        "source": identity["source"],
        "app_metadata": app_metadata,
        "user_metadata": user_metadata,
        "is_admin": is_admin,
    }


def resolve_account_scope(request: Request) -> tuple[str, dict[str, Any]]:
    context = build_admin_context(request)
    if not (context["email"] or context["user_id"]):
        return "", context
    return safe_str(context["user_id"] or context["email"]), context


def preview_bearer_full_snapshot_allowed(context: dict[str, Any]) -> bool:
    return (
        safe_str(context.get("source")) == "preview_bearer"
        and _env_flag("KMFX_PREVIEW_ALLOW_FULL_SNAPSHOT", default=False)
    )


def admin_launcher_connection_keys_for_context(context: dict[str, Any]) -> set[str]:
    user_id = safe_str(context.get("user_id")).lower()
    if not user_id or not context.get("is_admin"):
        return set()
    # Temporary admin launcher bridge: this maps a specific owner user id to known
    # launcher connection keys until real per-user account linking exists.
    return set(ADMIN_LAUNCHER_CONNECTION_KEYS_BY_USER_ID.get(user_id) or set())


def empty_accounts_payload(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": True,
        "accounts": [],
        "active_account_id": "",
        "updated_at": now_iso(),
        "is_admin": bool(context.get("is_admin")),
        "auth_email": context.get("email", ""),
        "scope_user_id": context.get("user_id", ""),
        "auth_required": not bool(context.get("email") or context.get("user_id")),
    }


def require_admin(request: Request) -> tuple[dict[str, Any], JSONResponse | None]:
    context = build_admin_context(request)
    if context["is_admin"]:
        return context, None
    return context, connector_json_response(
        {
            "ok": False,
            "reason": "admin_required",
            "is_admin": False,
            "timestamp": now_iso(),
        },
        status_code=403,
    )


def parse_connection_plan_limits(value: str) -> dict[str, int]:
    limits = dict(DEFAULT_CONNECTION_PLAN_LIMITS)
    for item in str(value or "").replace(";", ",").split(","):
        if "=" not in item:
            continue
        raw_plan, raw_limit = item.split("=", 1)
        plan = safe_str(raw_plan).lower()
        if not plan:
            continue
        try:
            limit = int(raw_limit.strip())
        except ValueError:
            continue
        limits[plan] = max(0, limit)
    return limits


def connection_plan_for_context(context: dict[str, Any]) -> str:
    # Authorization decisions must only trust app_metadata, which is set by
    # privileged server/admin flows. user_metadata is user-editable in Supabase.
    app_metadata = ensure_dict(context.get("app_metadata"))
    plan = safe_str(
        app_metadata.get("kmfx_plan")
        or app_metadata.get("plan")
        or app_metadata.get("subscription_plan")
        or _env_value("KMFX_DEFAULT_CONNECTION_PLAN"),
        "free",
    ).lower()
    return plan or "free"


def normalize_plan_key(value: Any) -> str:
    plan = safe_str(value, "free").lower()
    return plan if plan in DEFAULT_PLAN_ENTITLEMENTS else "free"


def plan_entitlements(plan: str) -> dict[str, Any]:
    return deepcopy(DEFAULT_PLAN_ENTITLEMENTS.get(normalize_plan_key(plan), DEFAULT_PLAN_ENTITLEMENTS["free"]))


def billing_status_from_metadata(app_metadata: dict[str, Any], plan: str) -> str:
    status = safe_str(
        app_metadata.get("kmfx_billing_status")
        or app_metadata.get("billing_status")
        or app_metadata.get("subscription_status")
        or app_metadata.get("stripe_status")
    ).lower()
    if status in BILLING_STATUS_VALUES:
        return status
    return "free" if normalize_plan_key(plan) == "free" else "active"


def metadata_first_value(app_metadata: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = safe_str(app_metadata.get(key))
        if value:
            return value
    return ""


def billing_cancel_at_period_end(app_metadata: dict[str, Any]) -> bool:
    for key in ("kmfx_cancel_at_period_end", "cancel_at_period_end", "cancelAtPeriodEnd"):
        if key in app_metadata:
            return metadata_bool(app_metadata.get(key)) is True
    return False


def entitlement_account_limit(entitlements: dict[str, Any], context: dict[str, Any], *, authenticated: bool) -> int | str:
    if not authenticated:
        return 0
    if context.get("is_admin"):
        return DEFAULT_CONNECTION_PLAN_LIMITS["admin"]
    raw_limit = entitlements.get("liveMt5Accounts")
    if isinstance(raw_limit, int):
        return max(0, raw_limit)
    if isinstance(raw_limit, float):
        return max(0, int(raw_limit))
    return raw_limit if safe_str(raw_limit).lower() == "custom" else 0


def billing_status_payload_for_context(context: dict[str, Any]) -> dict[str, Any]:
    user_id = safe_str(context.get("user_id")).lower()
    email = safe_str(context.get("email")).lower()
    authenticated = bool(user_id or email)
    if not authenticated:
        entitlements = plan_entitlements("free")
        entitlements["liveMt5Accounts"] = 0
        entitlements["launcherConnection"] = False
        return {
            "ok": True,
            "auth_required": True,
            "billing": {
                "plan": "free",
                "effectivePlan": "free",
                "displayName": PLAN_DISPLAY_NAMES["free"],
                "status": "anonymous",
                "access": "anonymous",
                "currentPeriodEndsAt": "",
                "trialEndsAt": "",
                "cancelAtPeriodEnd": False,
            },
            "entitlements": entitlements,
            "limits": {
                "liveMt5Accounts": 0,
                "connectionKeyLimit": 0,
            },
            "is_admin": False,
            "scope_user_id": "",
            "source": "anonymous",
            "timestamp": now_iso(),
        }

    app_metadata = dict(ensure_dict(context.get("app_metadata")))
    billing_source = "app_metadata"
    if not context.get("is_admin"):
        cached_backfill_failure = cached_billing_backfill_failure_reason(context)
        if cached_backfill_failure:
            log.debug(
                "Billing backfill temporarily skipped after recent failure | scope_user_id=%s reason=%s",
                user_id,
                cached_backfill_failure,
            )
            billing_row = {}
        else:
            try:
                billing_row = backfill_billing_subscription_for_context(context)
            except RuntimeError as exc:
                reason = safe_str(exc) or "billing_backfill_failed"
                remember_billing_backfill_failure(context, reason)
                log.warning(
                    "Billing backfill skipped | scope_user_id=%s reason=%s",
                    user_id,
                    reason,
                )
                billing_row = {}
        if billing_row:
            app_metadata.update(subscription_app_metadata(billing_row))
            billing_source = "billing_subscription"
    plan = normalize_plan_key(connection_plan_for_context(context))
    plan = normalize_plan_key(
        app_metadata.get("kmfx_plan")
        or app_metadata.get("plan")
        or app_metadata.get("billing_plan")
        or plan
    )
    status = billing_status_from_metadata(app_metadata, plan)
    effective_plan = "free" if status in BILLING_RESTRICTED_STATUSES else plan
    if context.get("is_admin"):
        effective_plan = "unlimited"
    display_plan = "unlimited" if context.get("is_admin") else plan
    entitlements = plan_entitlements(effective_plan)
    if status in BILLING_RESTRICTED_STATUSES and not context.get("is_admin"):
        entitlements["liveMt5Accounts"] = 0
        entitlements["launcherConnection"] = False
    account_limit = entitlement_account_limit(entitlements, context, authenticated=authenticated)
    if isinstance(account_limit, int):
        connection_key_limit: int | str = account_limit
    else:
        connection_key_limit = account_limit
    if context.get("is_admin"):
        account_limit = DEFAULT_CONNECTION_PLAN_LIMITS["admin"]
        connection_key_limit = DEFAULT_CONNECTION_PLAN_LIMITS["admin"]

    access = "active"
    if context.get("is_admin"):
        access = "active"
    elif status in BILLING_ATTENTION_STATUSES:
        access = "billing_attention"
    elif status in BILLING_RESTRICTED_STATUSES:
        access = "restricted"
    elif status == "free":
        access = "free"

    return {
        "ok": True,
        "auth_required": False,
        "billing": {
            "plan": plan,
            "effectivePlan": effective_plan,
            # Keep the commercial plan name visible even when access is restricted.
            "displayName": PLAN_DISPLAY_NAMES.get(display_plan, PLAN_DISPLAY_NAMES.get(plan, PLAN_DISPLAY_NAMES["free"])),
            "status": status,
            "access": access,
            "currentPeriodEndsAt": metadata_first_value(
                app_metadata,
                "kmfx_current_period_end",
                "billing_current_period_end",
                "current_period_end",
                "currentPeriodEndsAt",
            ),
            "trialEndsAt": metadata_first_value(
                app_metadata,
                "kmfx_trial_end",
                "billing_trial_end",
                "trial_end",
                "trialEndsAt",
            ),
            "cancelAtPeriodEnd": billing_cancel_at_period_end(app_metadata),
        },
        "entitlements": entitlements,
        "limits": {
            "liveMt5Accounts": account_limit,
            "connectionKeyLimit": connection_key_limit,
        },
        "is_admin": bool(context.get("is_admin")),
        "scope_user_id": user_id,
        "source": billing_source,
        "timestamp": now_iso(),
    }


def metadata_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    normalized = safe_str(value).lower()
    if normalized in {"1", "true", "yes", "y", "on", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", "disabled"}:
        return False
    return None


def context_disables_connection_keys(context: dict[str, Any]) -> bool:
    app_metadata = ensure_dict(context.get("app_metadata"))
    for key in ("kmfx_connection_keys_enabled", "connection_keys_enabled", "mt5_enabled"):
        if key in app_metadata:
            flag = metadata_bool(app_metadata.get(key))
            return flag is False
    return False


def connection_key_limit_for_context(context: dict[str, Any]) -> int:
    if context.get("is_admin"):
        return DEFAULT_CONNECTION_PLAN_LIMITS["admin"]
    if context_disables_connection_keys(context):
        return 0
    app_metadata = ensure_dict(context.get("app_metadata"))
    for key in ("kmfx_connection_limit", "connection_key_limit", "mt5_connection_limit"):
        raw_limit = app_metadata.get(key)
        if raw_limit is not None:
            try:
                return max(0, int(raw_limit))
            except (TypeError, ValueError):
                continue
    limits = parse_connection_plan_limits(_env_value("KMFX_CONNECTION_PLAN_LIMITS"))
    return limits.get(connection_plan_for_context(context), limits["free"])


def connection_guard_details(
    *,
    billing_payload: dict[str, Any],
    current_count: int,
    limit: int,
    entitlement: str = "",
) -> dict[str, Any]:
    billing = ensure_dict(billing_payload.get("billing"))
    details = {
        "plan": safe_str(billing.get("plan"), "free"),
        "effective_plan": safe_str(billing.get("effectivePlan"), "free"),
        "billing_status": safe_str(billing.get("status")),
        "billing_access": safe_str(billing.get("access")),
        "connection_limit": limit,
        "current_connections": current_count,
    }
    if entitlement:
        details["entitlement"] = entitlement
    return details


def connection_guard_denial_response(
    *,
    reason: str,
    status_code: int,
    details: dict[str, Any],
) -> JSONResponse:
    return connector_json_response(
        {
            "ok": False,
            "reason": reason,
            "error": reason,
            "details": details,
            "timestamp": now_iso(),
        },
        status_code=status_code,
    )


def connection_key_limit_from_entitlements(context: dict[str, Any], billing_payload: dict[str, Any]) -> int:
    if context.get("is_admin"):
        return DEFAULT_CONNECTION_PLAN_LIMITS["admin"]
    limits = ensure_dict(billing_payload.get("limits"))
    raw_limit = limits.get("connectionKeyLimit", limits.get("liveMt5Accounts", 0))
    if isinstance(raw_limit, int):
        return max(0, raw_limit)
    if isinstance(raw_limit, float):
        return max(0, int(raw_limit))
    if safe_str(raw_limit).lower() == "custom":
        return connection_key_limit_for_context(context)
    return 0


def entitlement_value_allows(value: Any, *, allow_limited: bool = False) -> bool:
    if value is True:
        return True
    normalized = safe_str(value).lower()
    if normalized in {"true", "enabled", "full"}:
        return True
    if allow_limited and normalized == "limited":
        return True
    return False


def product_entitlement_details(*, billing_payload: dict[str, Any], entitlement: str) -> dict[str, Any]:
    billing = ensure_dict(billing_payload.get("billing"))
    return {
        "plan": safe_str(billing.get("plan"), "free"),
        "effective_plan": safe_str(billing.get("effectivePlan"), "free"),
        "billing_status": safe_str(billing.get("status")),
        "billing_access": safe_str(billing.get("access")),
        "entitlement": entitlement,
    }


def product_entitlement_denial(
    *,
    context: dict[str, Any],
    entitlement: str,
    allow_limited: bool = False,
) -> JSONResponse | None:
    context = {**ensure_dict(context)}
    if context.get("is_admin"):
        return None
    billing_payload = billing_status_payload_for_context(context)
    billing = ensure_dict(billing_payload.get("billing"))
    entitlements = ensure_dict(billing_payload.get("entitlements"))
    details = product_entitlement_details(billing_payload=billing_payload, entitlement=entitlement)
    billing_access = safe_str(billing.get("access"))
    if billing_access == "restricted":
        return connection_guard_denial_response(
            reason="billing_required",
            status_code=402,
            details=details,
        )
    if billing_access == "billing_attention":
        return connection_guard_denial_response(
            reason="billing_past_due",
            status_code=402,
            details=details,
        )
    if not entitlement_value_allows(entitlements.get(entitlement), allow_limited=allow_limited):
        return connection_guard_denial_response(
            reason="entitlement_required",
            status_code=403,
            details=details,
        )
    return None


def live_accounts_access_denial(context: dict[str, Any]) -> dict[str, Any] | None:
    context = {**ensure_dict(context)}
    if context.get("is_admin"):
        return None
    billing_payload = billing_status_payload_for_context(context)
    billing = ensure_dict(billing_payload.get("billing"))
    entitlements = ensure_dict(billing_payload.get("entitlements"))
    access = safe_str(billing.get("access"))
    limit = connection_key_limit_from_entitlements(context, billing_payload)
    details = connection_guard_details(
        billing_payload=billing_payload,
        current_count=account_service.connection_slot_count(safe_str(context.get("user_id"))),
        limit=limit,
        entitlement="launcherConnection",
    )

    if access == "restricted":
        return {"reason": "billing_required", "details": details, "billing_payload": billing_payload}
    if access == "billing_attention":
        return {"reason": "billing_past_due", "details": details, "billing_payload": billing_payload}
    if entitlements.get("launcherConnection") is not True:
        return {"reason": "entitlement_required", "details": details, "billing_payload": billing_payload}
    if limit <= 0:
        return {"reason": "plan_limit_reached", "details": details, "billing_payload": billing_payload}
    return None


ACCOUNT_REGISTRY_BILLING_SCRUB_FIELDS = {
    "balance",
    "account_balance",
    "equity",
    "account_equity",
    "open_pnl",
    "openPnl",
    "floating_pnl",
    "floatingPnl",
    "total_pnl",
    "totalPnl",
    "pnl",
    "net_pnl",
    "netPnl",
    "closed_pnl",
    "closedPnl",
}


def scrub_accounts_registry_for_billing(accounts: list[dict[str, Any]], denial: dict[str, Any]) -> list[dict[str, Any]]:
    reason = safe_str(denial.get("reason"), "entitlement_required")
    details = ensure_dict(denial.get("details"))
    scrubbed: list[dict[str, Any]] = []
    for account in accounts:
        if not isinstance(account, dict):
            continue
        item = deepcopy(account)
        for field in ACCOUNT_REGISTRY_BILLING_SCRUB_FIELDS:
            item.pop(field, None)
        item["billing_blocked"] = True
        item["billing_reason"] = reason
        item["billing_access"] = safe_str(details.get("billing_access"))
        item["billing_plan"] = safe_str(details.get("effective_plan") or details.get("plan"))
        item["status"] = "plan_limited"
        item["lifecycle_status"] = "plan_limited"
        item["last_error_code"] = reason
        item["last_error_message"] = "Plan necesario para mostrar datos live de MT5."
        scrubbed.append(item)
    return scrubbed


def billing_blocked_accounts_payload(context: dict[str, Any], denial: dict[str, Any]) -> dict[str, Any]:
    billing_payload = ensure_dict(denial.get("billing_payload"))
    payload = empty_accounts_payload(context)
    payload.update(
        {
            "live_access_blocked": True,
            "reason": safe_str(denial.get("reason"), "entitlement_required"),
            "details": ensure_dict(denial.get("details")),
            "billing": ensure_dict(billing_payload.get("billing")),
            "entitlements": ensure_dict(billing_payload.get("entitlements")),
            "limits": ensure_dict(billing_payload.get("limits")),
        }
    )
    return payload


STRIPE_API_BASE_URL = "https://api.stripe.com/v1"
STRIPE_DEFAULT_API_VERSION = "2026-02-25.clover"


def billing_public_app_url() -> str:
    return (_env_value("KMFX_APP_URL", "NEXT_PUBLIC_APP_URL", "PUBLIC_APP_URL", "APP_URL") or "https://kmfxedge.com").rstrip("/")


def billing_success_url() -> str:
    base_url = billing_public_app_url()
    path = _env_value("BILLING_SUCCESS_PATH") or "/ajustes?tab=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}"
    separator = "" if path.startswith("/") else "/"
    return f"{base_url}{separator}{path}"


def billing_cancel_url() -> str:
    base_url = billing_public_app_url()
    path = _env_value("BILLING_CANCEL_PATH") or "/ajustes?tab=subscription&checkout=cancelled"
    separator = "" if path.startswith("/") else "/"
    return f"{base_url}{separator}{path}"


def billing_safe_return_url(value: Any, fallback: str) -> str:
    raw_url = safe_str(value)
    if not raw_url:
        return fallback

    base_url = billing_public_app_url()
    parsed_base = urllib.parse.urlparse(base_url)
    if parsed_base.scheme not in {"http", "https"} or not parsed_base.netloc:
        return fallback

    allowed_origin = f"{parsed_base.scheme}://{parsed_base.netloc}"
    parsed_url = urllib.parse.urlparse(raw_url)
    if not parsed_url.scheme and not parsed_url.netloc:
        path = raw_url if raw_url.startswith("/") else f"/{raw_url}"
        return f"{allowed_origin}{path}"

    if (
        parsed_url.scheme.lower() == parsed_base.scheme.lower()
        and parsed_url.netloc.lower() == parsed_base.netloc.lower()
    ):
        return raw_url

    log.warning("Billing return URL rejected | host=%s", parsed_url.netloc or "[relative-netloc]")
    return fallback


def billing_trial_period_days() -> int:
    configured = _env_value("STRIPE_TRIAL_PERIOD_DAYS", "KMFX_STRIPE_TRIAL_PERIOD_DAYS")
    if not configured:
        return 7
    try:
        parsed = int(configured)
    except ValueError:
        return 7
    return parsed if parsed >= 0 else 7


def billing_trial_requires_card() -> bool:
    configured = _env_value("STRIPE_TRIAL_REQUIRES_CARD", "KMFX_STRIPE_TRIAL_REQUIRES_CARD")
    if not configured:
        return False
    return configured.lower() in {"1", "true", "yes", "y", "on"}


def stripe_secret_key() -> str:
    return _env_value("STRIPE_SECRET_KEY", "KMFX_STRIPE_SECRET_KEY")


def stripe_webhook_secret() -> str:
    return _env_value("STRIPE_WEBHOOK_SECRET", "KMFX_STRIPE_WEBHOOK_SECRET")


def stripe_api_version() -> str:
    return _env_value("STRIPE_API_VERSION", "KMFX_STRIPE_API_VERSION") or STRIPE_DEFAULT_API_VERSION


def supabase_service_role_key() -> str:
    return _env_value("SUPABASE_SERVICE_ROLE_KEY", "KMFX_SUPABASE_SERVICE_ROLE_KEY")


def billing_json_response(payload: dict[str, Any], status_code: int = 200) -> JSONResponse:
    return connector_json_response({**payload, "timestamp": payload.get("timestamp") or now_iso()}, status_code=status_code)


def billing_auth_required_response(reason: str = "auth_required", status_code: int = 401) -> JSONResponse:
    return billing_json_response(
        {
            "ok": False,
            "reason": reason,
            "error": reason,
        },
        status_code=status_code,
    )


def billing_user_context(request: Request) -> tuple[dict[str, Any], JSONResponse | None]:
    context = build_admin_context(request)
    user_id = safe_str(context.get("user_id")).lower()
    if not user_id:
        return context, billing_auth_required_response()
    try:
        UUID(user_id)
    except (TypeError, ValueError):
        return context, billing_auth_required_response("supabase_user_id_required", status_code=403)
    return context, None


def stripe_form_items(value: Any, prefix: str = "") -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_key = f"{prefix}[{key}]" if prefix else str(key)
            items.extend(stripe_form_items(child, child_key))
        return items
    if isinstance(value, list):
        for index, child in enumerate(value):
            child_key = f"{prefix}[{index}]"
            items.extend(stripe_form_items(child, child_key))
        return items
    if value is None:
        return items
    if isinstance(value, bool):
        items.append((prefix, "true" if value else "false"))
    else:
        items.append((prefix, str(value)))
    return items


def encode_stripe_form(params: dict[str, Any] | None) -> bytes | None:
    if not params:
        return None
    return urllib.parse.urlencode(stripe_form_items(params)).encode("utf-8")


def read_json_http_response(response: Any) -> dict[str, Any]:
    raw_body = response.read()
    if not raw_body:
        return {}
    payload = json.loads(raw_body.decode("utf-8"))
    return payload if isinstance(payload, dict) else {}


def stripe_idempotency_key(prefix: str, *parts: str) -> str:
    material = "|".join(safe_str(part).lower() for part in parts if safe_str(part))
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest() if material else hashlib.sha256(prefix.encode("utf-8")).hexdigest()
    normalized_prefix = re.sub(r"[^a-zA-Z0-9_-]+", "_", safe_str(prefix) or "kmfx")
    return f"{normalized_prefix}_{digest[:32]}"


def stripe_api_request(
    method: str,
    path: str,
    params: dict[str, Any] | None = None,
    *,
    idempotency_key: str = "",
) -> dict[str, Any]:
    secret = stripe_secret_key()
    if not secret:
        raise RuntimeError("stripe_not_configured")
    normalized_path = f"/{path.lstrip('/')}"
    method = safe_str(method, "GET").upper()
    url = f"{STRIPE_API_BASE_URL}{normalized_path}"
    body = None
    if method == "GET" and params:
        query = urllib.parse.urlencode(stripe_form_items(params))
        url = f"{url}?{query}"
    elif params:
        body = encode_stripe_form(params)
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {secret}",
        "Stripe-Version": stripe_api_version(),
    }
    if idempotency_key and method != "GET":
        headers["Idempotency-Key"] = safe_str(idempotency_key)[:255]
    if body is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return read_json_http_response(response)
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        log.warning("Stripe API request failed | path=%s status=%s body=%s", normalized_path, exc.code, error_body[:500])
        raise RuntimeError(f"stripe_http_{exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        log.warning("Stripe API request failed | path=%s error=%s", normalized_path, exc)
        raise RuntimeError("stripe_request_failed") from exc


def transactional_email_api_key() -> str:
    return _env_value("RESEND_API_KEY", "KMFX_RESEND_API_KEY")


def transactional_email_from() -> str:
    return _env_value("KMFX_EMAIL_FROM", "RESEND_FROM_EMAIL") or "KMFX Edge <no-reply@kmfxedge.com>"


def transactional_email_reply_to() -> str:
    return _env_value("KMFX_EMAIL_REPLY_TO", "RESEND_REPLY_TO") or ""


def mask_email_for_log(email: str) -> str:
    value = safe_str(email).lower()
    if "@" not in value:
        return ""
    local, domain = value.split("@", 1)
    if not local or not domain:
        return ""
    if len(local) <= 2:
        masked_local = f"{local[:1]}***"
    else:
        masked_local = f"{local[:2]}***{local[-1:]}"
    return f"{masked_local}@{domain}"


def send_transactional_email(
    *,
    to_email: str,
    subject: str,
    html: str,
    text: str,
    tags: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    api_key = transactional_email_api_key()
    to_email = safe_str(to_email).lower()
    if not api_key:
        return {"sent": False, "reason": "email_not_configured"}
    if not to_email or "@" not in to_email:
        return {"sent": False, "reason": "email_recipient_missing"}
    payload: dict[str, Any] = {
        "from": transactional_email_from(),
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
    }
    reply_to = transactional_email_reply_to()
    if reply_to:
        payload["reply_to"] = reply_to
    if tags:
        payload["tags"] = tags
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=body,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return {"sent": True, "provider": "resend", "response": read_json_http_response(response)}
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        log.warning("Transactional email failed | status=%s body=%s", exc.code, error_body[:500])
        return {"sent": False, "provider": "resend", "reason": f"email_http_{exc.code}"}
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        log.warning("Transactional email failed | error=%s", exc)
        return {"sent": False, "provider": "resend", "reason": "email_request_failed"}


def purchase_confirmation_plan_highlights(plan: str) -> list[str]:
    plan_key = normalize_plan_key(plan)
    if plan_key == "core":
        return [
            "Hasta 2 cuentas MT5 conectadas",
            "Dashboard, calendario y métricas core",
            "Base sólida para empezar con una operativa principal",
        ]
    if plan_key == "unlimited":
        return [
            "Cuentas MT5 ilimitadas",
            "Dashboard, funding, journal, riesgo y exports completos",
            "Pensado para multi-cuenta, mentoring o uso intensivo",
        ]
    return [
        "Hasta 5 cuentas MT5 conectadas",
        "Funding, riesgo, journal y analítica avanzada",
        "El equilibrio recomendado para varias cuentas o pruebas de fondeo",
    ]


def build_purchase_confirmation_email(*, email: str, plan: str, interval: str) -> dict[str, str]:
    plan_key = normalize_plan_key(plan)
    plan_name = PLAN_DISPLAY_NAMES.get(plan_key, PLAN_DISPLAY_NAMES["pro"])
    interval_copy = "anual" if safe_str(interval).lower() == "yearly" else "mensual"
    app_url = billing_public_app_url()
    subscription_url = f"{app_url}/ajustes?tab=subscription"
    connections_url = f"{app_url}/cuentas"
    safe_email = html_lib.escape(safe_str(email).lower())
    safe_plan_name = html_lib.escape(plan_name)
    safe_interval_copy = html_lib.escape(interval_copy)
    safe_app_url = html_lib.escape(app_url, quote=True)
    safe_subscription_url = html_lib.escape(subscription_url, quote=True)
    safe_connections_url = html_lib.escape(connections_url, quote=True)
    highlights_markup = "".join(
        f'<li style="margin:0 0 8px;color:#d4d4d8;font-size:15px;line-height:1.5;">{html_lib.escape(item)}</li>'
        for item in purchase_confirmation_plan_highlights(plan_key)
    )
    subject = f"Tu acceso a {plan_name} ya está activo"
    text = (
        f"Tu suscripción {plan_name} ({interval_copy}) ya está activa en KMFX Edge.\n\n"
        f"Entra aquí para acceder al dashboard: {app_url}\n\n"
        "Primeros pasos recomendados:\n"
        "1. Entra al dashboard y confirma que tu plan aparece activo.\n"
        f"2. Ve a Cuentas para conectar tu MT5: {connections_url}\n"
        "3. Descarga el launcher o instala el EA con la KMFXKey de esa cuenta.\n\n"
        f"Facturas, cobros y método de pago: {subscription_url}\n\n"
        "Si acabas de usar un cupón del 100 %, tu acceso queda igualmente registrado como suscripción activa."
    )
    html = f"""
    <div style="margin:0;padding:0;background:#09090b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <p style="margin:0 0 18px;color:#a1a1aa;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">KMFX Edge</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.12;color:#ffffff;">Tu acceso ya está activo</h1>
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:16px;line-height:1.55;">Has activado <strong style="color:#ffffff;">{safe_plan_name}</strong> en modalidad {safe_interval_copy}. Ya puedes entrar al dashboard y empezar a trabajar con las funciones incluidas en tu plan.</p>
        <div style="margin:24px 0;padding:16px;border:1px solid #27272a;border-radius:14px;background:#111113;">
          <p style="margin:0;color:#a1a1aa;font-size:13px;">Cuenta</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:16px;">{safe_email}</p>
          <p style="margin:14px 0 0;color:#a1a1aa;font-size:13px;">Plan</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:16px;">{safe_plan_name} · {safe_interval_copy}</p>
        </div>
        <div style="margin:24px 0;padding:16px;border:1px solid #27272a;border-radius:14px;background:#0f1720;">
          <p style="margin:0 0 10px;color:#ffffff;font-size:15px;font-weight:700;">Qué desbloquea tu plan</p>
          <ul style="margin:0;padding-left:18px;">
            {highlights_markup}
          </ul>
        </div>
        <div style="margin:24px 0;padding:16px;border:1px solid #27272a;border-radius:14px;background:#111113;">
          <p style="margin:0 0 10px;color:#ffffff;font-size:15px;font-weight:700;">Qué hacer ahora</p>
          <ol style="margin:0;padding-left:18px;">
            <li style="margin:0 0 8px;color:#d4d4d8;font-size:15px;line-height:1.5;">Entra al dashboard y confirma que tu plan ya aparece activo.</li>
            <li style="margin:0 0 8px;color:#d4d4d8;font-size:15px;line-height:1.5;">Ve a <strong style="color:#ffffff;">Cuentas</strong> para conectar tu MT5 y copiar tu KMFXKey.</li>
            <li style="margin:0;color:#d4d4d8;font-size:15px;line-height:1.5;">Descarga el launcher o instala el EA en la instancia MT5 que quieras sincronizar.</li>
          </ol>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          <a href="{safe_app_url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#3f7cff;color:#ffffff;text-decoration:none;font-weight:700;">Entrar al dashboard</a>
          <a href="{safe_connections_url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:700;border:1px solid #27272a;">Abrir Cuentas</a>
        </div>
        <p style="margin:24px 0 0;color:#d4d4d8;font-size:14px;line-height:1.55;">Tus facturas, cobros y método de pago están disponibles en <a href="{safe_subscription_url}" style="color:#8ab4ff;text-decoration:none;">Ajustes &gt; Suscripción</a>, dentro de <strong style="color:#ffffff;">Método de pago y facturas</strong>.</p>
        <p style="margin:14px 0 0;color:#8b8b92;font-size:13px;line-height:1.5;">Si el pago se hizo con descuento del 100 %, es normal que el total sea 0 €. El acceso queda asociado a esta cuenta.</p>
      </div>
    </div>
    """
    return {"subject": subject, "html": html, "text": text}


def send_purchase_confirmation_email(*, email: str, plan: str, interval: str, event_id: str = "") -> dict[str, Any]:
    message = build_purchase_confirmation_email(email=email, plan=plan, interval=interval)
    result = send_transactional_email(
        to_email=email,
        subject=message["subject"],
        html=message["html"],
        text=message["text"],
        tags=[
            {"name": "app", "value": "kmfx_edge"},
            {"name": "event", "value": "purchase_confirmation"},
            {"name": "stripe_event_id", "value": safe_str(event_id)[:256]},
        ],
    )
    log.info(
        "Purchase confirmation email result | email=%s plan=%s interval=%s sent=%s reason=%s",
        mask_email_for_log(email),
        plan,
        interval,
        result.get("sent"),
        result.get("reason", ""),
    )
    return result


def billing_email_from_sources(*sources: dict[str, Any]) -> str:
    for source in sources:
        data = ensure_dict(source)
        metadata = ensure_dict(data.get("metadata"))
        customer_details = ensure_dict(data.get("customer_details"))
        for value in (
            data.get("customer_email"),
            data.get("email"),
            customer_details.get("email"),
            metadata.get("kmfx_user_email"),
            metadata.get("user_email"),
            metadata.get("email"),
        ):
            email = safe_str(value).lower()
            if email and "@" in email:
                return email
    return ""


def build_payment_failed_email(*, email: str, plan: str) -> dict[str, str]:
    plan_key = normalize_plan_key(plan)
    plan_name = PLAN_DISPLAY_NAMES.get(plan_key, PLAN_DISPLAY_NAMES["pro"])
    app_url = f"{billing_public_app_url()}/ajustes?tab=subscription"
    safe_plan_name = html_lib.escape(plan_name)
    safe_app_url = html_lib.escape(app_url, quote=True)
    subject = f"Revisa tu pago de {plan_name}"
    text = (
        f"No hemos podido confirmar el pago de tu suscripción {plan_name} en KMFX Edge.\n\n"
        f"Actualiza tu método de pago desde Ajustes > Suscripción: {app_url}\n\n"
        "Mientras el pago esté pendiente, algunas funciones pueden quedar limitadas según tu plan."
    )
    html = f"""
    <div style="margin:0;padding:0;background:#09090b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <p style="margin:0 0 18px;color:#a1a1aa;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">KMFX Edge</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.12;color:#ffffff;">Pago pendiente</h1>
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:16px;line-height:1.55;">No hemos podido confirmar el pago de <strong style="color:#ffffff;">{safe_plan_name}</strong>. Actualiza tu método de pago para evitar que se limiten funciones de KMFX Edge.</p>
        <a href="{safe_app_url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#3f7cff;color:#ffffff;text-decoration:none;font-weight:700;">Abrir suscripción</a>
        <p style="margin:24px 0 0;color:#8b8b92;font-size:13px;line-height:1.5;">KMFX Edge no gestiona tarjetas directamente. El cobro y los recibos se gestionan mediante Stripe.</p>
      </div>
    </div>
    """
    return {"subject": subject, "html": html, "text": text}


def send_payment_failed_email(*, email: str, plan: str, event_id: str = "") -> dict[str, Any]:
    message = build_payment_failed_email(email=email, plan=plan)
    result = send_transactional_email(
        to_email=email,
        subject=message["subject"],
        html=message["html"],
        text=message["text"],
        tags=[
            {"name": "app", "value": "kmfx_edge"},
            {"name": "event", "value": "payment_failed"},
            {"name": "stripe_event_id", "value": safe_str(event_id)[:256]},
        ],
    )
    log.info(
        "Payment failed email result | email=%s plan=%s sent=%s reason=%s",
        mask_email_for_log(email),
        plan,
        result.get("sent"),
        result.get("reason", ""),
    )
    return result


def build_subscription_paused_email(*, email: str, plan: str) -> dict[str, str]:
    plan_key = normalize_plan_key(plan)
    plan_name = PLAN_DISPLAY_NAMES.get(plan_key, PLAN_DISPLAY_NAMES["pro"])
    app_url = f"{billing_public_app_url()}/ajustes?tab=subscription"
    safe_plan_name = html_lib.escape(plan_name)
    safe_app_url = html_lib.escape(app_url, quote=True)
    subject = f"Tu suscripción {plan_name} está en pausa"
    text = (
        f"Tu suscripción {plan_name} ha quedado en pausa en KMFX Edge.\n\n"
        f"Añade o actualiza tu método de pago desde Ajustes > Suscripción: {app_url}\n\n"
        "Tus datos siguen guardados, pero las conexiones nuevas y el acceso premium pueden quedar bloqueados hasta reanudar el plan."
    )
    html = f"""
    <div style="margin:0;padding:0;background:#09090b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <p style="margin:0 0 18px;color:#a1a1aa;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">KMFX Edge</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.12;color:#ffffff;">Suscripción en pausa</h1>
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:16px;line-height:1.55;">Tu suscripción <strong style="color:#ffffff;">{safe_plan_name}</strong> está en pausa. Añade un método de pago o reanuda el plan para recuperar el acceso completo.</p>
        <a href="{safe_app_url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#3f7cff;color:#ffffff;text-decoration:none;font-weight:700;">Revisar suscripción</a>
        <p style="margin:24px 0 0;color:#8b8b92;font-size:13px;line-height:1.5;">KMFX Edge conserva tus datos y tu histórico mientras regularizas el plan. No hace falta crear otra cuenta ni regenerar tu KMFXKey.</p>
      </div>
    </div>
    """
    return {"subject": subject, "html": html, "text": text}


def send_subscription_paused_email(*, email: str, plan: str, event_id: str = "") -> dict[str, Any]:
    message = build_subscription_paused_email(email=email, plan=plan)
    result = send_transactional_email(
        to_email=email,
        subject=message["subject"],
        html=message["html"],
        text=message["text"],
        tags=[
            {"name": "app", "value": "kmfx_edge"},
            {"name": "event", "value": "subscription_paused"},
            {"name": "stripe_event_id", "value": safe_str(event_id)[:256]},
        ],
    )
    log.info(
        "Subscription paused email result | email=%s plan=%s sent=%s reason=%s",
        mask_email_for_log(email),
        plan,
        result.get("sent"),
        result.get("reason", ""),
    )
    return result


def build_subscription_changed_email(*, email: str, previous_plan: str, new_plan: str, interval: str) -> dict[str, str]:
    previous_plan_key = normalize_plan_key(previous_plan)
    new_plan_key = normalize_plan_key(new_plan)
    previous_plan_name = PLAN_DISPLAY_NAMES.get(previous_plan_key, PLAN_DISPLAY_NAMES["free"])
    new_plan_name = PLAN_DISPLAY_NAMES.get(new_plan_key, PLAN_DISPLAY_NAMES["pro"])
    interval_copy = "anual" if safe_str(interval).lower() == "yearly" else "mensual"
    app_url = f"{billing_public_app_url()}/ajustes?tab=subscription"
    safe_previous_plan_name = html_lib.escape(previous_plan_name)
    safe_new_plan_name = html_lib.escape(new_plan_name)
    safe_interval_copy = html_lib.escape(interval_copy)
    safe_app_url = html_lib.escape(app_url, quote=True)
    subject = f"Tu suscripción ahora es {new_plan_name}"
    text = (
        f"Tu suscripción de KMFX Edge ha cambiado de {previous_plan_name} a {new_plan_name} ({interval_copy}).\n\n"
        f"Puedes revisar el estado del plan desde Ajustes > Suscripción: {app_url}\n\n"
        "El acceso y los límites de tu cuenta se actualizarán automáticamente según el nuevo plan."
    )
    html = f"""
    <div style="margin:0;padding:0;background:#09090b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <p style="margin:0 0 18px;color:#a1a1aa;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">KMFX Edge</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.12;color:#ffffff;">Suscripción actualizada</h1>
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:16px;line-height:1.55;">Tu plan ha cambiado de <strong style="color:#ffffff;">{safe_previous_plan_name}</strong> a <strong style="color:#ffffff;">{safe_new_plan_name}</strong> en modalidad {safe_interval_copy}.</p>
        <a href="{safe_app_url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#3f7cff;color:#ffffff;text-decoration:none;font-weight:700;">Ver suscripción</a>
      </div>
    </div>
    """
    return {"subject": subject, "html": html, "text": text}


def send_subscription_changed_email(*, email: str, previous_plan: str, new_plan: str, interval: str, event_id: str = "") -> dict[str, Any]:
    message = build_subscription_changed_email(
        email=email,
        previous_plan=previous_plan,
        new_plan=new_plan,
        interval=interval,
    )
    result = send_transactional_email(
        to_email=email,
        subject=message["subject"],
        html=message["html"],
        text=message["text"],
        tags=[
            {"name": "app", "value": "kmfx_edge"},
            {"name": "event", "value": "subscription_changed"},
            {"name": "stripe_event_id", "value": safe_str(event_id)[:256]},
        ],
    )
    log.info(
        "Subscription changed email result | email=%s previous_plan=%s new_plan=%s interval=%s sent=%s reason=%s",
        mask_email_for_log(email),
        previous_plan,
        new_plan,
        interval,
        result.get("sent"),
        result.get("reason", ""),
    )
    return result


def build_subscription_cancel_scheduled_email(*, email: str, plan: str) -> dict[str, str]:
    plan_key = normalize_plan_key(plan)
    plan_name = PLAN_DISPLAY_NAMES.get(plan_key, PLAN_DISPLAY_NAMES["pro"])
    app_url = f"{billing_public_app_url()}/ajustes?tab=subscription"
    safe_plan_name = html_lib.escape(plan_name)
    safe_app_url = html_lib.escape(app_url, quote=True)
    subject = f"Tu cancelación de {plan_name} ha quedado programada"
    text = (
        f"Tu suscripción {plan_name} seguirá activa hasta el final del periodo actual y después se cancelará.\n\n"
        f"Puedes revisar o reactivar el plan desde Ajustes > Suscripción: {app_url}"
    )
    html = f"""
    <div style="margin:0;padding:0;background:#09090b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <p style="margin:0 0 18px;color:#a1a1aa;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">KMFX Edge</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.12;color:#ffffff;">Cancelación programada</h1>
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:16px;line-height:1.55;">Tu suscripción <strong style="color:#ffffff;">{safe_plan_name}</strong> seguirá activa hasta el final del periodo actual y luego se cancelará.</p>
        <a href="{safe_app_url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#3f7cff;color:#ffffff;text-decoration:none;font-weight:700;">Revisar suscripción</a>
      </div>
    </div>
    """
    return {"subject": subject, "html": html, "text": text}


def send_subscription_cancel_scheduled_email(*, email: str, plan: str, event_id: str = "") -> dict[str, Any]:
    message = build_subscription_cancel_scheduled_email(email=email, plan=plan)
    result = send_transactional_email(
        to_email=email,
        subject=message["subject"],
        html=message["html"],
        text=message["text"],
        tags=[
            {"name": "app", "value": "kmfx_edge"},
            {"name": "event", "value": "subscription_cancel_scheduled"},
            {"name": "stripe_event_id", "value": safe_str(event_id)[:256]},
        ],
    )
    log.info(
        "Subscription cancel scheduled email result | email=%s plan=%s sent=%s reason=%s",
        mask_email_for_log(email),
        plan,
        result.get("sent"),
        result.get("reason", ""),
    )
    return result


def build_subscription_reactivated_email(*, email: str, plan: str) -> dict[str, str]:
    plan_key = normalize_plan_key(plan)
    plan_name = PLAN_DISPLAY_NAMES.get(plan_key, PLAN_DISPLAY_NAMES["pro"])
    app_url = f"{billing_public_app_url()}/ajustes?tab=subscription"
    safe_plan_name = html_lib.escape(plan_name)
    safe_app_url = html_lib.escape(app_url, quote=True)
    subject = f"Tu suscripción {plan_name} sigue activa"
    text = (
        f"Tu cancelación programada se ha retirado y tu suscripción {plan_name} sigue activa.\n\n"
        f"Puedes revisar el estado del plan desde Ajustes > Suscripción: {app_url}"
    )
    html = f"""
    <div style="margin:0;padding:0;background:#09090b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <p style="margin:0 0 18px;color:#a1a1aa;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">KMFX Edge</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.12;color:#ffffff;">Suscripción reactivada</h1>
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:16px;line-height:1.55;">Tu suscripción <strong style="color:#ffffff;">{safe_plan_name}</strong> seguirá activa. La cancelación programada se ha retirado correctamente.</p>
        <a href="{safe_app_url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#3f7cff;color:#ffffff;text-decoration:none;font-weight:700;">Ver suscripción</a>
      </div>
    </div>
    """
    return {"subject": subject, "html": html, "text": text}


def send_subscription_reactivated_email(*, email: str, plan: str, event_id: str = "") -> dict[str, Any]:
    message = build_subscription_reactivated_email(email=email, plan=plan)
    result = send_transactional_email(
        to_email=email,
        subject=message["subject"],
        html=message["html"],
        text=message["text"],
        tags=[
            {"name": "app", "value": "kmfx_edge"},
            {"name": "event", "value": "subscription_reactivated"},
            {"name": "stripe_event_id", "value": safe_str(event_id)[:256]},
        ],
    )
    log.info(
        "Subscription reactivated email result | email=%s plan=%s sent=%s reason=%s",
        mask_email_for_log(email),
        plan,
        result.get("sent"),
        result.get("reason", ""),
    )
    return result


def build_subscription_canceled_email(*, email: str, plan: str) -> dict[str, str]:
    plan_key = normalize_plan_key(plan)
    plan_name = PLAN_DISPLAY_NAMES.get(plan_key, PLAN_DISPLAY_NAMES["pro"])
    app_url = f"{billing_public_app_url()}/ajustes?tab=subscription"
    safe_plan_name = html_lib.escape(plan_name)
    safe_app_url = html_lib.escape(app_url, quote=True)
    subject = f"Tu suscripción {plan_name} se ha cancelado"
    text = (
        f"Tu suscripción {plan_name} se ha cancelado en KMFX Edge.\n\n"
        f"Puedes revisar el estado de tu plan desde Ajustes > Suscripción: {app_url}\n\n"
        "Tus datos no se eliminan automáticamente por cancelar el plan, pero el acceso a funciones puede quedar limitado."
    )
    html = f"""
    <div style="margin:0;padding:0;background:#09090b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <p style="margin:0 0 18px;color:#a1a1aa;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">KMFX Edge</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.12;color:#ffffff;">Suscripción cancelada</h1>
        <p style="margin:0 0 18px;color:#d4d4d8;font-size:16px;line-height:1.55;">Tu suscripción <strong style="color:#ffffff;">{safe_plan_name}</strong> se ha cancelado. Puedes revisar tu acceso, plan o reactivar desde el panel de suscripción.</p>
        <a href="{safe_app_url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#3f7cff;color:#ffffff;text-decoration:none;font-weight:700;">Ver suscripción</a>
        <p style="margin:24px 0 0;color:#8b8b92;font-size:13px;line-height:1.5;">Cancelar el plan no elimina automáticamente tus datos sincronizados. Para solicitudes de eliminación o exportación, contacta con soporte.</p>
      </div>
    </div>
    """
    return {"subject": subject, "html": html, "text": text}


def send_subscription_canceled_email(*, email: str, plan: str, event_id: str = "") -> dict[str, Any]:
    message = build_subscription_canceled_email(email=email, plan=plan)
    result = send_transactional_email(
        to_email=email,
        subject=message["subject"],
        html=message["html"],
        text=message["text"],
        tags=[
            {"name": "app", "value": "kmfx_edge"},
            {"name": "event", "value": "subscription_canceled"},
            {"name": "stripe_event_id", "value": safe_str(event_id)[:256]},
        ],
    )
    log.info(
        "Subscription canceled email result | email=%s plan=%s sent=%s reason=%s",
        mask_email_for_log(email),
        plan,
        result.get("sent"),
        result.get("reason", ""),
    )
    return result


def supabase_admin_request(
    method: str,
    path: str,
    *,
    payload: Any = None,
    query: dict[str, str] | None = None,
    prefer: str = "return=representation",
) -> Any:
    service_key = supabase_service_role_key()
    if not service_key:
        raise RuntimeError("supabase_service_role_not_configured")
    normalized_path = path.lstrip("/")
    url = f"{SUPABASE_PROJECT_URL}/{normalized_path}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(url, data=body, headers=headers, method=safe_str(method, "GET").upper())
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw_body = response.read()
            if not raw_body:
                return {}
            return json.loads(raw_body.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        log.warning("Supabase admin request failed | path=%s status=%s body=%s", normalized_path, exc.code, error_body[:500])
        raise RuntimeError(f"supabase_http_{exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        log.warning("Supabase admin request failed | path=%s error=%s", normalized_path, exc)
        raise RuntimeError("supabase_request_failed") from exc


LIVE_STRIPE_PRICE_REFERENCES = {
    ("core", "monthly"): "price_1TUBYUEoC6e7wNItXEGCdVZ4",
    ("core", "yearly"): "price_1TUC1ZEoC6e7wNItpQF7UGPA",
    ("pro", "monthly"): "price_1TULXwEoC6e7wNItP3e4pCh4",
    ("pro", "yearly"): "price_1TULY0EoC6e7wNItYVKQKHIi",
    ("unlimited", "monthly"): "price_1TUC5uEoC6e7wNItcPyjGy5Z",
    ("unlimited", "yearly"): "price_1TUC65EoC6e7wNItBfoMCblt",
}


def billing_plan_price_reference(plan: str, interval: str) -> str:
    plan = normalize_plan_key(plan)
    interval = safe_str(interval, "monthly").lower()
    if interval not in {"monthly", "yearly"}:
        interval = "monthly"
    env_name = f"STRIPE_PRICE_{plan.upper()}_{interval.upper()}"
    configured = _env_value(env_name, f"KMFX_{env_name}")
    if configured:
        return configured
    return LIVE_STRIPE_PRICE_REFERENCES.get((plan, interval), "")


def stripe_price_plan_candidates() -> dict[str, str]:
    candidates: dict[str, str] = {}
    for plan in ("core", "pro", "unlimited"):
        for interval in ("monthly", "yearly"):
            default_lookup_key = f"kmfx_basic_{interval}" if plan == "core" else f"kmfx_{plan}_{interval}"
            candidates[default_lookup_key] = plan
            if plan == "core":
                candidates[f"kmfx_core_{interval}"] = plan
            configured = billing_plan_price_reference(plan, interval)
            if configured:
                candidates[configured] = plan
    return candidates


def resolve_stripe_price_reference(plan: str, interval: str) -> dict[str, str]:
    plan = normalize_plan_key(plan)
    if plan not in {"core", "pro", "unlimited"}:
        raise ValueError("invalid_billing_plan")
    reference = billing_plan_price_reference(plan, interval)
    if not reference:
        raise RuntimeError("price_not_configured")
    if reference.startswith("price_"):
        return {"price_id": reference, "lookup_key": ""}
    payload = stripe_api_request("GET", "/prices", {"lookup_keys": [reference], "active": True, "limit": 1})
    prices = payload.get("data") if isinstance(payload.get("data"), list) else []
    if not prices:
        raise RuntimeError("stripe_price_not_found")
    price = ensure_dict(prices[0])
    price_id = safe_str(price.get("id"))
    if not price_id:
        raise RuntimeError("stripe_price_not_found")
    return {"price_id": price_id, "lookup_key": reference}


def stripe_plan_from_price(price: dict[str, Any] | None = None, *, price_id: str = "", lookup_key: str = "") -> str:
    price = ensure_dict(price)
    metadata = ensure_dict(price.get("metadata"))
    for raw_plan in (
        metadata.get("kmfx_plan"),
        metadata.get("plan_key"),
        metadata.get("plan"),
        metadata.get("product_plan"),
    ):
        plan = safe_str(raw_plan).lower()
        if plan in {"core", "pro", "unlimited", "desk"}:
            return plan
    normalized_lookup = safe_str(lookup_key or price.get("lookup_key")).lower()
    normalized_price_id = safe_str(price_id or price.get("id"))
    candidates = stripe_price_plan_candidates()
    if normalized_lookup and normalized_lookup in candidates:
        return candidates[normalized_lookup]
    if normalized_price_id and normalized_price_id in candidates:
        return candidates[normalized_price_id]
    return "free"


def stripe_price_belongs_to_kmfx(price: dict[str, Any] | None = None, *, price_id: str = "", lookup_key: str = "") -> bool:
    price = ensure_dict(price)
    metadata = ensure_dict(price.get("metadata"))
    if safe_str(metadata.get("app")).lower() == "kmfx_edge":
        return True
    if safe_str(metadata.get("kmfx_plan") or metadata.get("plan_key")).lower() in {"core", "pro", "unlimited", "desk"}:
        return True
    product_id = safe_str(price.get("product"))
    configured_product = _env_value("STRIPE_PRODUCT_ID", "KMFX_STRIPE_PRODUCT_ID")
    if configured_product and product_id == configured_product:
        return True
    normalized_lookup = safe_str(lookup_key or price.get("lookup_key")).lower()
    normalized_price_id = safe_str(price_id or price.get("id"))
    candidates = stripe_price_plan_candidates()
    return bool((normalized_lookup and normalized_lookup in candidates) or (normalized_price_id and normalized_price_id in candidates))


def stripe_subscription_belongs_to_kmfx(subscription: dict[str, Any]) -> bool:
    subscription = ensure_dict(subscription)
    metadata = ensure_dict(subscription.get("metadata"))
    if safe_str(metadata.get("app")).lower() == "kmfx_edge":
        return True
    return stripe_price_belongs_to_kmfx(first_subscription_price(subscription))


def stripe_interval_from_price(price: dict[str, Any]) -> str:
    recurring = ensure_dict(ensure_dict(price).get("recurring"))
    interval = safe_str(recurring.get("interval")).lower()
    if interval == "year":
        return "yearly"
    if interval == "month":
        return "monthly"
    return "monthly"


def stripe_checkout_session_belongs_to_kmfx(session: dict[str, Any]) -> bool:
    session = ensure_dict(session)
    metadata = ensure_dict(session.get("metadata"))
    if safe_str(metadata.get("app")).lower() == "kmfx_edge":
        return True
    return False


def supabase_fetch_billing_customer(user_id: str) -> dict[str, Any]:
    rows = supabase_admin_request(
        "GET",
        "/rest/v1/billing_customers",
        query={
            "user_id": f"eq.{user_id}",
            "select": "user_id,stripe_customer_id,email,metadata",
            "limit": "1",
        },
    )
    if isinstance(rows, list) and rows:
        return ensure_dict(rows[0])
    return {}


def supabase_fetch_billing_customer_by_stripe_customer_id(stripe_customer_id: str) -> dict[str, Any]:
    stripe_customer_id = safe_str(stripe_customer_id)
    if not stripe_customer_id:
        return {}
    rows = supabase_admin_request(
        "GET",
        "/rest/v1/billing_customers",
        query={
            "stripe_customer_id": f"eq.{stripe_customer_id}",
            "select": "user_id,stripe_customer_id,email,metadata",
            "limit": "1",
        },
    )
    if isinstance(rows, list) and rows:
        return ensure_dict(rows[0])
    return {}


def supabase_fetch_current_billing_subscription(user_id: str) -> dict[str, Any]:
    user_id = safe_str(user_id).lower()
    if not user_id:
        return {}
    rows = supabase_admin_request(
        "GET",
        "/rest/v1/billing_subscriptions",
        query={
            "user_id": f"eq.{user_id}",
            "is_current": "eq.true",
            "select": (
                "user_id,stripe_subscription_id,stripe_customer_id,stripe_product_id,"
                "stripe_price_id,plan_key,status,current_period_start,current_period_end,"
                "cancel_at_period_end,trial_end,is_current,metadata"
            ),
            "order": "current_period_end.desc.nullslast",
            "limit": "1",
        },
    )
    if isinstance(rows, list) and rows:
        return ensure_dict(rows[0])
    return {}


def supabase_fetch_billing_subscription_by_subscription_id(subscription_id: str) -> dict[str, Any]:
    subscription_id = safe_str(subscription_id)
    if not subscription_id:
        return {}
    rows = supabase_admin_request(
        "GET",
        "/rest/v1/billing_subscriptions",
        query={
            "stripe_subscription_id": f"eq.{subscription_id}",
            "select": (
                "user_id,stripe_subscription_id,stripe_customer_id,stripe_product_id,"
                "stripe_price_id,plan_key,status,current_period_start,current_period_end,"
                "cancel_at_period_end,trial_end,is_current,metadata"
            ),
            "limit": "1",
        },
    )
    if isinstance(rows, list) and rows:
        return ensure_dict(rows[0])
    return {}


def supabase_upsert_billing_customer(user_id: str, stripe_customer_id: str, email: str = "", metadata: dict[str, Any] | None = None) -> None:
    supabase_admin_request(
        "POST",
        "/rest/v1/billing_customers",
        query={"on_conflict": "user_id"},
        payload={
            "user_id": user_id,
            "stripe_customer_id": stripe_customer_id,
            "email": email,
            "metadata": metadata or {},
        },
        prefer="resolution=merge-duplicates,return=representation",
    )


def ensure_billing_customer(context: dict[str, Any]) -> str:
    user_id = safe_str(context.get("user_id")).lower()
    email = safe_str(context.get("email")).lower()
    existing = supabase_fetch_billing_customer(user_id)
    customer_id = safe_str(existing.get("stripe_customer_id"))
    if customer_id:
        return customer_id
    customer = stripe_api_request(
        "POST",
        "/customers",
        {
            "email": email or None,
            "metadata": {
                "kmfx_user_id": user_id,
                "user_id": user_id,
                "kmfx_user_email": email,
                "app": "kmfx_edge",
            },
        },
    )
    customer_id = safe_str(customer.get("id"))
    if not customer_id:
        raise RuntimeError("stripe_customer_create_failed")
    supabase_upsert_billing_customer(
        user_id,
        customer_id,
        email=email,
        metadata={"source": "checkout", "stripe_livemode": bool(customer.get("livemode"))},
    )
    return customer_id


def stripe_timestamp_to_iso(value: Any) -> str:
    try:
        timestamp = int(value)
    except (TypeError, ValueError):
        return ""
    if timestamp <= 0:
        return ""
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def first_subscription_price(subscription: dict[str, Any]) -> dict[str, Any]:
    items = ensure_dict(subscription.get("items")).get("data")
    if not isinstance(items, list) or not items:
        return {}
    return ensure_dict(ensure_dict(items[0]).get("price"))


def stripe_subscription_to_billing_row(subscription: dict[str, Any], *, user_id: str = "") -> dict[str, Any]:
    subscription = ensure_dict(subscription)
    price = first_subscription_price(subscription)
    metadata = {
        **ensure_dict(subscription.get("metadata")),
        **ensure_dict(price.get("metadata")),
    }
    plan_key = normalize_plan_key(
        metadata.get("kmfx_plan")
        or metadata.get("plan_key")
        or metadata.get("plan")
        or stripe_plan_from_price(price)
    )
    customer_id = safe_str(subscription.get("customer"))
    status = safe_str(subscription.get("status"), "incomplete").lower()
    if status not in BILLING_STATUS_VALUES:
        status = "active" if status in {"paid"} else "incomplete"
    row = {
        "user_id": user_id or safe_str(metadata.get("kmfx_user_id") or metadata.get("user_id")).lower(),
        "stripe_subscription_id": safe_str(subscription.get("id")),
        "stripe_customer_id": customer_id,
        "stripe_product_id": safe_str(price.get("product")),
        "stripe_price_id": safe_str(price.get("id")),
        "plan_key": plan_key,
        "status": status,
        "current_period_start": stripe_timestamp_to_iso(subscription.get("current_period_start")),
        "current_period_end": stripe_timestamp_to_iso(subscription.get("current_period_end")),
        "cancel_at_period_end": bool(subscription.get("cancel_at_period_end")),
        "trial_end": stripe_timestamp_to_iso(subscription.get("trial_end")),
        "is_current": status not in {"canceled", "incomplete_expired"},
        "metadata": {
            "stripe_lookup_key": safe_str(price.get("lookup_key")),
            "stripe_livemode": bool(subscription.get("livemode")),
            "billing_reason": safe_str(subscription.get("billing_reason")),
        },
    }
    return {key: value for key, value in row.items() if value not in ("", None)}


def supabase_mark_user_subscriptions_not_current(user_id: str) -> None:
    supabase_admin_request(
        "PATCH",
        "/rest/v1/billing_subscriptions",
        query={"user_id": f"eq.{user_id}", "is_current": "eq.true"},
        payload={"is_current": False},
        prefer="return=minimal",
    )


def supabase_upsert_billing_subscription(row: dict[str, Any]) -> None:
    user_id = safe_str(row.get("user_id")).lower()
    subscription_id = safe_str(row.get("stripe_subscription_id"))
    if not user_id or not subscription_id:
        raise RuntimeError("subscription_identity_required")
    if row.get("is_current") is not False:
        supabase_mark_user_subscriptions_not_current(user_id)
    updated = supabase_admin_request(
        "PATCH",
        "/rest/v1/billing_subscriptions",
        query={"stripe_subscription_id": f"eq.{subscription_id}"},
        payload=row,
        prefer="return=representation",
    )
    if isinstance(updated, list) and updated:
        return
    try:
        supabase_admin_request(
            "POST",
            "/rest/v1/billing_subscriptions",
            payload=row,
            prefer="return=representation",
        )
    except RuntimeError as exc:
        if safe_str(exc) != "supabase_http_409":
            raise
        existing = supabase_fetch_billing_subscription_by_subscription_id(subscription_id)
        if existing:
            return
        raise


def supabase_update_auth_app_metadata(user_id: str, metadata: dict[str, Any]) -> None:
    if not metadata:
        return
    supabase_admin_request(
        "PUT",
        f"/auth/v1/admin/users/{urllib.parse.quote(user_id)}",
        payload={"app_metadata": metadata},
        prefer="",
    )


def subscription_app_metadata(row: dict[str, Any]) -> dict[str, Any]:
    plan_key = normalize_plan_key(row.get("plan_key") or row.get("plan") or row.get("kmfx_plan"))
    status = safe_str(row.get("status"), "free").lower()
    if status not in BILLING_STATUS_VALUES:
        status = "active"
    if status in {"canceled", "incomplete_expired"}:
        plan_key = "free"
    return {
        "plan": plan_key,
        "kmfx_plan": plan_key,
        "billing_status": status,
        "kmfx_billing_status": status,
        "stripe_customer_id": safe_str(row.get("stripe_customer_id")),
        "stripe_subscription_id": safe_str(row.get("stripe_subscription_id")),
        "stripe_price_id": safe_str(row.get("stripe_price_id")),
        "billing_current_period_end": safe_str(row.get("current_period_end")),
        "kmfx_current_period_end": safe_str(row.get("current_period_end")),
        "billing_trial_end": safe_str(row.get("trial_end")),
        "kmfx_trial_end": safe_str(row.get("trial_end")),
        "cancel_at_period_end": bool(row.get("cancel_at_period_end")),
        "kmfx_cancel_at_period_end": bool(row.get("cancel_at_period_end")),
    }


def fetch_stripe_customer(customer_id: str) -> dict[str, Any]:
    if not customer_id:
        return {}
    return stripe_api_request("GET", f"/customers/{urllib.parse.quote(customer_id)}")


def stripe_customers_for_email(email: str) -> list[dict[str, Any]]:
    email = safe_str(email).lower()
    if not email:
        return []
    payload = stripe_api_request("GET", "/customers", {"email": email, "limit": 10})
    data = payload.get("data")
    return [ensure_dict(item) for item in data] if isinstance(data, list) else []


def stripe_customer_user_id(customer_id: str) -> str:
    customer = fetch_stripe_customer(customer_id)
    metadata = ensure_dict(customer.get("metadata"))
    resolved_user_id = safe_str(metadata.get("kmfx_user_id") or metadata.get("user_id")).lower()
    if resolved_user_id:
        return resolved_user_id
    return safe_str(supabase_fetch_billing_customer_by_stripe_customer_id(customer_id).get("user_id")).lower()


def fetch_stripe_subscription(subscription_id: str) -> dict[str, Any]:
    if not subscription_id:
        return {}
    return stripe_api_request(
        "GET",
        f"/subscriptions/{urllib.parse.quote(subscription_id)}",
        {"expand": ["items.data.price"]},
    )


def list_stripe_customer_subscriptions(customer_id: str) -> list[dict[str, Any]]:
    customer_id = safe_str(customer_id)
    if not customer_id:
        return []
    payload = stripe_api_request(
        "GET",
        "/subscriptions",
        {
            "customer": customer_id,
            "status": "all",
            "limit": 20,
            "expand": ["data.items.data.price"],
        },
    )
    data = payload.get("data")
    return [ensure_dict(item) for item in data] if isinstance(data, list) else []


def subscription_priority(subscription: dict[str, Any]) -> tuple[int, int]:
    status = safe_str(subscription.get("status")).lower()
    status_rank = {
        "active": 5,
        "trialing": 4,
        "paused": 3,
        "past_due": 2,
        "unpaid": 1,
    }.get(status, 0)
    try:
        period_end = int(subscription.get("current_period_end") or subscription.get("trial_end") or 0)
    except (TypeError, ValueError):
        period_end = 0
    return status_rank, period_end


def sync_latest_kmfx_subscription_for_customer(customer_id: str, *, user_id: str, email: str = "") -> dict[str, Any]:
    subscriptions = [
        subscription
        for subscription in list_stripe_customer_subscriptions(customer_id)
        if stripe_subscription_belongs_to_kmfx(subscription)
    ]
    if not subscriptions:
        return {}
    subscription = sorted(subscriptions, key=subscription_priority, reverse=True)[0]
    sync_billing_subscription(subscription, user_id=user_id, email=email)
    return stripe_subscription_to_billing_row(subscription, user_id=user_id)


CHECKOUT_BLOCKING_SUBSCRIPTION_STATUSES = {
    "active",
    "trialing",
    "paused",
    "past_due",
    "unpaid",
    "incomplete",
}


def billing_row_blocks_new_checkout(row: dict[str, Any]) -> bool:
    row = ensure_dict(row)
    plan_key = normalize_plan_key(row.get("plan_key") or row.get("plan"))
    status = safe_str(row.get("status")).lower()
    return bool(plan_key != "free" and status in CHECKOUT_BLOCKING_SUBSCRIPTION_STATUSES)


def existing_kmfx_subscription_for_checkout(context: dict[str, Any], customer_id: str) -> dict[str, Any]:
    user_id = safe_str(context.get("user_id")).lower()
    email = safe_str(context.get("email")).lower()
    if not user_id:
        return {}
    try:
        row = supabase_fetch_current_billing_subscription(user_id)
    except RuntimeError:
        row = {}
    if billing_row_blocks_new_checkout(row):
        return row
    try:
        row = sync_latest_kmfx_subscription_for_customer(customer_id, user_id=user_id, email=email)
    except RuntimeError:
        row = {}
    if billing_row_blocks_new_checkout(row):
        return row
    checked_customer_ids = {customer_id} if customer_id else set()
    if email:
        try:
            email_customers = stripe_customers_for_email(email)
        except RuntimeError:
            email_customers = []
        for customer in email_customers:
            email_customer_id = safe_str(ensure_dict(customer).get("id"))
            if not email_customer_id or email_customer_id in checked_customer_ids:
                continue
            checked_customer_ids.add(email_customer_id)
            try:
                row = sync_latest_kmfx_subscription_for_customer(email_customer_id, user_id=user_id, email=email)
            except RuntimeError:
                row = {}
            if billing_row_blocks_new_checkout(row):
                return row
    return {}


def stripe_create_billing_portal_session(customer_id: str, return_url: str) -> dict[str, Any]:
    session = stripe_api_request(
        "POST",
        "/billing_portal/sessions",
        {
            "customer": customer_id,
            "return_url": return_url,
        },
    )
    portal_url = safe_str(session.get("url"))
    if not portal_url:
        raise RuntimeError("stripe_portal_url_missing")
    return session


def stripe_update_subscription(
    subscription_id: str,
    params: dict[str, Any],
    *,
    idempotency_key: str = "",
) -> dict[str, Any]:
    normalized_subscription_id = safe_str(subscription_id)
    if not normalized_subscription_id:
        raise RuntimeError("stripe_subscription_id_missing")
    return stripe_api_request(
        "POST",
        f"/subscriptions/{urllib.parse.quote(normalized_subscription_id)}",
        params,
        idempotency_key=idempotency_key,
    )


def first_subscription_item(subscription: dict[str, Any]) -> dict[str, Any]:
    items = ensure_dict(subscription.get("items")).get("data")
    if not isinstance(items, list) or not items:
        return {}
    return ensure_dict(items[0])


def billing_manageable_subscription(context: dict[str, Any], customer_id: str) -> dict[str, Any]:
    row = existing_kmfx_subscription_for_checkout(context, customer_id)
    if safe_str(row.get("stripe_subscription_id")):
        return row
    return {}


def billing_subscription_payload(row: dict[str, Any]) -> dict[str, Any]:
    row = ensure_dict(row)
    plan = normalize_plan_key(row.get("plan_key") or row.get("plan"))
    status = safe_str(row.get("status"), "free").lower()
    return {
        "plan": plan,
        "effectivePlan": "free" if status in BILLING_RESTRICTED_STATUSES else plan,
        "displayName": PLAN_DISPLAY_NAMES.get(plan, PLAN_DISPLAY_NAMES["free"]),
        "status": status,
        "currentPeriodEndsAt": safe_str(row.get("current_period_end")),
        "trialEndsAt": safe_str(row.get("trial_end")),
        "cancelAtPeriodEnd": bool(row.get("cancel_at_period_end")),
    }


def stripe_change_kmfx_subscription_price(
    subscription_id: str,
    *,
    price_id: str,
    user_id: str,
    email: str,
) -> dict[str, Any]:
    subscription = fetch_stripe_subscription(subscription_id)
    item_id = safe_str(first_subscription_item(subscription).get("id"))
    if not item_id:
        raise RuntimeError("stripe_subscription_item_missing")
    updated = stripe_update_subscription(
        subscription_id,
        {
            "cancel_at_period_end": False,
            "proration_behavior": "create_prorations",
            "items": [
                {
                    "id": item_id,
                    "price": price_id,
                }
            ],
        },
        idempotency_key=stripe_idempotency_key("kmfx_change_plan", user_id, subscription_id, price_id),
    )
    sync_billing_subscription(updated, user_id=user_id, email=email)
    return updated


def backfill_billing_subscription_for_context(context: dict[str, Any]) -> dict[str, Any]:
    user_id = safe_str(context.get("user_id")).lower()
    email = safe_str(context.get("email")).lower()
    if not user_id:
        return {}
    current_row = supabase_fetch_current_billing_subscription(user_id)
    if billing_row_blocks_new_checkout(current_row):
        return current_row
    billing_customer = supabase_fetch_billing_customer(user_id)
    customer_id = safe_str(billing_customer.get("stripe_customer_id"))
    if customer_id:
        row = sync_latest_kmfx_subscription_for_customer(customer_id, user_id=user_id, email=email)
        if row:
            return row
    for customer in stripe_customers_for_email(email):
        customer_id = safe_str(customer.get("id"))
        row = sync_latest_kmfx_subscription_for_customer(customer_id, user_id=user_id, email=email)
        if row:
            return row
    return current_row if current_row else {}


def sync_billing_subscription(subscription: dict[str, Any], *, user_id: str = "", email: str = "") -> dict[str, Any]:
    subscription = ensure_dict(subscription)
    metadata = ensure_dict(subscription.get("metadata"))
    customer_id = safe_str(subscription.get("customer"))
    resolved_user_id = safe_str(user_id or metadata.get("kmfx_user_id") or metadata.get("user_id")).lower()
    if not resolved_user_id and customer_id:
        resolved_user_id = stripe_customer_user_id(customer_id)
    if not resolved_user_id:
        raise RuntimeError("stripe_subscription_missing_user")
    row = stripe_subscription_to_billing_row(subscription, user_id=resolved_user_id)
    supabase_upsert_billing_customer(
        resolved_user_id,
        customer_id,
        email=email or safe_str(metadata.get("kmfx_user_email")).lower(),
        metadata={"source": "stripe_webhook", "stripe_livemode": bool(subscription.get("livemode"))},
    )
    supabase_upsert_billing_subscription(row)
    supabase_update_auth_app_metadata(resolved_user_id, subscription_app_metadata(row))
    return {"user_id": resolved_user_id, "plan": row.get("plan_key"), "status": row.get("status")}


def parse_stripe_signature_header(signature_header: str) -> dict[str, list[str]]:
    parsed: dict[str, list[str]] = {}
    for part in safe_str(signature_header).split(","):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        parsed.setdefault(key.strip(), []).append(value.strip())
    return parsed


def verify_stripe_webhook_signature(raw_body: bytes, signature_header: str, secret: str, *, tolerance_seconds: int = 300) -> bool:
    if not secret or not signature_header:
        return False
    parsed = parse_stripe_signature_header(signature_header)
    timestamp = safe_str((parsed.get("t") or [""])[0])
    signatures = parsed.get("v1") or []
    try:
        timestamp_int = int(timestamp)
    except ValueError:
        return False
    if tolerance_seconds > 0 and abs(int(time.time()) - timestamp_int) > tolerance_seconds:
        return False
    signed_payload = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, candidate) for candidate in signatures)


def supabase_billing_event_state(event_id: str) -> dict[str, Any]:
    rows = supabase_admin_request(
        "GET",
        "/rest/v1/billing_events",
        query={
            "stripe_event_id": f"eq.{event_id}",
            "select": "stripe_event_id,status,error,received_at,processed_at",
            "limit": "1",
        },
    )
    if isinstance(rows, list) and rows:
        return ensure_dict(rows[0])
    return {}


def supabase_billing_event_status(event_id: str) -> str:
    return safe_str(supabase_billing_event_state(event_id).get("status")).lower()


def billing_event_processing_started_recently(event_state: dict[str, Any]) -> bool:
    if safe_str(event_state.get("status")).lower() != "failed":
        return False
    if safe_str(event_state.get("error")) != "processing_started":
        return False
    marker = _parse_datetime(event_state.get("processed_at")) or _parse_datetime(event_state.get("received_at"))
    if marker is None:
        return False
    return datetime.now(timezone.utc) - marker < BILLING_EVENT_PROCESSING_RETRY_AFTER


def record_billing_event_once(event: dict[str, Any]) -> bool:
    event_id = safe_str(event.get("id"))
    if not event_id:
        raise RuntimeError("stripe_event_missing_id")
    existing_state = supabase_billing_event_state(event_id)
    existing_status = safe_str(existing_state.get("status")).lower()
    if existing_status in {"processed", "ignored"}:
        return False
    if billing_event_processing_started_recently(existing_state):
        return False
    # Reserve the Stripe event id without marking it processed yet. If the
    # worker crashes before process_stripe_billing_event finishes, Stripe can
    # retry and this retryable status will allow the event to run again.
    payload = {
        "stripe_event_id": event_id,
        "event_type": safe_str(event.get("type")),
        "livemode": bool(event.get("livemode")),
        "status": "failed",
        "processed_at": now_iso(),
        "error": "processing_started",
        "payload": event,
    }
    if existing_status == "failed":
        try:
            supabase_admin_request(
                "PATCH",
                "/rest/v1/billing_events",
                query={"stripe_event_id": f"eq.{event_id}"},
                payload=payload,
                prefer="return=minimal",
            )
        except RuntimeError as exc:
            reason = safe_str(exc)
            if reason == "supabase_http_409":
                return False
            raise
    else:
        try:
            supabase_admin_request(
                "POST",
                "/rest/v1/billing_events",
                payload=payload,
                prefer="return=minimal",
            )
        except RuntimeError as exc:
            reason = safe_str(exc)
            if reason == "supabase_http_409":
                return False
            raise
    return True


def _is_idempotent_conflict_error(exc: BaseException) -> bool:
    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        message = safe_str(current)
        if "idempotent" in message.lower() and "409" in message:
            return True
        if isinstance(current, urllib.error.HTTPError) and getattr(current, "code", None) == 409:
            try:
                body = current.read().decode("utf-8", errors="replace")
            except Exception:
                body = ""
            body_lower = body.lower()
            return "duplicate" in body_lower or "billing_events" in body_lower or "stripe_event_id" in body_lower
        current = getattr(current, "__cause__", None) or getattr(current, "__context__", None)
    return False


def mark_billing_event_status(event_id: str, status: str, error: str = "") -> None:
    if not event_id:
        return
    payload = {
        "status": status if status in {"processed", "ignored", "failed"} else "failed",
        "processed_at": now_iso(),
        "error": error[:1000] if error else None,
    }
    supabase_admin_request(
        "PATCH",
        "/rest/v1/billing_events",
        query={"stripe_event_id": f"eq.{event_id}"},
        payload=payload,
        prefer="return=minimal",
    )


def process_checkout_session_completed(session: dict[str, Any], *, event_id: str = "") -> dict[str, Any]:
    metadata = ensure_dict(session.get("metadata"))
    subscription_id = safe_str(session.get("subscription"))
    subscription: dict[str, Any] = {}
    is_kmfx_session = stripe_checkout_session_belongs_to_kmfx(session)
    if subscription_id:
        subscription = fetch_stripe_subscription(subscription_id)
        is_kmfx_session = is_kmfx_session or stripe_subscription_belongs_to_kmfx(subscription)
    if not is_kmfx_session:
        return {"ignored": "non_kmfx_checkout_session"}
    user_id = safe_str(metadata.get("kmfx_user_id") or metadata.get("user_id") or session.get("client_reference_id")).lower()
    customer_id = safe_str(session.get("customer"))
    email = safe_str(ensure_dict(session.get("customer_details")).get("email") or metadata.get("kmfx_user_email") or metadata.get("user_email")).lower()
    if not user_id and customer_id:
        user_id = stripe_customer_user_id(customer_id)
    if not user_id and not subscription_id:
        raise RuntimeError("checkout_session_missing_user")
    if user_id and customer_id:
        supabase_upsert_billing_customer(
            user_id,
            customer_id,
            email=email,
            metadata={"source": "checkout.session.completed", "stripe_livemode": bool(session.get("livemode"))},
        )
    if not subscription_id:
        email_result = send_purchase_confirmation_email(
            email=email,
            plan=safe_str(metadata.get("kmfx_plan") or metadata.get("plan_key"), "pro"),
            interval=safe_str(metadata.get("kmfx_interval") or metadata.get("interval"), "monthly"),
            event_id=event_id,
        )
        return {"user_id": user_id, "subscription": "", "processed": "customer", "email": email_result}
    result = sync_billing_subscription(subscription, user_id=user_id, email=email)
    result["email"] = send_purchase_confirmation_email(
        email=email or safe_str(metadata.get("kmfx_user_email") or metadata.get("user_email")).lower(),
        plan=safe_str(result.get("plan") or metadata.get("kmfx_plan") or metadata.get("plan_key"), "pro"),
        interval=safe_str(metadata.get("kmfx_interval") or metadata.get("interval") or stripe_interval_from_price(first_subscription_price(subscription)), "monthly"),
        event_id=event_id,
    )
    return result


def process_stripe_billing_event(event: dict[str, Any]) -> dict[str, Any]:
    event_type = safe_str(event.get("type"))
    event_data = ensure_dict(event.get("data"))
    data_object = ensure_dict(event_data.get("object"))
    previous_attributes = ensure_dict(event_data.get("previous_attributes"))
    if event_type == "checkout.session.completed":
        return process_checkout_session_completed(data_object, event_id=safe_str(event.get("id")))
    if event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.resumed",
    }:
        if not stripe_subscription_belongs_to_kmfx(data_object):
            return {"ignored": "non_kmfx_subscription"}
        result = sync_billing_subscription(data_object)
        if event_type == "customer.subscription.created":
            metadata = ensure_dict(data_object.get("metadata"))
            price = first_subscription_price(data_object)
            email = billing_email_from_sources(data_object)
            if not email:
                customer_id = safe_str(data_object.get("customer"))
                if customer_id:
                    try:
                        email = billing_email_from_sources(fetch_stripe_customer(customer_id))
                    except RuntimeError:
                        email = ""
            if email:
                result["email"] = send_purchase_confirmation_email(
                    email=email,
                    plan=safe_str(result.get("plan") or metadata.get("kmfx_plan") or metadata.get("plan_key") or stripe_plan_from_price(price), "pro"),
                    interval=safe_str(metadata.get("kmfx_interval") or metadata.get("interval") or stripe_interval_from_price(price), "monthly"),
                    event_id=safe_str(event.get("id")),
                )
        if event_type == "customer.subscription.updated":
            email = billing_email_from_sources(data_object)
            current_price = first_subscription_price(data_object)
            previous_metadata = ensure_dict(previous_attributes.get("metadata"))
            previous_price = first_subscription_price(previous_attributes)
            current_plan = safe_str(
                result.get("plan")
                or ensure_dict(data_object.get("metadata")).get("kmfx_plan")
                or ensure_dict(data_object.get("metadata")).get("plan_key")
                or stripe_plan_from_price(current_price),
                "pro",
            )
            previous_plan = safe_str(
                previous_metadata.get("kmfx_plan")
                or previous_metadata.get("plan_key")
                or stripe_plan_from_price(previous_price),
            )
            has_previous_plan_signal = bool(
                previous_metadata.get("kmfx_plan")
                or previous_metadata.get("plan_key")
                or previous_price
            )
            current_cancel_at_period_end = bool(data_object.get("cancel_at_period_end"))
            previous_cancel_at_period_end = metadata_bool(previous_attributes.get("cancel_at_period_end"))
            if (
                email
                and has_previous_plan_signal
                and previous_plan
                and normalize_plan_key(previous_plan) != normalize_plan_key(current_plan)
            ):
                result["email"] = send_subscription_changed_email(
                    email=email,
                    previous_plan=previous_plan,
                    new_plan=current_plan,
                    interval=stripe_interval_from_price(current_price),
                    event_id=safe_str(event.get("id")),
                )
            elif email and previous_cancel_at_period_end is False and current_cancel_at_period_end is True:
                result["email"] = send_subscription_cancel_scheduled_email(
                    email=email,
                    plan=current_plan,
                    event_id=safe_str(event.get("id")),
                )
            elif email and previous_cancel_at_period_end is True and current_cancel_at_period_end is False:
                result["email"] = send_subscription_reactivated_email(
                    email=email,
                    plan=current_plan,
                    event_id=safe_str(event.get("id")),
                )
        if event_type == "customer.subscription.paused":
            result["email"] = send_subscription_paused_email(
                email=billing_email_from_sources(data_object),
                plan=safe_str(result.get("plan") or ensure_dict(data_object.get("metadata")).get("kmfx_plan") or ensure_dict(data_object.get("metadata")).get("plan_key"), "pro"),
                event_id=safe_str(event.get("id")),
            )
        if event_type == "customer.subscription.deleted":
            result["email"] = send_subscription_canceled_email(
                email=billing_email_from_sources(data_object),
                plan=safe_str(result.get("plan") or ensure_dict(data_object.get("metadata")).get("kmfx_plan") or ensure_dict(data_object.get("metadata")).get("plan_key"), "pro"),
                event_id=safe_str(event.get("id")),
            )
        emit_billing_audit_event(
            "billing_plan_changed",
            stripe_event=event,
            billing_result=result,
            stripe_object=data_object,
            subscription=data_object,
            status=safe_str(result.get("status") or data_object.get("status") or "ok", "ok"),
        )
        return result
    if event_type == "customer.updated":
        metadata = ensure_dict(data_object.get("metadata"))
        if safe_str(metadata.get("app")).lower() != "kmfx_edge":
            return {"ignored": "non_kmfx_customer"}
        user_id = safe_str(metadata.get("kmfx_user_id") or metadata.get("user_id")).lower()
        customer_id = safe_str(data_object.get("id"))
        if user_id and customer_id:
            supabase_upsert_billing_customer(
                user_id,
                customer_id,
                email=safe_str(data_object.get("email")).lower(),
                metadata={"source": "customer.updated", "stripe_livemode": bool(data_object.get("livemode"))},
            )
            return {"user_id": user_id, "customer": customer_id}
    if event_type in {"invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"}:
        subscription_id = safe_str(data_object.get("subscription"))
        if not subscription_id:
            return {"ignored": event_type or "invoice_without_subscription"}
        subscription = fetch_stripe_subscription(subscription_id)
        if not stripe_subscription_belongs_to_kmfx(subscription):
            return {"ignored": "non_kmfx_invoice"}
        result = sync_billing_subscription(subscription)
        result["invoice_event"] = event_type
        result["invoice_id"] = safe_str(data_object.get("id"))
        if event_type in {"invoice.payment_failed", "invoice.payment_action_required"}:
            result["email"] = send_payment_failed_email(
                email=billing_email_from_sources(data_object, subscription),
                plan=safe_str(result.get("plan") or stripe_subscription_to_billing_row(subscription).get("plan_key"), "pro"),
                event_id=safe_str(event.get("id")),
            )
            emit_billing_audit_event(
                "billing_payment_failed",
                stripe_event=event,
                billing_result=result,
                stripe_object=data_object,
                subscription=subscription,
                status="failed",
            )
        elif event_type == "invoice.paid":
            emit_billing_audit_event(
                "billing_payment_paid",
                stripe_event=event,
                billing_result=result,
                stripe_object=data_object,
                subscription=subscription,
                status="ok",
            )
        return result
    return {"ignored": event_type or "unknown"}


def emit_billing_audit_event(
    event_name: str,
    *,
    stripe_event: dict[str, Any],
    billing_result: dict[str, Any],
    stripe_object: dict[str, Any] | None = None,
    subscription: dict[str, Any] | None = None,
    status: str = "ok",
) -> None:
    event_type = safe_str(stripe_event.get("type"))
    data_object = ensure_dict(stripe_object)
    subscription_object = ensure_dict(subscription)
    metadata = {
        **ensure_dict(subscription_object.get("metadata")),
        **ensure_dict(data_object.get("metadata")),
    }
    user_id = safe_str(
        billing_result.get("user_id")
        or metadata.get("kmfx_user_id")
        or metadata.get("user_id")
    ).lower()
    details = {
        "stripe_event_id": safe_str(stripe_event.get("id")),
        "stripe_event_type": event_type,
        "stripe_subscription_id": safe_str(
            subscription_object.get("id")
            or data_object.get("subscription")
            or (data_object.get("id") if event_type.startswith("customer.subscription.") else "")
        ),
        "stripe_invoice_id": safe_str(data_object.get("id") if event_type.startswith("invoice.") else ""),
        "plan": safe_str(
            billing_result.get("plan")
            or metadata.get("kmfx_plan")
            or metadata.get("plan_key")
        ),
        "billing_status": safe_str(billing_result.get("status") or subscription_object.get("status") or data_object.get("status")),
    }
    emit_audit_event(event_name, user_id=user_id, status=status, details=details)


def connection_key_creation_denial(
    *,
    user_id: str,
    context: dict[str, Any],
    requested_slots: int = 1,
) -> JSONResponse | None:
    context = {**ensure_dict(context)}
    if context.get("is_admin"):
        return None
    normalized_user_id = safe_str(user_id)
    if normalized_user_id and not safe_str(context.get("user_id")):
        context["user_id"] = normalized_user_id
    current_count = account_service.connection_slot_count(normalized_user_id)
    if not normalized_user_id:
        return connection_guard_denial_response(
            reason="auth_required",
            status_code=401,
            details={
                "connection_limit": 0,
                "current_connections": current_count,
            },
        )

    billing_payload = billing_status_payload_for_context(context)
    billing = ensure_dict(billing_payload.get("billing"))
    entitlements = ensure_dict(billing_payload.get("entitlements"))
    limit = connection_key_limit_from_entitlements(context, billing_payload)
    guard_details = connection_guard_details(
        billing_payload=billing_payload,
        current_count=current_count,
        limit=limit,
    )

    billing_access = safe_str(billing.get("access"))
    if billing_access == "restricted":
        return connection_guard_denial_response(
            reason="billing_required",
            status_code=402,
            details=guard_details,
        )
    if billing_access == "billing_attention":
        return connection_guard_denial_response(
            reason="billing_past_due",
            status_code=402,
            details=guard_details,
        )

    if context_disables_connection_keys(context):
        return connection_guard_denial_response(
            reason="entitlement_required",
            status_code=403,
            details={
                **guard_details,
                "entitlement": "launcherConnection",
            },
        )
    if entitlements.get("launcherConnection") is not True:
        return connection_guard_denial_response(
            reason="entitlement_required",
            status_code=403,
            details={
                **guard_details,
                "entitlement": "launcherConnection",
            },
        )
    if limit <= 0:
        return connection_guard_denial_response(
            reason="plan_limit_reached",
            status_code=409,
            details={
                **guard_details,
                "entitlement": "liveMt5Accounts",
            },
        )
    if current_count + max(1, requested_slots) > limit:
        return connection_guard_denial_response(
            reason="plan_limit_reached",
            status_code=409,
            details={
                **guard_details,
                "entitlement": "liveMt5Accounts",
            },
        )
    return None


def allow_public_connection_key_bootstrap() -> bool:
    if _env_flag("KMFX_ALLOW_PUBLIC_KEY_BOOTSTRAP", default=False):
        return True
    return not _is_production_runtime()


def connection_key_rate_limit_for_endpoint(endpoint: str) -> int:
    normalized_endpoint = endpoint.lower()
    if "journal" in normalized_endpoint:
        default_limit = 1 if bandwidth_emergency_lockdown_enabled() else 30
        return _env_int("KMFX_CONNECTION_RATE_LIMIT_JOURNAL_PER_MINUTE", default=default_limit)
    if "policy" in normalized_endpoint:
        default_limit = 1 if bandwidth_emergency_lockdown_enabled() else 30
        return _env_int("KMFX_CONNECTION_RATE_LIMIT_POLICY_PER_MINUTE", default=default_limit)
    default_limit = 1 if bandwidth_emergency_lockdown_enabled() else 30
    return _env_int("KMFX_CONNECTION_RATE_LIMIT_SYNC_PER_MINUTE", default=default_limit)


def prune_connection_rate_limit_buckets(now: float, *, max_buckets: int | None = None) -> None:
    resolved_max_buckets = max_buckets if max_buckets is not None else _env_int(
        "KMFX_CONNECTION_RATE_LIMIT_MAX_BUCKETS",
        default=10000,
    )
    expired = [
        bucket_key
        for bucket_key, (window_start, _count) in CONNECTION_RATE_LIMIT_BUCKETS.items()
        if now - window_start >= CONNECTION_RATE_LIMIT_WINDOW_SECONDS
    ]
    for bucket_key in expired:
        CONNECTION_RATE_LIMIT_BUCKETS.pop(bucket_key, None)

    if resolved_max_buckets <= 0 or len(CONNECTION_RATE_LIMIT_BUCKETS) <= resolved_max_buckets:
        return

    overflow = len(CONNECTION_RATE_LIMIT_BUCKETS) - resolved_max_buckets
    oldest_keys = sorted(
        CONNECTION_RATE_LIMIT_BUCKETS,
        key=lambda bucket_key: CONNECTION_RATE_LIMIT_BUCKETS[bucket_key][0],
    )[:overflow]
    for bucket_key in oldest_keys:
        CONNECTION_RATE_LIMIT_BUCKETS.pop(bucket_key, None)


def connection_key_rate_limit_response(endpoint: str, connection_key: str) -> JSONResponse | None:
    normalized_key = safe_str(connection_key)
    if not normalized_key:
        return None
    limit = connection_key_rate_limit_for_endpoint(endpoint)
    if limit <= 0:
        return None
    now = time.time()
    prune_connection_rate_limit_buckets(now)
    bucket_key = f"{endpoint}:{hashlib.sha256(normalized_key.encode('utf-8')).hexdigest()}"
    window_start, count = CONNECTION_RATE_LIMIT_BUCKETS.get(bucket_key, (now, 0))
    if now - window_start >= CONNECTION_RATE_LIMIT_WINDOW_SECONDS:
        window_start, count = now, 0
    count += 1
    CONNECTION_RATE_LIMIT_BUCKETS[bucket_key] = (window_start, count)
    if count <= limit:
        return None
    retry_after_seconds = max(1, int(CONNECTION_RATE_LIMIT_WINDOW_SECONDS - (now - window_start)))
    log.warning(
        "%s rejected | reason=connection_key_rate_limited key=%s limit=%s retry_after=%s",
        endpoint,
        mask_connection_key(normalized_key),
        limit,
        retry_after_seconds,
    )
    emit_audit_event(
        "mt5_sync_rejected",
        status="rejected",
        details={
            "endpoint": endpoint,
            "reason": "connection_key_rate_limited",
            "connection_key": mask_connection_key(normalized_key),
            "limit_per_minute": limit,
            "retry_after_seconds": retry_after_seconds,
        },
    )
    emit_mt5_reject_alert(
        "connection_key_rate_limited",
        endpoint=endpoint,
        severity="error",
        details={
            "connection_key": mask_connection_key(normalized_key),
            "limit_per_minute": limit,
            "retry_after_seconds": retry_after_seconds,
        },
    )
    response = connector_json_response(
        {
            "ok": False,
            "received": False,
            "disposition": "rejected",
            "reason": "connection_key_rate_limited",
            "error": "connection_key_rate_limited",
            "details": {
                "limit_per_minute": limit,
                "retry_after_seconds": retry_after_seconds,
            },
            "next_sync_after_seconds": max(retry_after_seconds, bandwidth_sync_interval_seconds()),
            "timestamp": now_iso(),
        },
        status_code=429,
    )
    response.headers["Retry-After"] = str(retry_after_seconds)
    return response


def sensitive_rate_limit_for_endpoint(endpoint: str) -> int:
    normalized_endpoint = endpoint.lower()
    if "billing/checkout" in normalized_endpoint:
        return _env_int("KMFX_RATE_LIMIT_BILLING_CHECKOUT_PER_MINUTE", default=10)
    if "billing/portal" in normalized_endpoint:
        return _env_int("KMFX_RATE_LIMIT_BILLING_PORTAL_PER_MINUTE", default=12)
    if "/api/admin/" in normalized_endpoint:
        return _env_int("KMFX_RATE_LIMIT_ADMIN_PER_MINUTE", default=120)
    if "regenerate-key" in normalized_endpoint or "revoke-key" in normalized_endpoint or endpoint.upper().startswith("DELETE "):
        return _env_int("KMFX_RATE_LIMIT_ACCOUNT_KEY_PER_MINUTE", default=10)
    if "accounts" in normalized_endpoint or "direct-mt5" in normalized_endpoint:
        return _env_int("KMFX_RATE_LIMIT_ACCOUNT_WRITE_PER_MINUTE", default=20)
    return _env_int("KMFX_RATE_LIMIT_SENSITIVE_PER_MINUTE", default=60)


def request_ip_identity(request: Request) -> str:
    cf_ip = safe_str(request.headers.get("cf-connecting-ip"))
    if cf_ip:
        return cf_ip
    forwarded_for = safe_str(request.headers.get("x-forwarded-for"))
    if forwarded_for:
        return safe_str(forwarded_for.split(",", 1)[0])
    return safe_str(getattr(request.client, "host", "") if request.client else "")


def sensitive_rate_limit_identity(request: Request, *, user_id: str = "", email: str = "") -> tuple[str, str]:
    normalized_user_id = safe_str(user_id).lower()
    if normalized_user_id:
        return "user", normalized_user_id
    normalized_email = safe_str(email).lower()
    if normalized_email:
        return "email", normalized_email
    client_ip = request_ip_identity(request)
    return "ip", client_ip or "unknown"


def prune_sensitive_rate_limit_buckets(now: float, *, max_buckets: int | None = None) -> None:
    resolved_max_buckets = max_buckets if max_buckets is not None else _env_int(
        "KMFX_RATE_LIMIT_SENSITIVE_MAX_BUCKETS",
        default=10000,
    )
    expired = [
        bucket_key
        for bucket_key, (window_start, _count) in SENSITIVE_RATE_LIMIT_BUCKETS.items()
        if now - window_start >= SENSITIVE_RATE_LIMIT_WINDOW_SECONDS
    ]
    for bucket_key in expired:
        SENSITIVE_RATE_LIMIT_BUCKETS.pop(bucket_key, None)

    if resolved_max_buckets <= 0 or len(SENSITIVE_RATE_LIMIT_BUCKETS) <= resolved_max_buckets:
        return

    overflow = len(SENSITIVE_RATE_LIMIT_BUCKETS) - resolved_max_buckets
    oldest_keys = sorted(
        SENSITIVE_RATE_LIMIT_BUCKETS,
        key=lambda bucket_key: SENSITIVE_RATE_LIMIT_BUCKETS[bucket_key][0],
    )[:overflow]
    for bucket_key in oldest_keys:
        SENSITIVE_RATE_LIMIT_BUCKETS.pop(bucket_key, None)


def sensitive_rate_limit_response(
    endpoint: str,
    request: Request,
    *,
    user_id: str = "",
    email: str = "",
    limit: int | None = None,
) -> JSONResponse | None:
    resolved_limit = sensitive_rate_limit_for_endpoint(endpoint) if limit is None else limit
    if resolved_limit <= 0:
        return None
    identity_kind, identity = sensitive_rate_limit_identity(request, user_id=user_id, email=email)
    now = time.time()
    prune_sensitive_rate_limit_buckets(now)
    identity_hash = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    bucket_key = f"{endpoint}:{identity_kind}:{identity_hash}"
    window_start, count = SENSITIVE_RATE_LIMIT_BUCKETS.get(bucket_key, (now, 0))
    if now - window_start >= SENSITIVE_RATE_LIMIT_WINDOW_SECONDS:
        window_start, count = now, 0
    count += 1
    SENSITIVE_RATE_LIMIT_BUCKETS[bucket_key] = (window_start, count)
    if count <= resolved_limit:
        return None
    retry_after_seconds = max(1, int(SENSITIVE_RATE_LIMIT_WINDOW_SECONDS - (now - window_start)))
    log.warning(
        "%s rejected | reason=sensitive_rate_limited identity=%s limit=%s retry_after=%s",
        endpoint,
        identity_kind,
        resolved_limit,
        retry_after_seconds,
    )
    response = connector_json_response(
        {
            "ok": False,
            "reason": "rate_limited",
            "error": "rate_limited",
            "details": {
                "limit_per_minute": resolved_limit,
                "retry_after_seconds": retry_after_seconds,
            },
            "timestamp": now_iso(),
        },
        status_code=429,
    )
    response.headers["Retry-After"] = str(retry_after_seconds)
    return response


def mt5_revoked_connection_key_response(endpoint: str, connection_key: str, *, sync_id: str = "", batch_id: str = "") -> JSONResponse:
    revoked_account = account_service.get_revoked_account_by_api_key_any_user(connection_key)
    payload: dict[str, Any] = {
        "ok": False,
        "received": False,
        "disposition": "rejected",
        "reason": "revoked_connection_key",
        "error": "revoked_connection_key",
        "details": {
            "field": "connection_key",
            "problem": "revoked",
            "connection_key": mask_connection_key(connection_key),
            "account_id": revoked_account.account_id if revoked_account else "",
        },
        "timestamp": now_iso(),
    }
    if sync_id:
        payload["sync_id"] = sync_id
    if batch_id:
        payload["batch_id"] = batch_id
    log.warning(
        "%s rejected | reason=revoked_connection_key account_id=%s key=%s",
        endpoint,
        payload["details"]["account_id"],
        mask_connection_key(connection_key),
    )
    emit_audit_event(
        "mt5_sync_rejected",
        user_id=revoked_account.user_id if revoked_account else "",
        account_id=revoked_account.account_id if revoked_account else "",
        status="rejected",
        details={
            "endpoint": endpoint,
            "reason": "revoked_connection_key",
            "connection_key": mask_connection_key(connection_key),
            "sync_id": sync_id,
            "batch_id": batch_id,
        },
    )
    emit_mt5_reject_alert(
        "revoked_connection_key",
        endpoint=endpoint,
        severity="error",
        user_id=revoked_account.user_id if revoked_account else "",
        account_id=revoked_account.account_id if revoked_account else "",
        details={
            "connection_key": mask_connection_key(connection_key),
            "sync_id": sync_id,
            "batch_id": batch_id,
        },
    )
    return connector_json_response(payload, status_code=401)


def find_account_by_id_any_user(account_id: str):
    normalized = safe_str(account_id)
    if not normalized:
        return None
    return next((account for account in account_service.store.list_accounts() if account.account_id == normalized), None)


def journal_trades_for_identity(identity_key: str) -> list[dict[str, Any]]:
    return list(JOURNAL_TRADES_BY_IDENTITY.get(identity_key) or [])


def merge_trade_sources(primary: list[dict[str, Any]], secondary: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in list(primary or []) + list(secondary or []):
        trade_id = safe_str(item.get("trade_id") or item.get("ticket") or item.get("position_id"))
        if trade_id and trade_id in seen:
            continue
        if trade_id:
            seen.add(trade_id)
        merged.append(item)
    return merged


def remember_journal_trades(identity_key: str, trades: list[dict[str, Any]]) -> None:
    existing = JOURNAL_TRADES_BY_IDENTITY.get(identity_key) or []
    by_trade_id: dict[str, dict[str, Any]] = {}
    for trade in existing + trades:
        trade_id = safe_str(trade.get("trade_id") or trade.get("ticket"))
        if trade_id:
            by_trade_id[trade_id] = trade
    ordered = sorted(by_trade_id.values(), key=lambda item: safe_timestamp(item.get("time")), reverse=True)
    JOURNAL_TRADES_BY_IDENTITY[identity_key] = ordered[:200]
    save_journal_trade_store(JOURNAL_TRADES_BY_IDENTITY)


def build_live_snapshot_entry(account: Any, *, source: str, summary_only: bool = False) -> dict[str, Any]:
    latest_payload = deepcopy(getattr(account, "latest_payload", {}) or {})
    dashboard_payload = compact_dashboard_payload_from_payload(latest_payload) if summary_only else latest_payload
    connection_key_preview = getattr(account, "connection_key_preview", "") or mask_connection_key(getattr(account, "api_key", ""))
    connection_key_hash = getattr(account, "connection_key_hash", "")
    return {
        "account_id": getattr(account, "account_id", ""),
        "user_id": getattr(account, "user_id", "local"),
        "alias": getattr(account, "alias", ""),
        "broker": getattr(account, "broker", ""),
        "platform": getattr(account, "platform", "mt5"),
        "login": getattr(account, "login", ""),
        "server": getattr(account, "server", ""),
        "connection_mode": getattr(account, "connection_mode", "connector"),
        "status": getattr(account, "status", "connected"),
        "api_key": "",
        "connection_key": "",
        "connection_key_preview": connection_key_preview,
        "connection_key_hash": connection_key_hash,
        "has_connection_key": bool(connection_key_hash or getattr(account, "api_key", "")),
        "last_sync_at": getattr(account, "last_sync_at", None).isoformat() if getattr(account, "last_sync_at", None) else "",
        "is_default": bool(getattr(account, "is_default", False) or getattr(account, "is_primary", False)),
        "is_primary": bool(getattr(account, "is_primary", False) or getattr(account, "is_default", False)),
        "lifecycle_status": getattr(account, "status", "connected"),
        "mt5_login": getattr(account, "mt5_login", "") or getattr(account, "login", ""),
        "first_sync_at": getattr(account, "first_sync_at", None).isoformat() if getattr(account, "first_sync_at", None) else "",
        "last_policy_at": getattr(account, "last_policy_at", None).isoformat() if getattr(account, "last_policy_at", None) else "",
        "last_error_code": getattr(account, "last_error_code", ""),
        "last_error_message": getattr(account, "last_error_message", ""),
        "connector_version": getattr(account, "connector_version", ""),
        "nickname": getattr(account, "nickname", "") or "",
        "display_name": getattr(account, "alias", "") or getattr(account, "nickname", "") or getattr(account, "login", "") or getattr(account, "account_id", ""),
        "dashboard_payload": dashboard_payload,
        "snapshot_payload_shape": "summary" if summary_only else "full",
        "source": source,
    }


def remember_live_account_snapshot(account: Any) -> None:
    entry = build_live_snapshot_entry(account, source="sync_memory")
    RECENT_LIVE_ACCOUNTS[entry["account_id"]] = entry
    clear_accounts_summary_snapshot_cache()
    log.info(
        "LIVE account cached | source=sync_memory account_id=%s login=%s broker=%s last_sync_at=%s",
        entry["account_id"],
        entry["login"],
        entry["broker"],
        entry["last_sync_at"],
    )


def forget_live_account_snapshot(account_id: str) -> None:
    normalized = safe_str(account_id)
    if not normalized:
        return
    RECENT_LIVE_ACCOUNTS.pop(normalized, None)
    clear_accounts_summary_snapshot_cache()


def build_registry_entry_for_account(account: Any, *, summary_only: bool = False) -> dict[str, Any]:
    latest_payload = deepcopy(getattr(account, "latest_payload", {}) or {})
    connection_key_preview = getattr(account, "connection_key_preview", "") or mask_connection_key(getattr(account, "api_key", ""))
    return {
        "account_id": getattr(account, "account_id", ""),
        "user_id": getattr(account, "user_id", "local"),
        "alias": getattr(account, "alias", "") or getattr(account, "nickname", "") or "",
        "platform": getattr(account, "platform", "mt5"),
        "connection_key": "",
        "connection_key_preview": connection_key_preview,
        "has_connection_key": bool(getattr(account, "connection_key_hash", "") or getattr(account, "api_key", "")),
        "status": getattr(account, "status", ""),
        "lifecycle_status": getattr(account, "status", ""),
        "broker": getattr(account, "broker", ""),
        "login": getattr(account, "login", ""),
        "mt5_login": getattr(account, "mt5_login", "") or getattr(account, "login", ""),
        "server": getattr(account, "server", ""),
        "last_sync_at": getattr(account, "last_sync_at", None).isoformat() if getattr(account, "last_sync_at", None) else "",
        "first_sync_at": getattr(account, "first_sync_at", None).isoformat() if getattr(account, "first_sync_at", None) else "",
        "last_policy_at": getattr(account, "last_policy_at", None).isoformat() if getattr(account, "last_policy_at", None) else "",
        "last_error_code": getattr(account, "last_error_code", ""),
        "last_error_message": getattr(account, "last_error_message", ""),
        "connector_version": getattr(account, "connector_version", ""),
        "archived_at": getattr(account, "archived_at", None).isoformat() if getattr(account, "archived_at", None) else "",
        "is_default": bool(getattr(account, "is_default", False) or getattr(account, "is_primary", False)),
        "is_primary": bool(getattr(account, "is_default", False) or getattr(account, "is_primary", False)),
        "created_at": getattr(account, "created_at", None).isoformat() if getattr(account, "created_at", None) else "",
        "updated_at": getattr(account, "updated_at", None).isoformat() if getattr(account, "updated_at", None) else "",
        "display_name": getattr(account, "alias", "") or getattr(account, "nickname", "") or getattr(account, "login", "") or getattr(account, "account_id", ""),
        "source": "admin_connection_key_bridge",
        "snapshot_payload_shape": "summary" if summary_only else "full",
        **account_summary_fields_from_payload(latest_payload),
    }


def merge_admin_launcher_registry_accounts(accounts: list[dict[str, Any]], allowed_connection_keys: set[str]) -> list[dict[str, Any]]:
    merged = list(accounts)
    seen_ids = {safe_str(account.get("account_id")) for account in merged if isinstance(account, dict)}
    for connection_key in allowed_connection_keys:
        account = resolve_account_by_connection_key(connection_key)
        if account is None or account.account_id in seen_ids:
            continue
        merged.append(build_registry_entry_for_account(account))
        seen_ids.add(account.account_id)
    return merged


def build_live_accounts_snapshot(
    user_id: str = "local",
    allowed_connection_keys: set[str] | None = None,
    *,
    summary_only: bool = False,
) -> dict[str, Any]:
    raw_allowed_connection_keys = {
        safe_str(connection_key)
        for connection_key in (allowed_connection_keys or set())
        if safe_str(connection_key)
    }
    allowed_connection_keys = {
        safe_str(connection_key).lower()
        for connection_key in raw_allowed_connection_keys
    }
    allowed_connection_key_hashes = {
        storage_connection_key_hash(connection_key)
        for connection_key in raw_allowed_connection_keys
    }
    persisted_snapshot = account_service.build_accounts_snapshot(user_id, summary_only=summary_only)
    merged_accounts: dict[str, dict[str, Any]] = {}

    for entry in persisted_snapshot.get("accounts") or []:
        if not isinstance(entry, dict):
            continue
        account_id = safe_str(entry.get("account_id"))
        if not account_id:
            continue
        merged_entry = deepcopy(entry)
        merged_entry["source"] = merged_entry.get("source") or "store"
        merged_accounts[account_id] = merged_entry

    for entry in account_service.build_accounts_registry(user_id, summary_only=summary_only):
        if not isinstance(entry, dict):
            continue
        account_id = safe_str(entry.get("account_id"))
        if not account_id or account_id in merged_accounts:
            continue
        if safe_str(entry.get("connection_mode")).lower() != "direct":
            continue
        pending_entry = deepcopy(entry)
        display_name = safe_str(
            pending_entry.get("display_name")
            or pending_entry.get("alias")
            or pending_entry.get("login")
            or "Cuenta MT5 directa"
        )
        pending_entry["source"] = "direct_registered_pending"
        pending_entry["is_default"] = bool(pending_entry.get("is_default") or pending_entry.get("is_primary"))
        pending_entry["dashboard_payload"] = {
            "payloadSource": "mt5_direct_pending",
            "data_status": "pending_direct_backend",
            "name": display_name,
            "accountName": display_name,
            "broker": pending_entry.get("broker") or "MT5",
            "server": pending_entry.get("server") or "",
            "login": pending_entry.get("login") or pending_entry.get("mt5_login") or "",
            "mode": "MT5 Directa",
            "tagline": "Cuenta directa registrada. Pendiente de motor backend para sincronizar datos live.",
            "trades": [],
            "positions": [],
            "history": [],
            "account": {
                "broker": pending_entry.get("broker") or "MT5",
                "server": pending_entry.get("server") or "",
                "login": pending_entry.get("login") or pending_entry.get("mt5_login") or "",
            },
        }
        merged_accounts[account_id] = pending_entry

    for connection_key in allowed_connection_keys:
        account = resolve_account_by_connection_key(connection_key)
        if account is None:
            continue
        entry = build_live_snapshot_entry(account, source="admin_connection_key_bridge", summary_only=summary_only)
        account_id = safe_str(entry.get("account_id"))
        if account_id:
            merged_accounts[account_id] = entry

    for account_id, entry in RECENT_LIVE_ACCOUNTS.items():
        entry_connection_key_hash = safe_str(entry.get("connection_key_hash"))
        if safe_str(entry.get("user_id"), "local") != user_id and entry_connection_key_hash not in allowed_connection_key_hashes:
            continue
        cached_last_sync = _parse_datetime(entry.get("last_sync_at"))
        persisted_last_sync = _parse_datetime((merged_accounts.get(account_id) or {}).get("last_sync_at"))
        if account_id not in merged_accounts or (cached_last_sync and (persisted_last_sync is None or cached_last_sync >= persisted_last_sync)):
            cached_entry = deepcopy(entry)
            if summary_only and isinstance(cached_entry.get("dashboard_payload"), dict):
                cached_entry["dashboard_payload"] = compact_dashboard_payload_from_payload(cached_entry.get("dashboard_payload"))
                cached_entry["snapshot_payload_shape"] = "summary"
            merged_accounts[account_id] = cached_entry

    accounts = list(merged_accounts.values())
    accounts.sort(key=lambda item: ((not bool(item.get("is_default"))), item.get("display_name", ""), item.get("login", "")))
    for item in accounts:
        if isinstance(item, dict):
            item.pop("connection_key_hash", None)
    active_account_id = next((item.get("account_id", "") for item in accounts if item.get("is_default")), "") or persisted_snapshot.get("active_account_id", "")
    log.info(
        "LIVE snapshot rebuilt | source=merged accounts=%s active_account_id=%s entries=%s",
        len(accounts),
        active_account_id,
        [
            {
                "account_id": item.get("account_id", ""),
                "login": item.get("login", ""),
                "source": item.get("source", ""),
            }
            for item in accounts
        ],
    )
    return {
        "accounts": accounts,
        "active_account_id": active_account_id,
        "portfolio_risk": aggregate_portfolio_risk(accounts),
        "snapshot_mode": "summary" if summary_only else "full",
        "updated_at": now_iso(),
    }


def find_scoped_account_entry(
    snapshot: dict[str, Any],
    account_id: str,
) -> dict[str, Any] | None:
    normalized = safe_str(account_id)
    if not normalized:
        return None
    for entry in snapshot.get("accounts") or []:
        if isinstance(entry, dict) and safe_str(entry.get("account_id")) == normalized:
            return entry
    return None


def build_ai_evidence_report_for_account_entry(
    account_entry: dict[str, Any],
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    dashboard_payload = account_entry.get("dashboard_payload") if isinstance(account_entry.get("dashboard_payload"), dict) else {}
    account = {
        "name": (
            dashboard_payload.get("name")
            or dashboard_payload.get("accountName")
            or account_entry.get("display_name")
            or account_entry.get("alias")
        ),
        "broker": dashboard_payload.get("broker") or account_entry.get("broker"),
        "server": dashboard_payload.get("server") or account_entry.get("server"),
        "login": dashboard_payload.get("login") or account_entry.get("login") or account_entry.get("mt5_login"),
        "currency": (
            dashboard_payload.get("currency")
            or ensure_dict(dashboard_payload.get("account")).get("currency")
            or "USD"
        ),
        "balance": dashboard_payload.get("balance"),
        "equity": dashboard_payload.get("equity"),
    }
    trades = dashboard_payload.get("trades") if isinstance(dashboard_payload.get("trades"), list) else []
    positions = dashboard_payload.get("positions") if isinstance(dashboard_payload.get("positions"), list) else []
    risk_snapshot = dashboard_payload.get("riskSnapshot") if isinstance(dashboard_payload.get("riskSnapshot"), dict) else {}
    journal_entries = dashboard_payload.get("journalEntries") if isinstance(dashboard_payload.get("journalEntries"), list) else []
    data_origin = {
        "account": safe_str(dashboard_payload.get("payloadSource") or dashboard_payload.get("mode"), "payload activo"),
        "history": f"{len(dashboard_payload.get('history') or [])} puntos historicos",
        "first_trade": safe_str((trades[0] if trades else {}).get("time") or (trades[0] if trades else {}).get("when") or (trades[0] if trades else {}).get("date")),
        "last_trade": safe_str((trades[-1] if trades else {}).get("time") or (trades[-1] if trades else {}).get("when") or (trades[-1] if trades else {}).get("date")),
    }
    report = build_ai_evidence_report(
        account=account,
        trades=trades,
        risk_snapshot=risk_snapshot,
        journal_entries=journal_entries,
        positions=positions,
        data_origin=data_origin,
        generated_at=generated_at or now_iso(),
    )
    return {
        "ok": True,
        "account_id": safe_str(account_entry.get("account_id")),
        "generated_at": report["pack"]["generated_at"],
        "report_type": report["report_type"],
        "schema_version": report["schema_version"],
        "pack": report["pack"],
        "markdown": report["markdown"],
        "json": report["json"],
    }


def build_backtest_vs_real_for_account_entry(
    account_entry: dict[str, Any],
    backtests: list[dict[str, Any]],
    *,
    starting_equity: float = 100_000.0,
    min_real_trades: int = 30,
    min_backtest_trades: int = 100,
) -> dict[str, Any]:
    dashboard_payload = account_entry.get("dashboard_payload") if isinstance(account_entry.get("dashboard_payload"), dict) else {}
    trades = dashboard_payload.get("trades") if isinstance(dashboard_payload.get("trades"), list) else []
    account_balance = safe_float(
        dashboard_payload.get("balance")
        or ensure_dict(dashboard_payload.get("account")).get("balance")
    )
    resolved_starting_equity = account_balance if account_balance > 0 else starting_equity
    report = build_backtest_vs_real_report(
        backtests=backtests,
        real_trades=trades,
        starting_equity=resolved_starting_equity,
        min_real_trades=min_real_trades,
        min_backtest_trades=min_backtest_trades,
    )
    return {
        "ok": True,
        "account_id": safe_str(account_entry.get("account_id")),
        "generated_at": now_iso(),
        "report": report,
    }


def resolve_sync_id(payload: dict[str, Any]) -> str:
    explicit_sync_id = safe_str(payload.get("sync_id"))
    if explicit_sync_id:
        return explicit_sync_id
    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()
    return payload_hash[:24]


def safe_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    try:
        return str(value).strip()
    except Exception:
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return default
    normalized = safe_str(value).lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def safe_int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_timestamp(value: Any) -> str:
    parsed = _parse_datetime(value)
    if parsed is not None:
        return parsed.isoformat().replace("+00:00", "Z")
    text = safe_str(value)
    return text or ""


def sorted_by_time(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda item: safe_timestamp(item.get("time")))


def normalize_login(payload: dict[str, Any]) -> str:
    account = payload.get("account")
    if isinstance(account, dict):
        login = account.get("login")
        text = safe_str(login)
        if text:
            return text
    top_level_login = payload.get("login")
    text = safe_str(top_level_login)
    if text:
        return text
    return ""


def ensure_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def ensure_list_of_dicts(value: Any, section: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    items: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []

    if value is None:
        return items, issues
    if not isinstance(value, list):
        issues.append(
            {
                "section": section,
                "field": section,
                "problem": "expected_list",
                "value_type": type(value).__name__,
            }
        )
        return items, issues

    for index, item in enumerate(value):
        if isinstance(item, dict):
            items.append(item)
        else:
            issues.append(
                {
                    "section": section,
                    "field": f"{section}[{index}]",
                    "problem": "expected_object",
                    "value_type": type(item).__name__,
                }
            )

    return items, issues


def sanitize_account(raw_account: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    account = ensure_dict(raw_account)
    issues: list[dict[str, Any]] = []

    if not account:
        issues.append(
            {
                "section": "account",
                "field": "account",
                "problem": "missing_or_invalid",
                "value_type": type(raw_account).__name__,
            }
        )

    sanitized = {
        "login": safe_str(account.get("login")),
        "name": safe_str(account.get("name")),
        "broker": safe_str(account.get("broker")),
        "server": safe_str(account.get("server")),
        "currency": safe_str(account.get("currency") or "USD"),
        "balance": safe_float(account.get("balance")),
        "equity": safe_float(account.get("equity")),
        "margin": safe_float(account.get("margin")),
        "free_margin": safe_float(account.get("free_margin")),
        "profit": safe_float(account.get("profit")),
        "leverage": safe_str(account.get("leverage")),
        "timestamp": safe_timestamp(account.get("timestamp")),
    }

    if not sanitized["login"]:
        issues.append(
            {
                "section": "account",
                "field": "account.login",
                "problem": "missing_required",
                "value_type": type(account.get("login")).__name__,
            }
        )

    return sanitized, issues


def sanitize_positions(raw_positions: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    positions, issues = ensure_list_of_dicts(raw_positions, "positions")
    sanitized: list[dict[str, Any]] = []

    for index, position in enumerate(positions):
        stop_loss = safe_float(position.get("sl"))
        explicit_risk_state = safe_str(position.get("risk_state") or position.get("riskState")).lower()
        risk_calculable = safe_bool(position.get("risk_calculable"), default=True)
        raw_risk_amount = safe_float_or_none(position.get("risk_amount"))
        raw_risk_pct = safe_float_or_none(position.get("risk_pct"))
        if explicit_risk_state in {"missing_stop_loss", "unbounded", "not_calculable"}:
            risk_calculable = False
        if stop_loss <= 0 and (raw_risk_amount is None or raw_risk_amount <= 0) and (raw_risk_pct is None or raw_risk_pct <= 0):
            risk_calculable = False
        risk_state = explicit_risk_state or ("bounded_by_stop_loss" if risk_calculable else "missing_stop_loss")
        risk_amount = raw_risk_amount if risk_calculable else None
        risk_pct = raw_risk_pct if risk_calculable else None
        profit = safe_float(position.get("profit"))
        swap = safe_float(position.get("swap"))
        floating_raw = position.get("floating_pnl")
        if floating_raw in (None, ""):
            floating_raw = position.get("floatingPnl")
        floating_pnl = safe_float(floating_raw, profit + swap)
        sanitized.append(
            {
                "position_id": safe_str(position.get("position_id")),
                "ticket": safe_str(position.get("ticket")),
                "symbol": safe_str(position.get("symbol")),
                "type": safe_str(position.get("type")),
                "volume": safe_float(position.get("volume")),
                "price_open": safe_float(position.get("price_open")),
                "price_current": safe_float(position.get("price_current")),
                "sl": stop_loss,
                "tp": safe_float(position.get("tp")),
                "profit": profit,
                "swap": swap,
                "floating_pnl": floating_pnl,
                "risk_amount": risk_amount,
                "risk_pct": risk_pct,
                "risk_state": risk_state,
                "risk_calculable": risk_calculable,
                "strategy_tag": safe_str(position.get("strategy_tag")),
                "time": safe_timestamp(position.get("time")),
                "time_unix": safe_int_or_none(position.get("time_unix")),
            }
        )
        if not safe_str(position.get("symbol")):
            issues.append(
                {
                    "section": "positions",
                    "field": f"positions[{index}].symbol",
                    "problem": "missing_optional_render_field",
                    "value_type": type(position.get("symbol")).__name__,
                }
            )

    return sanitized, issues


def resolve_trade_cost_component(trade: dict[str, Any], total_key: str, component_keys: tuple[str, ...]) -> float:
    """Prefer the total cost when present, but recover entry/close-only broker costs."""
    total = safe_float_or_none(trade.get(total_key))
    component_values = [safe_float_or_none(trade.get(key)) for key in component_keys]
    present_components = [value for value in component_values if value is not None]
    component_total = sum(present_components)

    if present_components and (total is None or (total == 0 and component_total != 0)):
        return component_total
    return total if total is not None else 0.0


def sanitize_trades(raw_trades: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    trades, issues = ensure_list_of_dicts(raw_trades, "trades")
    sanitized: list[dict[str, Any]] = []

    for index, trade in enumerate(trades):
        profit = safe_float(trade.get("profit"))
        commission = resolve_trade_cost_component(trade, "commission", ("entry_commission", "close_commission"))
        swap = resolve_trade_cost_component(trade, "swap", ("entry_swap", "close_swap"))
        explicit_net = trade.get("net")
        net = safe_float(explicit_net) if explicit_net not in (None, "") else round(profit + commission + swap, 2)
        sanitized.append(
            {
                "trade_id": safe_str(trade.get("trade_id") or trade.get("ticket")),
                "ticket": safe_str(trade.get("ticket")),
                "deal_id": safe_str(trade.get("deal_id") or trade.get("dealId") or trade.get("ticket")),
                "order_id": safe_str(trade.get("order_id") or trade.get("orderId")),
                "position_id": safe_str(trade.get("position_id")),
                "symbol": safe_str(trade.get("symbol")),
                "type": safe_str(trade.get("type")),
                "direction": safe_str(trade.get("direction") or ""),
                "volume": safe_float(trade.get("volume")),
                "price": safe_float(trade.get("price")),
                "open_price": safe_float(trade.get("open_price")),
                "open_time": safe_str(trade.get("open_time") or ""),
                "open_time_unix": safe_int_or_none(trade.get("open_time_unix")),
                "sl": safe_float(trade.get("sl")),
                "tp": safe_float(trade.get("tp")),
                "profit": profit,
                "commission": commission,
                "close_commission": safe_float(trade.get("close_commission")),
                "entry_commission": safe_float(trade.get("entry_commission")),
                "swap": swap,
                "close_swap": safe_float(trade.get("close_swap")),
                "entry_swap": safe_float(trade.get("entry_swap")),
                "net": round(net, 2),
                "comment": safe_str(trade.get("comment")),
                "strategy_tag": safe_str(trade.get("strategy_tag") or ""),
                "time": safe_timestamp(trade.get("time")),
                "time_unix": safe_int_or_none(trade.get("time_unix")),
            }
        )
        if not safe_str(trade.get("time")):
            issues.append(
                {
                    "section": "trades",
                    "field": f"trades[{index}].time",
                    "problem": "missing_optional_render_field",
                    "value_type": type(trade.get("time")).__name__,
                }
            )

    return sanitized, issues


def sanitize_symbol_specs(raw_specs: Any, account_currency: str = "") -> dict[str, dict[str, Any]]:
    """Normalize optional MT5 symbol specs without requiring old connectors to send them."""
    if not raw_specs:
        return {}

    items: list[tuple[str, Any]] = []
    if isinstance(raw_specs, dict):
        for key, value in raw_specs.items():
            items.append((safe_str(key), value))
    elif isinstance(raw_specs, list):
        for value in raw_specs:
            items.append(("", value))
    else:
        return {}

    specs: dict[str, dict[str, Any]] = {}
    for fallback_symbol, raw in items[:80]:
        if not isinstance(raw, dict):
            continue
        symbol = safe_str(raw.get("symbol") or raw.get("name") or raw.get("instrument") or fallback_symbol)
        if not symbol:
            continue

        point = safe_float(raw.get("point") or raw.get("SYMBOL_POINT"))
        tick_size = safe_float(raw.get("tickSize") or raw.get("tick_size") or raw.get("tradeTickSize") or raw.get("trade_tick_size") or raw.get("SYMBOL_TRADE_TICK_SIZE"))
        tick_value = safe_float(raw.get("tickValue") or raw.get("tick_value") or raw.get("tradeTickValue") or raw.get("trade_tick_value") or raw.get("SYMBOL_TRADE_TICK_VALUE"))
        tick_value_profit = safe_float(raw.get("tickValueProfit") or raw.get("tick_value_profit") or raw.get("SYMBOL_TRADE_TICK_VALUE_PROFIT"))
        tick_value_loss = safe_float(raw.get("tickValueLoss") or raw.get("tick_value_loss") or raw.get("SYMBOL_TRADE_TICK_VALUE_LOSS"))

        specs[symbol] = {
            "symbol": symbol,
            "digits": safe_int_or_none(raw.get("digits") or raw.get("SYMBOL_DIGITS")) or 0,
            "point": point,
            "tickSize": tick_size or point,
            "tickValue": tick_value,
            "tickValueProfit": tick_value_profit,
            "tickValueLoss": tick_value_loss,
            "contractSize": safe_float(raw.get("contractSize") or raw.get("contract_size") or raw.get("tradeContractSize") or raw.get("SYMBOL_TRADE_CONTRACT_SIZE")),
            "volumeMin": safe_float(raw.get("volumeMin") or raw.get("volume_min") or raw.get("SYMBOL_VOLUME_MIN")),
            "volumeMax": safe_float(raw.get("volumeMax") or raw.get("volume_max") or raw.get("SYMBOL_VOLUME_MAX")),
            "volumeStep": safe_float(raw.get("volumeStep") or raw.get("volume_step") or raw.get("SYMBOL_VOLUME_STEP")),
            "currencyProfit": safe_str(raw.get("currencyProfit") or raw.get("currency_profit") or raw.get("SYMBOL_CURRENCY_PROFIT")),
            "currencyMargin": safe_str(raw.get("currencyMargin") or raw.get("currency_margin") or raw.get("SYMBOL_CURRENCY_MARGIN")),
            "tradeCalcMode": safe_str(raw.get("tradeCalcMode") or raw.get("trade_calc_mode") or raw.get("SYMBOL_TRADE_CALC_MODE")),
            "spread": safe_float(raw.get("spread") or raw.get("SYMBOL_SPREAD")),
            "accountCurrency": safe_str(raw.get("accountCurrency") or raw.get("account_currency") or account_currency),
        }

    return specs


def first_configured_policy_value(source: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = source.get(key)
        if value is not None and value != "":
            return value
    return None


def extract_account_policy_config(*sources: Any) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key in ("configured_policy", "account_policy", "risk_policy", "riskPolicy", "policy", "riskProfile"):
            value = source.get(key)
            if isinstance(value, dict):
                candidates.append(value)
        candidates.append(source)

    config: dict[str, Any] = {}
    source_label = "account"
    for candidate in candidates:
        candidate_source = safe_str(candidate.get("policy_source") or candidate.get("source")).lower()
        if candidate_source in {"funding", "account", "user", "backend_config", "policy", "configured"}:
            source_label = candidate_source

        risk_per_trade = first_configured_policy_value(
            candidate,
            "max_risk_per_trade_pct",
            "risk_per_trade_pct",
            "maxTradeRiskPct",
            "defaultRisk",
        )
        daily_dd = first_configured_policy_value(
            candidate,
            "daily_dd_hard_stop",
            "daily_dd_limit_pct",
            "dailyLossLimitPct",
        )
        max_dd = first_configured_policy_value(
            candidate,
            "total_dd_hard_stop",
            "max_dd_limit_pct",
            "maxDdLimitPct",
            "weeklyHeatLimitPct",
        )
        heat = first_configured_policy_value(
            candidate,
            "portfolio_heat_limit_pct",
            "portfolioHeatLimitPct",
            "max_total_open_risk_pct",
        )

        if risk_per_trade is not None:
            config["max_risk_per_trade_pct"] = safe_float(risk_per_trade)
            config["max_risk_per_trade_pct_source"] = source_label
        if daily_dd is not None:
            config["daily_dd_hard_stop"] = safe_float(daily_dd)
            config["daily_dd_hard_stop_source"] = source_label
        if max_dd is not None:
            config["total_dd_hard_stop"] = safe_float(max_dd)
            config["total_dd_hard_stop_source"] = source_label
        if heat is not None:
            config["portfolio_heat_limit_pct"] = safe_float(heat)
            config["portfolio_heat_limit_pct_source"] = source_label

        max_volume = first_configured_policy_value(candidate, "max_volume", "maxVolume")
        if max_volume is not None:
            config["max_volume"] = safe_float(max_volume)
        for list_key, raw_keys in (
            ("allowed_sessions", ("allowed_sessions", "allowedSessions")),
            ("allowed_symbols", ("allowed_symbols", "allowedSymbols")),
        ):
            value = first_configured_policy_value(candidate, *raw_keys)
            if isinstance(value, list):
                config[list_key] = [safe_str(item) for item in value if safe_str(item)]

        funding_rule = first_configured_policy_value(candidate, "funding_rule", "funding_rule_id", "fundingRule")
        if funding_rule is not None:
            config["funding_rule"] = safe_str(funding_rule)

    if config:
        config["policy_source"] = source_label
    return config


def build_policy(login: str, account_policy: dict[str, Any] | None = None) -> dict[str, Any]:
    policy = {
        "enforcement_mode": "SAFE_MODE",
        "panic_lock_active": False,
        "panic_lock_expires_at": "",
        "close_all_required": False,
        "auto_block": True,
        "allowed_symbols": ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "US30"],
        "allowed_sessions": ["London", "New York"],
        "max_risk_per_trade_pct": 0.50,
        "portfolio_heat_limit_pct": "",
        "max_volume": 1.00,
        "current_level": "BASE",
        "recommended_level": "BASE",
        "daily_dd_hard_stop": 1.20,
        "total_dd_hard_stop": 8.00,
        "trading_timezone": os.getenv("KMFX_TRADING_TIMEZONE", "Europe/Andorra"),
        "policy_source": "reference_default",
        "policy_source_label": "Referencia KMFX no configurada",
        "policy_sources": {
            "max_risk_per_trade_pct": "reference_default",
            "daily_dd_hard_stop": "reference_default",
            "total_dd_hard_stop": "reference_default",
            "portfolio_heat_limit_pct": "inferred_from_current_level",
        },
        "configured_policy": {},
        "reference_assumption": {
            "max_risk_per_trade_pct": 0.50,
            "daily_dd_hard_stop": 1.20,
            "total_dd_hard_stop": 8.00,
            "portfolio_heat_limit_pct": "level_reference",
        },
    }

    configured_policy = account_policy if isinstance(account_policy, dict) else {}
    if configured_policy:
        policy_source = safe_str(configured_policy.get("policy_source"), "account")
        policy["policy_source"] = policy_source
        policy["policy_source_label"] = "Politica configurada por cuenta"
        for key in (
            "max_risk_per_trade_pct",
            "daily_dd_hard_stop",
            "total_dd_hard_stop",
            "portfolio_heat_limit_pct",
            "max_volume",
        ):
            if key in configured_policy:
                policy[key] = configured_policy[key]
        if "allowed_sessions" in configured_policy:
            policy["allowed_sessions"] = configured_policy["allowed_sessions"]
        if "allowed_symbols" in configured_policy:
            policy["allowed_symbols"] = configured_policy["allowed_symbols"]
        if "funding_rule" in configured_policy:
            policy["funding_rule"] = configured_policy["funding_rule"]
        policy["configured_policy"] = {
            key: value
            for key, value in configured_policy.items()
            if key not in {"policy_source"}
        }
        policy["policy_sources"] = {
            **policy["policy_sources"],
            "max_risk_per_trade_pct": safe_str(configured_policy.get("max_risk_per_trade_pct_source"), policy_source),
            "daily_dd_hard_stop": safe_str(configured_policy.get("daily_dd_hard_stop_source"), policy_source),
            "total_dd_hard_stop": safe_str(configured_policy.get("total_dd_hard_stop_source"), policy_source),
            "portfolio_heat_limit_pct": safe_str(configured_policy.get("portfolio_heat_limit_pct_source"), policy_source),
        }

    last_sync = LAST_SYNC_BY_LOGIN.get(login)
    if last_sync:
        connector_mode = safe_str(last_sync.get("mode"))
        if connector_mode:
            policy["enforcement_mode"] = connector_mode

    policy_hash_source = json.dumps(policy, sort_keys=True, ensure_ascii=True).encode("utf-8")
    policy["policy_hash"] = hashlib.sha256(policy_hash_source).hexdigest()[:16]
    return policy


def build_connector_policy_response(login: str, account_state: dict[str, Any] | None = None) -> dict[str, Any]:
    state = account_state if isinstance(account_state, dict) else {}
    account_policy = extract_account_policy_config(state)
    policy = build_policy(login, account_policy)
    return {
        **policy,
        "risk_status": "active_monitoring",
        "blocking_rule": "",
        "action_required": "Opera dentro de la política activa y respeta los límites locales.",
        "reason_code": "OK",
        "severity": "info",
        "equity_peak": safe_float(state.get("equity_peak")),
        "daily_start_equity": safe_float(state.get("daily_start_equity")),
        "daily_start_day_key": safe_str(state.get("daily_start_day_key")),
        "peak_source": "backend_persisted",
        **bandwidth_policy_payload(),
    }


def load_persisted_account_state(connection_key: str, identity_key: str = "", bound_account: Any = None) -> dict[str, Any]:
    if bound_account is not None and isinstance(getattr(bound_account, "latest_payload", None), dict):
        return deepcopy(bound_account.latest_payload or {})

    normalized_connection_key = safe_str(connection_key)
    if normalized_connection_key:
        account = resolve_account_by_connection_key(normalized_connection_key)
        if account and isinstance(account.latest_payload, dict):
            return deepcopy(account.latest_payload or {})

    normalized_identity = safe_str(identity_key)
    if normalized_identity:
        last_sync = LAST_SYNC_BY_LOGIN.get(normalized_identity) or {}
        raw_payload = last_sync.get("raw") if isinstance(last_sync, dict) else None
        if isinstance(raw_payload, dict):
            return deepcopy(raw_payload)

    return {}


def resolve_persisted_equity_state(
    *,
    payload: dict[str, Any],
    account: dict[str, Any],
    stored_payload: dict[str, Any] | None,
) -> dict[str, float | str]:
    stored = stored_payload if isinstance(stored_payload, dict) else {}
    account_equity = safe_float(account.get("equity"))
    incoming_equity_peak = safe_float(payload.get("equity_peak"), account_equity)
    stored_equity_peak = safe_float(stored.get("equity_peak"))
    resolved_peak = max(stored_equity_peak, incoming_equity_peak, account_equity)

    incoming_day_key = safe_str(payload.get("daily_start_day_key"))
    incoming_daily_start = safe_float(payload.get("daily_start_equity"))
    stored_day_key = safe_str(stored.get("daily_start_day_key"))
    stored_daily_start = safe_float(stored.get("daily_start_equity"))
    if incoming_day_key == stored_day_key and stored_day_key:
        daily_start_equity = stored_daily_start if stored_daily_start > 0 else incoming_daily_start
        daily_start_day_key = stored_day_key
    else:
        daily_start_equity = incoming_daily_start
        daily_start_day_key = incoming_day_key

    return {
        "equity_peak": resolved_peak,
        "daily_start_equity": daily_start_equity,
        "daily_start_day_key": daily_start_day_key,
        "last_sync_at": now_iso(),
    }


def trade_profit_components(trade: dict[str, Any]) -> dict[str, float]:
    profit = safe_float(trade.get("profit"))
    commission = resolve_trade_cost_component(trade, "commission", ("entry_commission", "close_commission"))
    swap = resolve_trade_cost_component(trade, "swap", ("entry_swap", "close_swap"))
    dividend = safe_float(trade.get("dividend"))
    net = profit + commission + swap + dividend
    return {
        "profit": profit,
        "commission": commission,
        "swap": swap,
        "dividend": dividend,
        "net": net,
    }


def calculate_max_drawdown_pct(history: list[dict[str, Any]], starting_balance: float, trades: list[dict[str, Any]]) -> float:
    points: list[float] = []
    for point in history:
        numeric = safe_float(point.get("value"))
        if numeric > 0:
            points.append(numeric)

    if not points:
        running_balance = starting_balance
        points.append(running_balance)
        for trade in trades:
            running_balance += trade_profit_components(trade)["net"]
            if running_balance > 0:
                points.append(running_balance)

    if not points:
        return 0.0

    peak = points[0]
    max_drawdown_pct = 0.0
    for value in points:
        peak = max(peak, value)
        if peak <= 0:
            continue
        drawdown_pct = ((peak - value) / peak) * 100.0
        max_drawdown_pct = max(max_drawdown_pct, drawdown_pct)
    return max_drawdown_pct


def build_report_metrics(account: dict[str, Any], trades: list[dict[str, Any]], history: list[dict[str, Any]]) -> dict[str, Any]:
    balance = safe_float(account.get("balance"))
    equity = safe_float(account.get("equity"), balance)
    components = [trade_profit_components(trade) for trade in trades]

    gross_profit = sum(max(item["profit"], 0.0) for item in components)
    gross_loss_abs = sum(abs(min(item["profit"], 0.0)) for item in components)
    gross_loss = -gross_loss_abs
    net_gross_profit = sum(max(item["net"], 0.0) for item in components)
    net_gross_loss_abs = sum(abs(min(item["net"], 0.0)) for item in components)
    net_gross_loss = -net_gross_loss_abs
    commissions = sum(item["commission"] for item in components)
    swaps = sum(item["swap"] for item in components)
    dividends = sum(item["dividend"] for item in components)
    net_profit = sum(item["net"] for item in components)
    win_trades = sum(1 for item in components if item["net"] > 0)
    loss_trades = sum(1 for item in components if item["net"] < 0)
    total_trades = len(components)
    win_rate = (win_trades / total_trades * 100.0) if total_trades else 0.0
    gross_profit_factor = (gross_profit / gross_loss_abs) if gross_loss_abs > 0 else (9999.0 if gross_profit > 0 else 0.0)
    net_profit_factor = (
        (net_gross_profit / net_gross_loss_abs)
        if net_gross_loss_abs > 0
        else (9999.0 if net_gross_profit > 0 else 0.0)
    )

    best_trade = max((item["net"] for item in components), default=0.0)
    worst_trade = min((item["net"] for item in components), default=0.0)

    max_consecutive_wins = 0
    max_consecutive_losses = 0
    current_wins = 0
    current_losses = 0
    max_consecutive_profit = 0.0
    max_consecutive_loss = 0.0
    running_win_profit = 0.0
    running_loss_profit = 0.0

    for item in components:
        net = item["net"]
        if net > 0:
            current_wins += 1
            current_losses = 0
            running_win_profit += net
            running_loss_profit = 0.0
            max_consecutive_wins = max(max_consecutive_wins, current_wins)
            max_consecutive_profit = max(max_consecutive_profit, running_win_profit)
        elif net < 0:
            current_losses += 1
            current_wins = 0
            running_loss_profit += net
            running_win_profit = 0.0
            max_consecutive_losses = max(max_consecutive_losses, current_losses)
            max_consecutive_loss = min(max_consecutive_loss, running_loss_profit)
        else:
            current_wins = 0
            current_losses = 0
            running_win_profit = 0.0
            running_loss_profit = 0.0

    long_count = 0
    short_count = 0
    for trade in trades:
        trade_type = safe_str(trade.get("type") or trade.get("side")).upper()
        if any(token in trade_type for token in ("SELL", "SHORT")):
            short_count += 1
        else:
            long_count += 1

    robot_count = sum(1 for trade in trades if safe_str(trade.get("strategy_tag")).strip())
    signal_count = 0
    manual_count = max(total_trades - robot_count - signal_count, 0)

    first_close = None
    last_close = None
    hold_minutes: list[float] = []
    for trade in trades:
        close_raw = trade.get("close_time") or trade.get("time")
        open_raw = trade.get("open_time")
        close_time = safe_timestamp(close_raw)
        open_time = safe_timestamp(open_raw)
        if close_time:
            first_close = close_time if not first_close or close_time < first_close else first_close
            last_close = close_time if not last_close or close_time > last_close else last_close
        if close_time and open_time:
            open_dt = _parse_datetime(open_raw)
            close_dt = _parse_datetime(close_raw)
            if open_dt is not None and close_dt is not None:
                hold_minutes.append(max((close_dt - open_dt).total_seconds() / 60.0, 0.0))

    trades_per_week = 0.0
    if first_close and last_close and total_trades:
        first_dt = _parse_datetime(first_close)
        last_dt = _parse_datetime(last_close)
        if first_dt is not None and last_dt is not None:
            span_days = max((last_dt - first_dt).total_seconds() / 86400.0, 1.0)
            trades_per_week = total_trades / (span_days / 7.0)

    average_hold_minutes = (sum(hold_minutes) / len(hold_minutes)) if hold_minutes else 0.0
    starting_balance = balance - net_profit
    growth_pct = ((net_profit / starting_balance) * 100.0) if starting_balance > 0 else 0.0
    drawdown_pct = calculate_max_drawdown_pct(history, starting_balance if starting_balance > 0 else balance, trades)
    recovery_factor = (net_profit / drawdown_pct) if drawdown_pct > 0 else 0.0

    return {
        "balance": balance,
        "equity": equity,
        "grossProfit": gross_profit,
        "grossLoss": gross_loss,
        "netGrossProfit": net_gross_profit,
        "netGrossLoss": net_gross_loss,
        "netProfit": net_profit,
        "winRate": win_rate,
        "totalTrades": total_trades,
        "winTrades": win_trades,
        "lossTrades": loss_trades,
        "profitFactor": net_profit_factor,
        "grossProfitFactor": gross_profit_factor,
        "netProfitFactor": net_profit_factor,
        "profitFactorBasis": "net",
        "drawdownPct": drawdown_pct,
        "commissions": commissions,
        "swaps": swaps,
        "dividends": dividends,
        "bestTrade": best_trade,
        "worstTrade": worst_trade,
        "maxConsecutiveWins": max_consecutive_wins,
        "maxConsecutiveLosses": max_consecutive_losses,
        "maxConsecutiveProfit": max_consecutive_profit,
        "maxConsecutiveLoss": max_consecutive_loss,
        "tradesPerWeek": trades_per_week,
        "averageHoldMinutes": average_hold_minutes,
        "longCount": long_count,
        "shortCount": short_count,
        "manualCount": manual_count,
        "robotCount": robot_count,
        "signalCount": signal_count,
        "growthPct": growth_pct,
        "source": "backend_mt5_report_metrics",
    }


def build_dashboard_account_payload(
    account: dict[str, Any],
    positions: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    raw_payload: dict[str, Any],
    previous_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    account = dict(account)
    previous_payload = ensure_dict(previous_payload)
    metric_recovery_warnings: list[str] = []
    previous_account = ensure_dict(previous_payload.get("account"))

    def recover_positive_metric(field: str) -> float:
        current = safe_float(account.get(field))
        if current > 0:
            return current
        previous = safe_float(previous_payload.get(field))
        if previous <= 0:
            previous = safe_float(previous_account.get(field))
        if previous > 0:
            metric_recovery_warnings.append(f"{field}_preserved_from_previous_snapshot")
            return previous
        return current

    account["balance"] = recover_positive_metric("balance")
    account["equity"] = recover_positive_metric("equity")

    def build_risk_rules() -> list[dict[str, Any]]:
        breaches = policy_evaluation.get("breaches") if isinstance(policy_evaluation.get("breaches"), list) else []
        warnings = policy_evaluation.get("warnings") if isinstance(policy_evaluation.get("warnings"), list) else []
        candidates = breaches or warnings
        tone = "danger" if breaches else "warn" if warnings else "ok"
        dominant_metric = candidates[0].get("metric") if candidates else ""

        rules: list[dict[str, Any]] = []
        for metric_key, fallback_title in (
            ("max_drawdown", "DD pico a equity"),
            ("daily_drawdown", "DD diario"),
            ("portfolio_heat", "Heat abierto"),
            ("risk_per_trade", "Riesgo por operación"),
        ):
            limit_status = policy_evaluation["limits_status"].get(metric_key, {})
            matching_alert = next((item for item in candidates if item.get("metric") == metric_key), None)
            state = limit_status.get("state") or ("breach" if breaches else "warning" if warnings else "ok")
            current_pct = safe_float(limit_status.get("current_pct"))
            limit_pct = safe_float(limit_status.get("limit_pct"))
            distance_pct = limit_status.get("distance_to_limit_pct")
            usage_ratio_pct = limit_status.get("usage_ratio_pct")
            is_configured = bool(limit_status.get("is_configured"))

            if matching_alert:
                condition = matching_alert.get("message") or matching_alert.get("label") or fallback_title
                current_label = f"{safe_float(matching_alert.get('current')):.2f}%"
                limit_label = f"{safe_float(matching_alert.get('limit')):.2f}%"
                impact = f"{current_label} sobre límite {limit_label}"
            elif not is_configured:
                condition = f"{fallback_title} sin política configurada"
                impact = f"lectura actual {current_pct:.2f}% · referencia no vinculante"
            elif state == "ok":
                condition = f"{fallback_title} dentro de límite"
                if limit_pct > 0:
                    impact = f"{current_pct:.2f}% sobre límite {limit_pct:.2f}%"
                else:
                    impact = f"{current_pct:.2f}% sin límite configurado"
            else:
                condition = fallback_title
                impact = f"{current_pct:.2f}%"

            if state == "breach":
                state_label = "breach"
                tone_label = "danger"
            elif state == "warning":
                state_label = "warning"
                tone_label = "warn"
            else:
                state_label = "ok"
                tone_label = "ok"

            if is_configured and distance_pct is not None and state_label == "ok":
                impact = f"margen {safe_float(distance_pct):.2f}% restante"
            elif usage_ratio_pct is not None and state_label != "ok":
                impact = f"uso {safe_float(usage_ratio_pct):.2f}% del límite"

            rules.append(
                {
                    "title": matching_alert.get("label") if matching_alert else fallback_title,
                    "description": status_snapshot["action_required"],
                    "value": f"{current_pct:.2f}%",
                    "condition": condition,
                    "state": state_label,
                    "impact": impact,
                    "tone": tone_label if metric_key == dominant_metric or state_label != "ok" else "ok",
                    "isDominant": metric_key == dominant_metric,
                }
            )
        return rules

    trade_components = [trade_profit_components(trade) for trade in trades]
    closed_pnl = sum(item["net"] for item in trade_components)
    winning_trades = sum(
        1
        for item in trade_components
        if item["net"] > 0
    )
    win_rate = (winning_trades / len(trades) * 100.0) if trades else 0.0
    history = raw_payload.get("history") if isinstance(raw_payload.get("history"), list) else []
    symbol_specs = sanitize_symbol_specs(
        raw_payload.get("symbolSpecs") or raw_payload.get("symbol_specs"),
        safe_str(account.get("currency") or "USD"),
    )
    report_metrics = build_report_metrics(account, trades, history)
    account_policy = extract_account_policy_config(previous_payload, raw_payload)
    raw_policy = build_policy(safe_str(account.get("login")), account_policy)
    policy_snapshot, policy_warnings = build_policy_snapshot(raw_policy)
    previous_snapshot = extract_previous_risk_snapshot(previous_payload)
    metrics_snapshot = build_risk_metrics(
        account=account,
        positions=positions,
        trades=trades,
        policy_snapshot=policy_snapshot,
        previous_snapshot=previous_snapshot,
        trading_timezone=safe_str(raw_policy.get("trading_timezone"), "UTC"),
    )
    policy_evaluation = evaluate_risk_policy(metrics_snapshot, policy_snapshot)
    status_snapshot = build_risk_status(policy_evaluation, policy_snapshot)
    summary = {
        **metrics_snapshot["summary"],
        "max_drawdown_limit_pct": policy_snapshot["max_dd_limit_pct"],
        "distance_to_max_dd_limit_pct": policy_evaluation["limits_status"]["max_drawdown"]["distance_to_limit_pct"],
        "portfolio_heat_limit_pct": policy_snapshot["portfolio_heat_limit_pct"],
        "distance_to_heat_limit_pct": policy_evaluation["limits_status"]["portfolio_heat"]["distance_to_limit_pct"],
        "heat_usage_ratio_pct": policy_evaluation["limits_status"]["portfolio_heat"]["usage_ratio_pct"],
        "max_risk_per_trade_pct": policy_snapshot["risk_per_trade_pct"],
        "distance_to_daily_dd_limit_pct": policy_evaluation["limits_status"]["daily_drawdown"]["distance_to_limit_pct"],
    }
    risk_snapshot = {
        "summary": summary,
        "policy": policy_snapshot,
        "policy_evaluation": policy_evaluation,
        "status": status_snapshot,
        "symbol_exposure": metrics_snapshot["symbol_exposure"],
        "open_trade_risks": metrics_snapshot["open_trade_risks"],
        "professional_metrics": metrics_snapshot.get("professional_metrics", {}),
        "metadata": {
            **metrics_snapshot["metadata"],
            "snapshot_version": "3.0.0",
            "calculation_mode": "sync -> metrics -> policy -> enforcement -> snapshot",
            "warnings": list(metrics_snapshot["metadata"].get("warnings") or []) + policy_warnings,
        },
    }
    payload = {
        "accountName": account.get("name") or account.get("broker") or "MT5 Account",
        "name": account.get("name") or account.get("broker") or "MT5 Account",
        "broker": account.get("broker") or "MT5",
        "server": account.get("server") or "",
        "environment": "live",
        "platform": "mt5",
        "mode": safe_str(raw_payload.get("mode"), "SAFE_MODE"),
        "balance": account.get("balance", 0.0),
        "equity": account.get("equity", account.get("balance", 0.0)),
        "openPnl": account.get("profit", 0.0),
        "floatingPnl": account.get("profit", 0.0),
        "closedPnl": closed_pnl,
        "totalPnl": closed_pnl + safe_float(account.get("profit")),
        "winRate": win_rate,
        "drawdownPct": summary["peak_to_equity_drawdown_pct"],
        "openPositionsCount": len(positions),
        "totalTrades": len(trades),
        "timestamp": safe_timestamp(raw_payload.get("timestamp") or account.get("timestamp")),
        "payloadSource": "mt5_sync_live",
        "payload_mode": safe_str(raw_payload.get("payload_mode")),
        "sync_reason": safe_str(raw_payload.get("sync_reason")),
        "historyBootstrapFull": bool(raw_payload.get("historyBootstrapFull")),
        "positions": positions,
        "symbolSpecs": symbol_specs,
        "trades": trades,
        "history": history,
        "reportMetrics": report_metrics,
        "riskSnapshot": risk_snapshot,
        "riskRules": build_risk_rules(),
        "riskProfile": {
            "currentRiskPct": summary["total_open_risk_pct"],
            "dailyLossLimitPct": policy_snapshot["daily_dd_limit_pct"],
            "weeklyHeatLimitPct": policy_snapshot["max_dd_limit_pct"],
            "maxTradeRiskPct": policy_snapshot["risk_per_trade_pct"],
            "maxVolume": policy_snapshot["max_volume"],
            "allowedSessions": policy_snapshot["allowed_sessions"],
            "allowedSymbols": policy_snapshot["allowed_symbols"],
            "autoBlock": policy_snapshot["auto_block_enabled"],
        },
    }
    if metric_recovery_warnings:
        payload["data_status"] = "partial_account_metrics"
        payload["syncIssues"] = [
            {
                "section": "account",
                "field": warning.split("_preserved", 1)[0],
                "problem": "incoming_zero_preserved_previous_value",
            }
            for warning in metric_recovery_warnings
        ]
        payload["riskSnapshot"]["metadata"]["warnings"] = [
            *payload["riskSnapshot"]["metadata"].get("warnings", []),
            *metric_recovery_warnings,
        ]
    return payload


def build_direct_mt5_dashboard_payload(
    provider_result: dict[str, Any],
    *,
    label: str,
    previous_payload: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    raw_account = ensure_dict(provider_result.get("account"))
    account, account_issues = sanitize_account(raw_account)
    if not account.get("broker"):
        account["broker"] = infer_broker_from_server(account.get("server", "")) or "MT5"
    if not account.get("name"):
        account["name"] = label or account.get("broker") or "MT5 Direct"

    positions, position_issues = sanitize_positions(provider_result.get("positions"))
    trades, trade_issues = sanitize_trades(provider_result.get("trades"))
    history, history_issues = sanitize_trades(provider_result.get("history") or provider_result.get("trades"))
    raw_dashboard_payload = provider_result.get("dashboard_payload") if isinstance(provider_result.get("dashboard_payload"), dict) else {}

    if raw_dashboard_payload:
        dashboard_payload = deepcopy(raw_dashboard_payload)
        dashboard_payload.setdefault("accountName", label or dashboard_payload.get("accountName") or account.get("broker") or "MT5 Direct")
        dashboard_payload.setdefault("name", dashboard_payload.get("accountName"))
        dashboard_payload.setdefault("broker", account.get("broker") or "MT5")
        dashboard_payload.setdefault("server", account.get("server") or "")
        dashboard_payload.setdefault("login", account.get("login") or "")
        dashboard_payload.setdefault("platform", "mt5")
        dashboard_payload.setdefault("environment", "live")
        dashboard_payload.setdefault("positions", positions)
        dashboard_payload.setdefault("trades", trades)
        dashboard_payload.setdefault("history", history)
    else:
        raw_payload = {
            "mode": "DIRECT_MT5",
            "timestamp": now_iso(),
            "history": history,
            "symbolSpecs": provider_result.get("symbolSpecs") or provider_result.get("symbol_specs") or {},
        }
        dashboard_payload = build_dashboard_account_payload(
            account=account,
            positions=positions,
            trades=trades,
            raw_payload=raw_payload,
            previous_payload=previous_payload,
        )

    dashboard_payload["payloadSource"] = "mt5_direct_live"
    dashboard_payload["data_status"] = "live"
    dashboard_payload["mode"] = dashboard_payload.get("mode") or "MT5 Directa"
    dashboard_payload["directSync"] = {
        "provider": provider_result.get("provider", ""),
        "provider_connection_id": provider_result.get("provider_connection_id", ""),
        "message": provider_result.get("message", "MT5 account linked and synced"),
        **ensure_dict(provider_result.get("metrics")),
    }
    dashboard_payload["syncIssues"] = [
        *account_issues,
        *position_issues,
        *trade_issues,
        *history_issues,
    ]
    return account, dashboard_payload


def sync_direct_mt5_provider_account(
    *,
    user_id: str,
    account_id: str,
    connection_key: str,
    label: str,
    login: str,
    server: str,
    password: str,
    broker: str = "",
) -> dict[str, Any]:
    provider = get_direct_mt5_provider()
    provider_status = provider.status()
    if not provider_status.configured:
        return {
            "ok": False,
            "available": False,
            "fatal": False,
            "reason": "direct_mt5_provider_unavailable",
            "message": "Direct MT5 provider is not configured.",
            "provider": direct_provider_status_dict(),
        }

    try:
        provider_result = provider.link_account(
            {
                "login": login,
                "server": server,
                "password": password,
                "broker": broker,
            }
        )
    except DirectMt5ProviderUnavailable as exc:
        return {
            "ok": False,
            "available": False,
            "fatal": False,
            "reason": exc.reason,
            "message": exc.message,
            "provider": direct_provider_status_dict(),
        }
    except DirectMt5ProviderError as exc:
        return {
            "ok": False,
            "available": True,
            "fatal": True,
            "reason": exc.reason,
            "message": exc.message,
            "status_code": exc.status_code,
            "retryable": exc.retryable,
            "details": exc.details,
            "provider": direct_provider_status_dict(),
        }

    if provider_result.get("ok") is False:
        return {
            "ok": False,
            "available": True,
            "fatal": True,
            "reason": safe_str(provider_result.get("reason"), "direct_mt5_provider_rejected"),
            "message": safe_str(provider_result.get("message"), "Direct MT5 provider rejected the connection."),
            "status_code": 400,
            "provider": direct_provider_status_dict(),
        }

    snapshot = account_service.build_accounts_snapshot(user_id)
    previous_payload = None
    previous_entry = find_scoped_account_entry(snapshot, account_id)
    if previous_entry and isinstance(previous_entry.get("dashboard_payload"), dict):
        previous_payload = previous_entry["dashboard_payload"]
    account_info, dashboard_payload = build_direct_mt5_dashboard_payload(
        provider_result,
        label=label,
        previous_payload=previous_payload,
    )
    synced = account_service.ingest_account_snapshot(
        user_id=user_id,
        account_info=account_info,
        connection_mode="direct",
        payload=dashboard_payload,
        account_id=account_id,
        api_key=connection_key,
        nickname=label,
    )
    return {
        "ok": True,
        "available": True,
        "fatal": False,
        "provider": direct_provider_status_dict(),
        "provider_connection_id": provider_result.get("provider_connection_id", ""),
        "message": provider_result.get("message", "MT5 account linked and synced"),
        "metrics": ensure_dict(provider_result.get("metrics")),
        "account_id": synced.account_id,
    }


def sync_error_response(reason: str, details: Any, http_status: int = 200, sync_id: str = "") -> JSONResponse:
    return connector_json_response(
        {
            "ok": False,
            "received": False,
            "sync_id": sync_id,
            "disposition": "rejected",
            "reason": reason,
            "rejection_reason": reason,
            "error_code": SYNC_ERROR_INVALID_PAYLOAD,
            "details": redact_sensitive_data(details),
            "timestamp": now_iso(),
        },
        status_code=http_status,
    )


def mt5_request_max_body_bytes(route: str) -> int:
    if route == "/api/mt5/journal":
        return _env_int("KMFX_MT5_JOURNAL_MAX_BODY_BYTES", default=256 * 1024)
    return _env_int("KMFX_MT5_SYNC_MAX_BODY_BYTES", default=512 * 1024)


def mt5_sync_record_limit(name: str, *, default: int) -> int:
    return max(0, _env_int(name, default=default))


def limit_mt5_record_list(
    records: Any,
    *,
    section: str,
    env_name: str,
    default: int,
    issues: list[dict[str, Any]] | None = None,
    keep_tail: bool = False,
) -> list[Any]:
    if not isinstance(records, list):
        return []
    limit = mt5_sync_record_limit(env_name, default=default)
    if limit <= 0 or len(records) <= limit:
        return records
    if issues is not None:
        issues.append(
            {
                "section": section,
                "field": section,
                "problem": "truncated_to_bandwidth_limit",
                "received_count": len(records),
                "stored_count": limit,
            }
        )
    log.warning(
        "MT5 sync section truncated | section=%s received_count=%s stored_count=%s env=%s",
        section,
        len(records),
        limit,
        env_name,
    )
    return records[-limit:] if keep_tail else records[:limit]


def bounded_mt5_sync_payload(
    payload: dict[str, Any],
    *,
    positions: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    issues: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    bounded_positions = limit_mt5_record_list(
        positions,
        section="positions",
        env_name="KMFX_MT5_SYNC_MAX_POSITIONS",
        default=50,
        issues=issues,
    )
    bounded_trades = limit_mt5_record_list(
        trades,
        section="trades",
        env_name="KMFX_MT5_SYNC_MAX_TRADES",
        default=40,
        issues=issues,
    )
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    bounded_history = limit_mt5_record_list(
        history,
        section="history",
        env_name="KMFX_MT5_SYNC_MAX_HISTORY_POINTS",
        default=48,
        issues=issues,
        keep_tail=True,
    )
    if bounded_history is history and bounded_positions is positions and bounded_trades is trades:
        return payload, bounded_positions, bounded_trades
    return {
        **payload,
        "positions": bounded_positions,
        "trades": bounded_trades,
        "history": bounded_history,
    }, bounded_positions, bounded_trades


def request_header(request: Request, name: str) -> str:
    headers = getattr(request, "headers", {}) or {}
    candidates = (name, name.lower(), name.title())
    for candidate in candidates:
        try:
            value = headers.get(candidate)
        except AttributeError:
            value = None
        if value:
            return safe_str(value)
    return ""


def json_request_max_body_bytes(route: str) -> int:
    if route == "/api/post-trade/reviews":
        return _env_int("KMFX_REVIEW_JSON_MAX_BODY_BYTES", default=128 * 1024)
    if route == "/api/backtests/mt5/import":
        return _env_int("KMFX_BACKTEST_IMPORT_MAX_BODY_BYTES", default=2 * 1024 * 1024)
    return _env_int("KMFX_MUTATION_JSON_MAX_BODY_BYTES", default=64 * 1024)


def json_payload_error_response(
    reason: str,
    *,
    route: str,
    details: dict[str, Any] | None = None,
    status_code: int = 400,
) -> JSONResponse:
    return connector_json_response(
        {
            "ok": False,
            "reason": reason,
            "error": reason,
            "details": details or {},
            "route": route,
            "timestamp": now_iso(),
        },
        status_code=status_code,
    )


async def read_json_object_payload(
    request: Request,
    route: str,
    *,
    max_bytes: int | None = None,
) -> tuple[dict[str, Any], JSONResponse | None]:
    max_body_bytes = max_bytes or json_request_max_body_bytes(route)
    content_length = request_header(request, "content-length")
    if content_length:
        try:
            declared_bytes = int(content_length)
        except ValueError:
            declared_bytes = None
        if declared_bytes is not None and declared_bytes > max_body_bytes:
            log.warning(
                "JSON payload rejected before read | route=%s declared_bytes=%s max_bytes=%s",
                route,
                declared_bytes,
                max_body_bytes,
            )
            return {}, json_payload_error_response(
                "payload_too_large",
                route=route,
                details={"max_bytes": max_body_bytes, "actual_bytes": declared_bytes},
                status_code=413,
            )

    body_reader = getattr(request, "body", None)
    if callable(body_reader):
        try:
            raw_body = await body_reader()
        except Exception as exc:
            log.exception("JSON body read failed | route=%s error=%s", route, exc)
            return {}, json_payload_error_response(
                "invalid_json",
                route=route,
                details={"field": "body", "problem": "body_read_failed"},
                status_code=400,
            )
        body_bytes = raw_body.encode("utf-8") if isinstance(raw_body, str) else bytes(raw_body or b"")
        if len(body_bytes) > max_body_bytes:
            log.warning(
                "JSON payload rejected after read | route=%s actual_bytes=%s max_bytes=%s",
                route,
                len(body_bytes),
                max_body_bytes,
            )
            return {}, json_payload_error_response(
                "payload_too_large",
                route=route,
                details={"max_bytes": max_body_bytes, "actual_bytes": len(body_bytes)},
                status_code=413,
            )
        if not body_bytes.strip():
            return {}, None
        try:
            payload = json.loads(body_bytes.decode("utf-8"))
        except Exception as exc:
            log.exception("JSON payload rejected | route=%s error=%s", route, exc)
            return {}, json_payload_error_response(
                "invalid_json",
                route=route,
                details={"field": "body", "problem": "invalid_json"},
                status_code=400,
            )
    else:
        try:
            payload = await request.json()
        except Exception as exc:
            log.exception("JSON payload rejected | route=%s error=%s", route, exc)
            return {}, json_payload_error_response(
                "invalid_json",
                route=route,
                details={"field": "body", "problem": "invalid_json"},
                status_code=400,
            )

    if not isinstance(payload, dict):
        return {}, json_payload_error_response(
            "invalid_payload",
            route=route,
            details={"field": "body", "problem": "json_object_required"},
            status_code=400,
        )
    return payload, None


def mt5_payload_too_large_response(
    route: str,
    max_bytes: int,
    actual_bytes: int | None = None,
    *,
    sync_id: str = "",
    batch_id: str = "",
) -> JSONResponse:
    details: dict[str, Any] = {"max_bytes": max_bytes}
    if actual_bytes is not None:
        details["actual_bytes"] = actual_bytes
    if route == "/api/mt5/sync":
        return sync_error_response("payload_too_large", details, http_status=413, sync_id=sync_id)
    return connector_json_response(
        {
            "ok": False,
            "received": False,
            "batch_id": batch_id,
            "disposition": "rejected",
            "reason": "payload_too_large",
            "error_code": SYNC_ERROR_INVALID_PAYLOAD,
            "details": details,
            "timestamp": now_iso(),
        },
        status_code=413,
    )


def mt5_invalid_json_response(route: str, exc: Exception, *, sync_id: str = "", batch_id: str = "") -> JSONResponse:
    if route == "/api/mt5/sync":
        return sync_error_response(
            "invalid_json",
            {
                "section": "root",
                "field": "body",
                "problem": "invalid_json",
                "message": str(exc),
            },
            sync_id=sync_id,
        )
    return connector_json_response(
        {
            "ok": False,
            "received": False,
            "batch_id": batch_id,
            "disposition": "rejected",
            "reason": "invalid_json",
            "error_code": SYNC_ERROR_INVALID_PAYLOAD,
            "details": {"message": str(exc)},
            "timestamp": now_iso(),
        }
    )


async def read_mt5_json_payload(
    request: Request,
    route: str,
    *,
    sync_id: str = "",
    batch_id: str = "",
) -> tuple[Any | None, JSONResponse | None]:
    max_bytes = mt5_request_max_body_bytes(route)
    content_length = request_header(request, "content-length")
    if content_length:
        try:
            declared_bytes = int(content_length)
        except ValueError:
            declared_bytes = None
        if declared_bytes is not None and declared_bytes > max_bytes:
            log.warning(
                "MT5 payload rejected before read | route=%s declared_bytes=%s max_bytes=%s",
                route,
                declared_bytes,
                max_bytes,
            )
            return None, mt5_payload_too_large_response(
                route,
                max_bytes,
                declared_bytes,
                sync_id=sync_id,
                batch_id=batch_id,
            )

    body_reader = getattr(request, "body", None)
    if callable(body_reader):
        try:
            raw_body = await body_reader()
            if isinstance(raw_body, str):
                body_bytes = raw_body.encode("utf-8")
            else:
                body_bytes = bytes(raw_body or b"")
            if len(body_bytes) > max_bytes:
                log.warning(
                    "MT5 payload rejected after read | route=%s actual_bytes=%s max_bytes=%s",
                    route,
                    len(body_bytes),
                    max_bytes,
                )
                return None, mt5_payload_too_large_response(
                    route,
                    max_bytes,
                    len(body_bytes),
                    sync_id=sync_id,
                    batch_id=batch_id,
                )
            return json.loads(body_bytes.decode("utf-8")), None
        except Exception as exc:
            log.exception("MT5 invalid JSON payload | route=%s error=%s", route, exc)
            return None, mt5_invalid_json_response(route, exc, sync_id=sync_id, batch_id=batch_id)

    try:
        return await request.json(), None
    except Exception as exc:
        log.exception("MT5 invalid JSON payload | route=%s error=%s", route, exc)
        return None, mt5_invalid_json_response(route, exc, sync_id=sync_id, batch_id=batch_id)


def health_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "kmfx-edge-api",
        "runtime_marker": RUNTIME_SYNC_KEY_LOOKUP_MARKER,
        "render_git_commit": safe_str(os.getenv("RENDER_GIT_COMMIT") or os.getenv("RENDER_GIT_COMMIT_SHA")),
        "account_store": account_store.__class__.__name__,
    }


@app.get("/")
async def healthcheck() -> JSONResponse:
    return connector_json_response(health_payload())


@app.get("/health")
async def render_healthcheck() -> JSONResponse:
    return connector_json_response(health_payload())


@app.post("/accounts")
async def create_account(request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "accounts": [],
                "is_admin": False,
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "POST /accounts",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    payload, payload_error = await read_json_object_payload(request, "/accounts")
    if payload_error is not None:
        return payload_error

    alias = safe_str(payload.get("alias"))
    platform = safe_str(payload.get("platform"), "mt5")
    if not alias:
        return connector_json_response(
            {
                "ok": False,
                "reason": "missing_alias",
                "details": {"field": "alias"},
                "timestamp": now_iso(),
            },
            status_code=400,
        )

    denial = connection_key_creation_denial(user_id=scope_user_id, context=auth_context)
    if denial is not None:
        return denial

    try:
        created = account_service.create_pending_account(
            user_id=scope_user_id,
            alias=alias,
            platform=platform or "mt5",
        )
    except ValueError as exc:
        return connector_json_response(
            {
                "ok": False,
                "reason": str(exc),
                "details": {"field": "alias"},
                "timestamp": now_iso(),
            },
            status_code=400,
        )
    return connector_json_response(
        {
            "ok": True,
            "account_id": created.account_id,
            "alias": created.alias,
            "platform": created.platform,
            "connection_key": created.api_key,
            "status": created.status,
            "created_at": created.created_at.isoformat(),
            "is_admin": auth_context["is_admin"],
            "timestamp": now_iso(),
        },
        status_code=201,
    )


@app.get("/api/direct-mt5/brokers")
async def direct_mt5_brokers(
    request: Request,
    q: str = Query("", max_length=80),
    limit: int = Query(160, ge=1, le=500),
) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    if not kmfx_feature_enabled("direct_mt5", default=not _is_production_runtime()):
        return feature_disabled_response("direct_mt5")
    return connector_json_response(
        {
            "ok": True,
            "servers": list_direct_mt5_servers(q, limit),
            "provider": direct_provider_status_dict(),
            "is_admin": auth_context["is_admin"],
            "timestamp": now_iso(),
        }
    )


@app.post("/api/direct-mt5/link")
async def direct_mt5_link(request: Request) -> JSONResponse:
    payload, payload_error = await read_json_object_payload(request, "/api/direct-mt5/link")
    if payload_error is not None:
        return payload_error
    if not kmfx_feature_enabled("direct_mt5", default=not _is_production_runtime()):
        return feature_disabled_response("direct_mt5")
    payload["connection_mode"] = "direct"
    return await link_account_from_payload(request, payload)


@app.post("/api/accounts/link")
async def link_account(request: Request) -> JSONResponse:
    payload, payload_error = await read_json_object_payload(request, "/api/accounts/link")
    if payload_error is not None:
        return payload_error
    return await link_account_from_payload(request, payload)


async def link_account_from_payload(request: Request, payload: dict[str, Any]) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "POST /api/accounts/link",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    user_id = scope_user_id
    raw_label = safe_str(payload.get("label") or payload.get("alias") or payload.get("nickname"))
    label = raw_label or "Nueva cuenta MT5"
    platform = safe_str(payload.get("platform"), "mt5") or "mt5"
    requested_connection_mode = safe_str(payload.get("connection_mode") or payload.get("connectionMode") or payload.get("mode"), "launcher").lower()
    if requested_connection_mode in {"direct", "manual", "cloud"}:
        connection_mode = "direct"
    elif requested_connection_mode in {"ea", "expert", "expert_advisor", "ea_direct"}:
        connection_mode = "ea_direct"
    else:
        connection_mode = "launcher"
    if connection_mode == "direct" and not kmfx_feature_enabled("direct_mt5", default=not _is_production_runtime()):
        return feature_disabled_response("direct_mt5")
    direct_login = safe_str(payload.get("login") or payload.get("account_number") or payload.get("accountNumber"))
    direct_server = safe_str(payload.get("server"))
    direct_broker = safe_str(payload.get("broker"))
    if connection_mode == "direct" and not raw_label:
        label = f"MT5 {direct_login}".strip() or "Cuenta MT5 directa"
    requested_account_id = safe_str(payload.get("account_id"))
    launcher_connection_key = resolve_connection_key(payload, request)
    registry = account_service.build_accounts_registry(user_id)
    pending_statuses = {"draft", "pending", "pending_setup", "pending_link", "waiting_sync", "linked"}

    def registry_entry_has_connection_key(account: dict[str, Any]) -> bool:
        return bool(safe_str(account.get("connection_key")) or account.get("has_connection_key"))

    existing_for_limit: dict[str, Any] | None = None
    if launcher_connection_key:
        user_key_account = account_service.get_account_by_api_key(user_id=user_id, api_key=launcher_connection_key)
        if user_key_account is not None:
            existing_for_limit = {"account_id": user_key_account.account_id}
    else:
        if requested_account_id:
            existing_for_limit = next((account for account in registry if account.get("account_id") == requested_account_id), None)
        if existing_for_limit is None:
            existing_for_limit = next(
                (
                    account
                    for account in registry
                    if account.get("status") in pending_statuses
                    and safe_str(account.get("alias")) == label
                    and registry_entry_has_connection_key(account)
                ),
                None,
            )
        if existing_for_limit is None:
            existing_for_limit = next(
                (
                    account
                    for account in registry
                    if account.get("platform") == platform
                    and account.get("status") in pending_statuses
                    and safe_str(account.get("alias")) == label
                    and registry_entry_has_connection_key(account)
                ),
                None,
            )

    if existing_for_limit is None:
        denial = connection_key_creation_denial(user_id=user_id, context=auth_context)
        if denial is not None:
            return denial

    existing: dict[str, Any] | None = None
    existing_account = None
    claimed_account = None
    created_new_account = False
    claimed_launcher_key = False
    if launcher_connection_key:
        try:
            claimed_account = account_service.claim_account_by_api_key(
                user_id=user_id,
                api_key=launcher_connection_key,
                alias=label,
            )
            claimed_launcher_key = claimed_account is not None
            if claimed_account is None:
                claimed_account = account_service.create_pending_account_with_key(
                    user_id=user_id,
                    alias=label,
                    connection_key=launcher_connection_key,
                    platform=platform,
                    connection_mode=connection_mode,
                    broker=direct_broker,
                    login=direct_login,
                    server=direct_server,
                )
                created_new_account = claimed_account is not None
            if claimed_account is None:
                return connector_json_response(
                    {
                        "ok": False,
                        "reason": "connection_key_not_available",
                        "details": {
                            "field": "connection_key",
                            "connection_key": mask_connection_key(launcher_connection_key),
                        },
                        "timestamp": now_iso(),
                    },
                    status_code=409,
                )
        except ValueError as exc:
            reason = str(exc)
            status_code = 409 if reason == "connection_key_already_linked" else 400
            return connector_json_response(
                {
                    "ok": False,
                    "reason": reason,
                    "details": {
                        "field": "connection_key",
                        "connection_key": mask_connection_key(launcher_connection_key),
                    },
                    "timestamp": now_iso(),
                },
                status_code=status_code,
            )

    if claimed_account is not None:
        connection_key = claimed_account.api_key
        account_id = claimed_account.account_id
    else:
        if requested_account_id:
            existing = next((account for account in registry if account.get("account_id") == requested_account_id), None)
        if existing is None:
            existing = next(
                (
                    account
                    for account in registry
                    if account.get("status") in pending_statuses
                    and safe_str(account.get("alias")) == label
                    and registry_entry_has_connection_key(account)
                ),
                None,
            )
        if existing is None:
            existing = next(
                (
                    account
                    for account in registry
                    if account.get("platform") == platform
                    and account.get("status") in pending_statuses
                    and safe_str(account.get("alias")) == label
                    and registry_entry_has_connection_key(account)
                ),
                None,
            )

        if existing is not None:
            account_id = safe_str(existing.get("account_id"))
            existing_account = next(
                (
                    item
                    for item in account_service.list_accounts(user_id)
                    if item.account_id == account_id
                ),
                None,
            )
            if existing_account is None and auth_context.get("is_admin"):
                existing_account = find_account_by_id_any_user(account_id)
            if existing_account is None:
                return connector_json_response(
                    {
                        "ok": False,
                        "reason": "account_not_found",
                        "details": {"account_id": account_id},
                        "timestamp": now_iso(),
                    },
                    status_code=404,
                )
            connection_key = safe_str(getattr(existing_account, "api_key", ""))
            existing_key_revoked = bool(getattr(existing_account, "connection_key_revoked_at", None))
            if connection_key and account_service.is_connection_key_revoked_any_user(connection_key):
                existing_key_revoked = True
            if existing_key_revoked:
                return connector_json_response(
                    {
                        "ok": False,
                        "reason": "connection_key_revoked",
                        "details": {
                            "account_id": account_id,
                            "connection_key_preview": getattr(existing_account, "connection_key_preview", "") or mask_connection_key(connection_key),
                        },
                        "timestamp": now_iso(),
                    },
                    status_code=409,
                )
            if not connection_key:
                return connector_json_response(
                    {
                        "ok": False,
                        "reason": "connection_key_not_available",
                        "details": {"account_id": account_id},
                        "timestamp": now_iso(),
                    },
                    status_code=409,
                )
        else:
            try:
                created = account_service.create_pending_account(
                    user_id=user_id,
                    alias=label,
                    platform=platform,
                    connection_mode=connection_mode,
                    broker=direct_broker,
                    login=direct_login,
                    server=direct_server,
                )
            except ValueError as exc:
                return connector_json_response(
                    {
                        "ok": False,
                        "reason": str(exc),
                        "details": {"field": "alias"},
                        "timestamp": now_iso(),
                    },
                    status_code=400,
                )
            connection_key = created.api_key
            account_id = created.account_id
            created_new_account = True

    direct_sync_result: dict[str, Any] | None = None
    direct_password = safe_str(payload.get("password") or payload.get("investor_password") or payload.get("investorPassword"))
    if connection_mode == "direct" and direct_login and direct_server and direct_password:
        direct_sync_result = sync_direct_mt5_provider_account(
            user_id=user_id,
            account_id=account_id,
            connection_key=connection_key,
            label=label,
            login=direct_login,
            server=direct_server,
            password=direct_password,
            broker=direct_broker,
        )
        if direct_sync_result.get("fatal"):
            return connector_json_response(
                {
                    "ok": False,
                    "reason": direct_sync_result.get("reason") or "direct_mt5_sync_failed",
                    "message": direct_sync_result.get("message") or "No se pudo sincronizar la cuenta directa.",
                    "details": {
                        "account_id": account_id,
                        "provider": direct_sync_result.get("provider", {}),
                        "retryable": bool(direct_sync_result.get("retryable")),
                    },
                    "account_id": account_id,
                    "direct_sync_available": False,
                    "timestamp": now_iso(),
                },
                status_code=int(direct_sync_result.get("status_code") or 400),
            )

    direct_config = {
        "KMFXBackendBaseUrl": MT5_CLOUD_BASE_URL,
        "KMFXSyncPath": MT5_CLOUD_SYNC_PATH,
        "KMFXJournalPath": MT5_CLOUD_JOURNAL_PATH,
        "KMFXPolicyPath": MT5_CLOUD_POLICY_PATH,
        "connection_key": connection_key,
        "KMFXApiKey": connection_key,
    }
    launcher_config = {
        "KMFXBackendBaseUrl": MT5_LOCAL_BASE_URL,
        "KMFXSyncPath": MT5_LOCAL_SYNC_PATH,
        "KMFXJournalPath": MT5_LOCAL_JOURNAL_PATH,
        "KMFXPolicyPath": MT5_LOCAL_POLICY_PATH,
        "connection_key": connection_key,
        "KMFXApiKey": connection_key,
    }
    log.info(
        "ACCOUNT link issued | account_id=%s user_id=%s connection_key=%s",
        account_id,
        user_id,
        mask_connection_key(connection_key),
    )
    registry_after_link = account_service.build_accounts_registry(user_id)
    linked_account = next(
        (
            account
            for account in registry_after_link
            if safe_str(account.get("account_id")) == account_id
        ),
        {},
    )
    emit_audit_event(
        "create_account" if created_new_account else "link_account",
        context=auth_context,
        user_id=user_id,
        account_id=account_id,
        details={
            "source": "accounts_link",
            "created_new_account": created_new_account,
            "claimed_launcher_key": claimed_launcher_key,
            "connection_mode": connection_mode,
            "platform": platform,
            "login": direct_login,
            "server": direct_server,
        },
    )
    if created_new_account:
        emit_audit_event(
            "create_key",
            context=auth_context,
            user_id=user_id,
            account_id=account_id,
            details={
                "source": "accounts_link",
                "connection_mode": connection_mode,
                "connection_key_preview": mask_connection_key(connection_key),
            },
        )
    return connector_json_response(
        {
            "ok": True,
            "account_id": account_id,
            "account": linked_account,
            "connection_key": connection_key,
            "launcher_config": launcher_config,
            "direct_config": direct_config,
            "connection_mode": connection_mode,
            "direct_sync_available": bool(direct_sync_result and direct_sync_result.get("ok")),
            "direct_sync_status": direct_sync_result or {"provider": direct_provider_status_dict()} if connection_mode == "direct" else {},
            "sync_required": "ea" if connection_mode == "direct" and not (direct_sync_result and direct_sync_result.get("ok")) else "",
            "linked_existing_launcher_key": bool(claimed_account is not None),
            "is_admin": auth_context["is_admin"],
            "timestamp": now_iso(),
        }
    )


@app.get("/accounts")
async def list_accounts(request: Request) -> JSONResponse:
    scope_user_id, admin_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(empty_accounts_payload(admin_context))
    allowed_connection_keys = admin_launcher_connection_keys_for_context(admin_context)
    access_denial = live_accounts_access_denial(admin_context)
    accounts = merge_admin_launcher_registry_accounts(
        account_service.build_accounts_registry(scope_user_id),
        allowed_connection_keys,
    )
    if access_denial is not None:
        accounts = scrub_accounts_registry_for_billing(accounts, access_denial)
    return connector_json_response(
        {
            "ok": True,
            "accounts": accounts,
            "is_admin": admin_context["is_admin"],
            "auth_email": admin_context["email"],
            "scope_user_id": scope_user_id,
            "admin_launcher_bridge": bool(allowed_connection_keys),
            "live_access_blocked": access_denial is not None,
            "reason": safe_str(access_denial.get("reason")) if access_denial else "",
            "details": ensure_dict(access_denial.get("details")) if access_denial else {},
            "timestamp": now_iso(),
        }
    )


@app.get("/accounts/pending")
async def list_pending_accounts(request: Request) -> JSONResponse:
    scope_user_id, admin_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(empty_accounts_payload(admin_context))
    pending_accounts = [
        account
        for account in account_service.build_accounts_registry(scope_user_id)
        if account.get("status") in {"draft", "pending", "pending_setup", "pending_link", "waiting_sync", "linked"}
    ]
    return connector_json_response(
        {
            "ok": True,
            "accounts": [
                {
                    "account_id": account.get("account_id", ""),
                    "alias": account.get("alias", ""),
                    "platform": account.get("platform", "mt5"),
                    "user_id": account.get("user_id", "local"),
                    "connection_key": account.get("connection_key", ""),
                    "status": account.get("status", ""),
                    "lifecycle_status": account.get("lifecycle_status", account.get("status", "")),
                    "created_at": account.get("created_at", ""),
                }
                for account in pending_accounts
            ],
            "is_admin": admin_context["is_admin"],
            "timestamp": now_iso(),
        }
    )


def account_belongs_to_scope(account_id: str, user_id: str, context: dict[str, Any]) -> bool:
    normalized_account_id = safe_str(account_id)
    if not normalized_account_id or not user_id:
        return False
    if any(account.account_id == normalized_account_id for account in account_service.list_accounts(user_id)):
        return True
    return bool(context.get("is_admin") and find_account_by_id_any_user(normalized_account_id))


def post_trade_review_items_payload(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        record = normalize_review_record(ensure_dict(row.get("record")))
        trade_id = safe_str(row.get("trade_id") or record.get("tradeId"))
        if not trade_id:
            continue
        record["tradeId"] = trade_id
        items.append(
            {
                "account_id": safe_str(row.get("account_id")),
                "trade_id": trade_id,
                "review": record,
                "updated_at": safe_str(row.get("updated_at") or record.get("updatedAt")),
            }
        )
    return items


@app.get("/api/post-trade/reviews")
async def list_post_trade_reviews(request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {"ok": False, "reason": "auth_required", "timestamp": now_iso()},
            status_code=401,
        )
    account_id = safe_str(request.query_params.get("account_id"))
    if account_id and not account_belongs_to_scope(account_id, scope_user_id, auth_context):
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    try:
        rows = post_trade_review_store.list_reviews(user_id=scope_user_id, account_id=account_id or None)
    except OSError as exc:
        log.exception("[KMFX][POST_TRADE_REVIEW] list_failed user_id=%s account_id=%s error=%s", scope_user_id, account_id, exc)
        return connector_json_response(
            {"ok": False, "reason": "review_store_unavailable", "timestamp": now_iso()},
            status_code=503,
        )
    items = post_trade_review_items_payload(rows)
    return connector_json_response(
        {
            "ok": True,
            "items": items,
            "reviews": {item["trade_id"]: item["review"] for item in items},
            "account_id": account_id,
            "is_admin": bool(auth_context.get("is_admin")),
            "timestamp": now_iso(),
        }
    )


@app.post("/api/post-trade/reviews")
async def save_post_trade_review(request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {"ok": False, "reason": "auth_required", "timestamp": now_iso()},
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "POST /api/post-trade/reviews",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    payload, payload_error = await read_json_object_payload(request, "/api/post-trade/reviews")
    if payload_error is not None:
        return payload_error
    account_id = safe_str(payload.get("account_id"))
    trade_id = safe_str(payload.get("trade_id") or payload.get("tradeId"))
    if not account_id or not trade_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "missing_review_scope",
                "details": {"account_id": bool(account_id), "trade_id": bool(trade_id)},
                "timestamp": now_iso(),
            },
            status_code=400,
        )
    if not account_belongs_to_scope(account_id, scope_user_id, auth_context):
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    review = normalize_review_record(ensure_dict(payload.get("review") or payload))
    review["tradeId"] = trade_id
    try:
        row = post_trade_review_store.upsert_review(
            user_id=scope_user_id,
            account_id=account_id,
            trade_id=trade_id,
            record=review,
        )
    except OSError as exc:
        log.exception("[KMFX][POST_TRADE_REVIEW] save_failed user_id=%s account_id=%s trade_id=%s error=%s", scope_user_id, account_id, trade_id, exc)
        return connector_json_response(
            {"ok": False, "reason": "review_store_unavailable", "timestamp": now_iso()},
            status_code=503,
        )
    saved_review = normalize_review_record(ensure_dict(row.get("record")))
    saved_review["tradeId"] = trade_id
    return connector_json_response(
        {
            "ok": True,
            "account_id": account_id,
            "trade_id": trade_id,
            "review": saved_review,
            "updated_at": safe_str(row.get("updated_at") or saved_review.get("updatedAt")),
            "is_admin": bool(auth_context.get("is_admin")),
            "timestamp": now_iso(),
        }
    )


@app.post("/api/accounts/{account_id}/revoke-key")
async def revoke_own_account_key(account_id: str, request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "POST /api/accounts/{account_id}/revoke-key",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    account = next(
        (
            item
            for item in account_service.list_accounts(scope_user_id)
            if item.account_id == safe_str(account_id)
        ),
        None,
    )
    if account is None and not auth_context.get("is_admin"):
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    revoked = account_service.revoke_connection_key(safe_str(account_id), reason="user_revocation")
    if revoked is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    forget_live_account_snapshot(revoked.account_id)
    emit_audit_event(
        "revoke_key",
        context=auth_context,
        user_id=scope_user_id,
        account_id=revoked.account_id,
        details={
            "source": "account_detail",
            "reason": "user_revocation",
            "connection_key_preview": revoked.connection_key_preview or mask_connection_key(revoked.api_key),
        },
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": revoked.account_id,
            "status": revoked.status,
            "connection_key_revoked": True,
            "connection_key_revoked_at": revoked.connection_key_revoked_at.isoformat() if revoked.connection_key_revoked_at else "",
            "is_admin": auth_context["is_admin"],
            "timestamp": now_iso(),
        }
    )


@app.get("/api/accounts/{account_id}/connection-key")
async def get_own_account_connection_key(account_id: str, request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "GET /api/accounts/{account_id}/connection-key",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    normalized_account_id = safe_str(account_id)
    account = next(
        (
            item
            for item in account_service.list_accounts(scope_user_id)
            if item.account_id == normalized_account_id
        ),
        None,
    )
    if account is None:
        if not auth_context.get("is_admin"):
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
        account = find_account_by_id_any_user(normalized_account_id)
        if account is None:
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
    connection_key = safe_str(getattr(account, "api_key", ""))
    if not connection_key:
        return connector_json_response(
            {
                "ok": False,
                "reason": "connection_key_not_available",
                "account_id": normalized_account_id,
                "timestamp": now_iso(),
            },
            status_code=409,
        )
    key_was_revoked = bool(getattr(account, "connection_key_revoked_at", None))
    if connection_key and account_service.is_connection_key_revoked_any_user(connection_key):
        key_was_revoked = True
    if key_was_revoked:
        restored = account_service.restore_connection_key_with_key(account.account_id, connection_key)
        if restored is None:
            return connector_json_response(
                {
                    "ok": False,
                    "reason": "connection_key_not_available",
                    "account_id": normalized_account_id,
                    "timestamp": now_iso(),
                },
                status_code=409,
            )
        account = restored
        connection_key = safe_str(getattr(account, "api_key", ""))
        emit_audit_event(
            "restore_key",
            context=auth_context,
            user_id=account.user_id,
            account_id=account.account_id,
            details={
                "source": "account_detail",
                "connection_key_preview": getattr(account, "connection_key_preview", "") or mask_connection_key(connection_key),
            },
        )
    return connector_json_response(
        {
            "ok": True,
            "account_id": account.account_id,
            "connection_key": connection_key,
            "connection_key_preview": getattr(account, "connection_key_preview", "") or mask_connection_key(connection_key),
            "status": getattr(account, "status", ""),
            "connection_key_revoked": bool(getattr(account, "connection_key_revoked_at", None)),
            "connection_key_revoked_at": getattr(account, "connection_key_revoked_at", None).isoformat() if getattr(account, "connection_key_revoked_at", None) else "",
            "is_admin": bool(auth_context.get("is_admin")),
            "timestamp": now_iso(),
        }
    )


@app.post("/api/accounts/{account_id}/restore-key")
async def restore_own_account_connection_key(account_id: str, request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "POST /api/accounts/{account_id}/restore-key",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}
    connection_key = safe_str(resolve_connection_key(payload, request))
    if not connection_key:
        return connector_json_response(
            {
                "ok": False,
                "reason": "missing_connection_key",
                "timestamp": now_iso(),
            },
            status_code=400,
        )
    normalized_account_id = safe_str(account_id)
    account = next(
        (
            item
            for item in account_service.list_accounts(scope_user_id)
            if item.account_id == normalized_account_id
        ),
        None,
    )
    if account is None:
        if not auth_context.get("is_admin"):
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
        account = find_account_by_id_any_user(normalized_account_id)
        if account is None:
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
    restored = account_service.restore_connection_key_with_key(account.account_id, connection_key)
    if restored is None:
        return connector_json_response(
            {
                "ok": False,
                "reason": "invalid_connection_key",
                "account_id": normalized_account_id,
                "timestamp": now_iso(),
            },
            status_code=409,
        )
    emit_audit_event(
        "restore_key",
        context=auth_context,
        user_id=restored.user_id,
        account_id=restored.account_id,
        details={
            "source": "launcher_reinstall",
            "connection_key_preview": restored.connection_key_preview or mask_connection_key(connection_key),
        },
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": restored.account_id,
            "connection_key": connection_key,
            "connection_key_preview": restored.connection_key_preview or mask_connection_key(connection_key),
            "status": restored.status,
            "connection_key_revoked": False,
            "is_admin": bool(auth_context.get("is_admin")),
            "timestamp": now_iso(),
        }
    )


@app.post("/api/accounts/{account_id}/regenerate-key")
async def regenerate_own_account_key(account_id: str, request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "POST /api/accounts/{account_id}/regenerate-key",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    if not auth_context.get("is_admin"):
        return connector_json_response(
            {
                "ok": False,
                "reason": "stable_key_recovery_required",
                "message": "La KMFXKey es estable por cuenta MT5. Copia la key actual desde Detalles de cuenta en lugar de regenerarla.",
                "timestamp": now_iso(),
            },
            status_code=403,
        )
    entitlement_denial = product_entitlement_denial(context=auth_context, entitlement="launcherConnection")
    if entitlement_denial is not None:
        return entitlement_denial
    normalized_account_id = safe_str(account_id)
    account = next(
        (
            item
            for item in account_service.list_accounts(scope_user_id)
            if item.account_id == normalized_account_id
        ),
        None,
    )
    if account is None:
        if not auth_context.get("is_admin"):
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
        account = find_account_by_id_any_user(normalized_account_id)
        if account is None:
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
    regenerated = account_service.regenerate_connection_key(normalized_account_id)
    if regenerated is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    forget_live_account_snapshot(regenerated.account_id)
    emit_audit_event(
        "regenerate_key",
        context=auth_context,
        user_id=scope_user_id,
        account_id=regenerated.account_id,
        details={
            "source": "account_detail",
            "connection_key_preview": regenerated.connection_key_preview or mask_connection_key(regenerated.api_key),
        },
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": regenerated.account_id,
            "connection_key": regenerated.api_key,
            "connection_key_preview": regenerated.connection_key_preview or mask_connection_key(regenerated.api_key),
            "status": regenerated.status,
            "is_admin": auth_context["is_admin"],
            "timestamp": now_iso(),
        }
    )


@app.delete("/api/accounts/{account_id}")
async def delete_own_account(account_id: str, request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "DELETE /api/accounts/{account_id}",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    normalized_account_id = safe_str(account_id)
    account = next(
        (
            item
            for item in account_service.list_accounts(scope_user_id)
            if item.account_id == normalized_account_id
        ),
        None,
    )
    if account is None:
        if not auth_context.get("is_admin"):
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
        account = find_account_by_id_any_user(normalized_account_id)
        if account is None:
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
    account_service.revoke_connection_key(normalized_account_id, reason="user_delete")
    archived = account_service.archive_account(normalized_account_id)
    if archived is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    forget_live_account_snapshot(archived.account_id)
    emit_audit_event(
        "delete_account",
        context=auth_context,
        user_id=scope_user_id,
        account_id=archived.account_id,
        details={
            "source": "accounts_list",
            "reason": "user_delete",
            "connection_key_preview": archived.connection_key_preview or mask_connection_key(archived.api_key),
        },
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": archived.account_id,
            "deleted": True,
            "archived": True,
            "status": archived.status,
            "timestamp": now_iso(),
        }
    )


@app.post("/api/accounts/{account_id}/audit-event")
async def record_own_account_audit_event(account_id: str, request: Request) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    rate_limited = sensitive_rate_limit_response(
        "POST /api/accounts/{account_id}/audit-event",
        request,
        user_id=scope_user_id,
        email=safe_str(auth_context.get("email")),
        limit=60,
    )
    if rate_limited is not None:
        return rate_limited
    payload, payload_error = await read_json_object_payload(request, "POST /api/accounts/{account_id}/audit-event")
    if payload_error is not None:
        return payload_error
    normalized_account_id = safe_str(account_id)
    event = safe_str(payload.get("event")).lower()
    allowed_events = {"copy_key", "show_key", "open_launcher", "view_details"}
    if event not in allowed_events:
        return connector_json_response(
            {
                "ok": False,
                "reason": "invalid_audit_event",
                "details": {"event": event or "missing"},
                "timestamp": now_iso(),
            },
            status_code=400,
        )
    account = next(
        (
            item
            for item in account_service.list_accounts(scope_user_id)
            if item.account_id == normalized_account_id
        ),
        None,
    )
    if account is None:
        if not auth_context.get("is_admin"):
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
        account = find_account_by_id_any_user(normalized_account_id)
        if account is None:
            return connector_json_response(
                {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
                status_code=404,
            )
    emit_audit_event(
        event,
        context=auth_context,
        user_id=scope_user_id,
        account_id=account.account_id,
        details={
            "source": safe_str(payload.get("source"), "dashboard"),
            "connection_key_preview": account.connection_key_preview or mask_connection_key(account.api_key),
            "status": account.status,
        },
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": account.account_id,
            "event": event,
            "timestamp": now_iso(),
        }
    )


@app.get("/api/admin/accounts/{account_id}/payload")
async def admin_account_payload(account_id: str, request: Request) -> JSONResponse:
    admin_context, forbidden = require_admin(request)
    if forbidden is not None:
        return forbidden
    rate_limited = sensitive_rate_limit_response(
        "GET /api/admin/accounts/{account_id}/payload",
        request,
        user_id=safe_str(admin_context.get("user_id")),
        email=safe_str(admin_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    account = find_account_by_id_any_user(account_id)
    if account is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    payload = deepcopy(account.latest_payload or {})
    return connector_json_response(
        {
            "ok": True,
            "account_id": account.account_id,
            "user_id": account.user_id,
            "status": account.status,
            "connection_key_masked": account.connection_key_preview or mask_connection_key(account.api_key),
            "last_sync_at": account.last_sync_at.isoformat() if account.last_sync_at else "",
            "sync_error": payload.get("last_sync_error") or payload.get("sync_error") or "",
            "payload": payload,
            "timestamp": now_iso(),
        }
    )


@app.post("/api/admin/accounts/{account_id}/primary")
async def admin_mark_primary(account_id: str, request: Request) -> JSONResponse:
    admin_context, forbidden = require_admin(request)
    if forbidden is not None:
        return forbidden
    rate_limited = sensitive_rate_limit_response(
        "POST /api/admin/accounts/{account_id}/primary",
        request,
        user_id=safe_str(admin_context.get("user_id")),
        email=safe_str(admin_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    account = find_account_by_id_any_user(account_id)
    if account is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    selected = account_service.set_default_account(account.user_id, account.account_id)
    if selected is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_operational", "timestamp": now_iso()},
            status_code=409,
        )
    return connector_json_response(
        {
            "ok": True,
            "account_id": selected.account_id,
            "is_default": True,
            "is_primary": True,
            "timestamp": now_iso(),
        }
    )


@app.post("/api/admin/accounts/{account_id}/regenerate-key")
async def admin_regenerate_key(account_id: str, request: Request) -> JSONResponse:
    admin_context, forbidden = require_admin(request)
    if forbidden is not None:
        return forbidden
    rate_limited = sensitive_rate_limit_response(
        "POST /api/admin/accounts/{account_id}/regenerate-key",
        request,
        user_id=safe_str(admin_context.get("user_id")),
        email=safe_str(admin_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    account = account_service.regenerate_connection_key(account_id)
    if account is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    forget_live_account_snapshot(account.account_id)
    emit_audit_event(
        "regenerate_key",
        context=admin_context,
        user_id=account.user_id,
        account_id=account.account_id,
        details={
            "source": "admin_accounts",
            "connection_key_preview": account.connection_key_preview or mask_connection_key(account.api_key),
        },
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": account.account_id,
            "connection_key": account.api_key,
            "status": account.status,
            "timestamp": now_iso(),
        },
    )


@app.post("/api/admin/accounts/{account_id}/revoke-key")
async def admin_revoke_key(account_id: str, request: Request) -> JSONResponse:
    admin_context, forbidden = require_admin(request)
    if forbidden is not None:
        return forbidden
    rate_limited = sensitive_rate_limit_response(
        "POST /api/admin/accounts/{account_id}/revoke-key",
        request,
        user_id=safe_str(admin_context.get("user_id")),
        email=safe_str(admin_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    account = account_service.revoke_connection_key(account_id, reason="admin_revocation")
    if account is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    forget_live_account_snapshot(account.account_id)
    emit_audit_event(
        "revoke_key",
        context=admin_context,
        user_id=account.user_id,
        account_id=account.account_id,
        details={
            "source": "admin_accounts",
            "reason": "admin_revocation",
            "connection_key_preview": account.connection_key_preview or mask_connection_key(account.api_key),
        },
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": account.account_id,
            "status": account.status,
            "connection_key_revoked": True,
            "connection_key_revoked_at": account.connection_key_revoked_at.isoformat() if account.connection_key_revoked_at else "",
            "timestamp": now_iso(),
        },
    )


@app.post("/api/admin/accounts/{account_id}/archive")
async def admin_archive_account(account_id: str, request: Request) -> JSONResponse:
    admin_context, forbidden = require_admin(request)
    if forbidden is not None:
        return forbidden
    rate_limited = sensitive_rate_limit_response(
        "POST /api/admin/accounts/{account_id}/archive",
        request,
        user_id=safe_str(admin_context.get("user_id")),
        email=safe_str(admin_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    account = account_service.archive_account(account_id)
    if account is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    forget_live_account_snapshot(account.account_id)
    emit_audit_event(
        "archive_account",
        context=admin_context,
        user_id=account.user_id,
        account_id=account.account_id,
        details={
            "source": "admin_accounts",
            "status": account.status,
        },
    )
    return connector_json_response(
        {
            "ok": True,
            "account_id": account.account_id,
            "status": account.status,
            "archived_at": account.archived_at.isoformat() if account.archived_at else "",
            "timestamp": now_iso(),
        },
    )


@app.delete("/api/admin/accounts/{account_id}")
async def admin_delete_account(account_id: str, request: Request) -> JSONResponse:
    admin_context, forbidden = require_admin(request)
    if forbidden is not None:
        return forbidden
    rate_limited = sensitive_rate_limit_response(
        "DELETE /api/admin/accounts/{account_id}",
        request,
        user_id=safe_str(admin_context.get("user_id")),
        email=safe_str(admin_context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    account = account_service.delete_account(account_id)
    if account is None:
        return connector_json_response(
            {"ok": False, "reason": "account_not_found", "timestamp": now_iso()},
            status_code=404,
        )
    forget_live_account_snapshot(account.account_id)
    return connector_json_response(
        {
            "ok": True,
            "account_id": account.account_id,
            "deleted": True,
            "timestamp": now_iso(),
        },
    )


@app.post("/api/mt5/sync")
async def mt5_sync(request: Request) -> JSONResponse:
    sync_id = ""
    query_rejection = query_connection_key_rejection_response("/api/mt5/sync", request)
    if query_rejection is not None:
        return query_rejection

    payload, payload_error = await read_mt5_json_payload(request, "/api/mt5/sync", sync_id=sync_id)
    if payload_error is not None:
        return payload_error

    if not isinstance(payload, dict):
        log.error("SYNC payload is not an object | value_type=%s", type(payload).__name__)
        return sync_error_response(
            "invalid_payload_shape",
            {
                "section": "root",
                "field": "body",
                "problem": "expected_object",
                "value_type": type(payload).__name__,
            },
        )

    try:
        issues: list[dict[str, Any]] = []
        sync_id = resolve_sync_id(payload)
        connection_key = resolve_connection_key(payload, request)
        sanitized_account, account_issues = sanitize_account(payload.get("account"))
        sanitized_positions, position_issues = sanitize_positions(payload.get("positions"))
        sanitized_trades, trade_issues = sanitize_trades(payload.get("trades"))
        issues.extend(account_issues)
        issues.extend(position_issues)
        issues.extend(trade_issues)
        payload, sanitized_positions, sanitized_trades = bounded_mt5_sync_payload(
            payload,
            positions=sanitized_positions,
            trades=sanitized_trades,
            issues=issues,
        )

        bound_account = None
        unverified_identity = False
        auth_scope_user_id = ""
        if connection_key:
            rate_limited = connection_key_rate_limit_response("/api/mt5/sync", connection_key)
            if rate_limited is not None:
                return rate_limited
            try:
                bound_account = await account_store_io(
                    "connection_key_lookup",
                    resolve_account_by_connection_key,
                    connection_key,
                )
            except OSError as exc:
                if is_account_store_unavailable_exception(exc):
                    return mt5_account_store_unavailable_response(
                        "/api/mt5/sync",
                        exc,
                        operation="connection_key_lookup",
                        connection_key=connection_key,
                        sync_id=sync_id,
                    )
                raise
            log.info(
                "SYNC connection_key lookup | marker=%s key=%s lookup=get_account_by_api_key_any_user called=true found=%s account_id=%s user_id=%s status=%s",
                RUNTIME_SYNC_KEY_LOOKUP_MARKER,
                mask_connection_key(connection_key),
                bool(bound_account),
                bound_account.account_id if bound_account else "",
                bound_account.user_id if bound_account else "",
                bound_account.status if bound_account else "",
            )
            if bound_account is None:
                try:
                    is_revoked = await account_store_io(
                        "revoked_connection_key_lookup",
                        account_service.is_connection_key_revoked_any_user,
                        connection_key,
                    )
                except OSError as exc:
                    if is_account_store_unavailable_exception(exc):
                        return mt5_account_store_unavailable_response(
                            "/api/mt5/sync",
                            exc,
                            operation="revoked_connection_key_lookup",
                            connection_key=connection_key,
                            sync_id=sync_id,
                        )
                    raise
                if is_revoked:
                    return mt5_revoked_connection_key_response("/api/mt5/sync", connection_key, sync_id=sync_id)
                try:
                    bound_account = await account_store_io(
                        "connection_key_bootstrap",
                        bootstrap_account_for_sync,
                        connection_key,
                        sanitized_account,
                    )
                except OSError as exc:
                    if is_account_store_unavailable_exception(exc):
                        return mt5_account_store_unavailable_response(
                            "/api/mt5/sync",
                            exc,
                            operation="connection_key_bootstrap",
                            connection_key=connection_key,
                            sync_id=sync_id,
                        )
                    raise
                log.info(
                    "SYNC connection_key bootstrap | key=%s allowed=%s found=%s account_id=%s user_id=%s status=%s",
                    mask_connection_key(connection_key),
                    is_bootstrap_connection_key(connection_key),
                    bool(bound_account),
                    bound_account.account_id if bound_account else "",
                    bound_account.user_id if bound_account else "",
                    bound_account.status if bound_account else "",
                )
                if bound_account is None:
                    details = {
                        "field": "connection_key",
                        "problem": "unknown_connection_key",
                        "connection_key": mask_connection_key(connection_key),
                        "lookup": "get_account_by_api_key_any_user",
                        "bootstrap_allowed": is_bootstrap_connection_key(connection_key),
                        "has_login": bool(safe_str(sanitized_account.get("login"))),
                        "runtime_marker": RUNTIME_SYNC_KEY_LOOKUP_MARKER,
                    }
                    log.error("SYNC rejected | reason=unknown_connection_key details=%s", details)
                    log_connection_key_validation("/api/mt5/sync", connection_key, False)
                    emit_audit_event(
                        "mt5_sync_rejected",
                        status="rejected",
                        details={
                            **details,
                            "endpoint": "/api/mt5/sync",
                            "reason": "unknown_connection_key",
                            "sync_id": sync_id,
                        },
                    )
                    emit_mt5_reject_alert(
                        "unknown_connection_key",
                        endpoint="/api/mt5/sync",
                        severity="error",
                        details={
                            **details,
                            "sync_id": sync_id,
                        },
                    )
                    return connector_json_response(
                        {
                            "ok": False,
                            "received": False,
                            "sync_id": sync_id,
                            "disposition": "rejected",
                            "reason": "unknown_connection_key",
                            "error": "unknown_connection_key",
                            "details": details,
                            "timestamp": now_iso(),
                        },
                        status_code=401,
                    )
            log_connection_key_validation("/api/mt5/sync", connection_key, True)
        else:
            scoped_user_id, auth_context = resolve_account_scope(request)
            if scoped_user_id:
                auth_scope_user_id = scoped_user_id
                log.info(
                    "SYNC received without connection_key using authenticated bearer user=%s source=%s",
                    mask_connection_key(scoped_user_id),
                    auth_context.get("source", ""),
                )
            elif not _allow_no_key_mt5_ingest(request):
                return mt5_missing_connection_key_response("/api/mt5/sync", sync_id=sync_id)
            else:
                unverified_identity = True
                fallback_login = normalize_login(payload)
                log.warning("SYNC received without connection_key in local/dev mode, login=%s", fallback_login)

        login = normalize_login(payload)
        if not login and bound_account and safe_str(bound_account.login):
            login = safe_str(bound_account.login)
            sanitized_account["login"] = login
            log.info(
                "SYNC login fallback | source=bound_account sync_id=%s account_id=%s login=%s",
                sync_id,
                bound_account.account_id,
                login,
            )

        if not login:
            details = {
                "section": "account",
                "field": "account.login",
                "problem": "missing_required",
                "payload_sections": {
                    "has_account": isinstance(payload.get("account"), dict),
                    "has_top_level_login": payload.get("login") is not None,
                    "has_bound_account": bool(bound_account),
                },
                "issues": issues,
            }
            log.error("SYNC rejected | reason=missing_login details=%s", details)
            return sync_error_response("missing_login", details, sync_id=sync_id)

        connector_version = safe_str(payload.get("connector_version"), "unknown")
        sync_timestamp = safe_timestamp(payload.get("timestamp"))
        identity_key = resolve_identity_key(connection_key, _auth_identity_key(auth_scope_user_id, login) if auth_scope_user_id else login)
        persisted_state = load_persisted_account_state(connection_key, identity_key, bound_account)
        policy = build_connector_policy_response(identity_key, persisted_state)
        existing_receipt = get_processed_sync_receipt(sync_id)
        if existing_receipt:
            log.info(
                "SYNC duplicate | sync_id=%s login=%s original_received_at=%s",
                sync_id,
                login,
                existing_receipt.get("received_at", ""),
            )
            return connector_json_response(
                {
                    "ok": True,
                    "received": True,
                    "sync_id": sync_id,
                    "disposition": "duplicate",
                    "login": login,
                    "policy_hash": existing_receipt.get("policy_hash") or policy["policy_hash"],
                    "reason": "already_processed",
                    "error_code": None,
                    "details": {
                        "account_id": existing_receipt.get("account_id", ""),
                        "received_at": existing_receipt.get("received_at", ""),
                    },
                    **bandwidth_policy_payload(),
                    "timestamp": now_iso(),
                },
            )

        LAST_SYNC_BY_LOGIN[identity_key] = {
            "received_at": now_iso(),
            "sync_id": sync_id,
            "connection_key": connection_key,
            "mode": safe_str(payload.get("mode"), "unknown"),
            "connector_version": connector_version,
            "timestamp": sync_timestamp,
            "account": sanitized_account,
            "positions_count": len(sanitized_positions),
            "trades_count": len(sanitized_trades),
            "positions": sanitized_positions,
            "trades": sanitized_trades,
            "issues": issues,
            "raw": payload_without_connection_key(payload),
        }

        sync_user_id = bound_account.user_id if bound_account else (auth_scope_user_id or "local")
        previous_account = bound_account
        if previous_account is None:
            try:
                previous_account = await account_store_io(
                    "identity_account_lookup",
                    account_service.get_account_by_identity,
                    user_id=sync_user_id,
                    platform="mt5",
                    broker=safe_str(sanitized_account.get("broker"), "Unknown broker"),
                    server=safe_str(sanitized_account.get("server")),
                    login=login,
                )
            except OSError as exc:
                if is_account_store_unavailable_exception(exc):
                    return mt5_account_store_unavailable_response(
                        "/api/mt5/sync",
                        exc,
                        operation="identity_account_lookup",
                        connection_key=connection_key,
                        sync_id=sync_id,
                    )
                raise
        stored_payload = persisted_state or (previous_account.latest_payload if previous_account else {})
        equity_state = resolve_persisted_equity_state(
            payload=payload,
            account=sanitized_account,
            stored_payload=stored_payload,
        )
        payload = {
            **payload,
            "equity_peak": equity_state["equity_peak"],
            "daily_start_equity": equity_state["daily_start_equity"],
            "daily_start_day_key": equity_state["daily_start_day_key"],
        }
        effective_trades = merge_trade_sources(sanitized_trades, journal_trades_for_identity(identity_key))
        dashboard_payload = build_dashboard_account_payload(
            sanitized_account,
            sanitized_positions,
            effective_trades,
            payload,
            previous_account.latest_payload if previous_account else None,
        )
        dashboard_payload["equity_peak"] = equity_state["equity_peak"]
        dashboard_payload["daily_start_equity"] = equity_state["daily_start_equity"]
        dashboard_payload["daily_start_day_key"] = equity_state["daily_start_day_key"]
        dashboard_payload["last_sync_at"] = equity_state["last_sync_at"]
        dashboard_payload["connector_version"] = connector_version
        dashboard_payload["connectorVersion"] = connector_version
        if unverified_identity:
            dashboard_payload["identity_status"] = "unverified_identity"
        log.info(
            "SYNC equity peak persisted | connection_key=%s identity=%s stored_peak=%.2f incoming_peak=%.2f equity=%.2f resolved_peak=%.2f daily_start=%.2f",
            mask_connection_key(connection_key),
            mask_connection_key(identity_key) or identity_key,
            safe_float(stored_payload.get("equity_peak")) if isinstance(stored_payload, dict) else 0.0,
            safe_float(payload.get("equity_peak")),
            safe_float(sanitized_account.get("equity")),
            safe_float(equity_state["equity_peak"]),
            safe_float(equity_state["daily_start_equity"]),
        )
        log.info(
            "DASHBOARD payload built | account_id=%s login=%s balance=%.2f equity=%.2f open_pnl=%.2f closed_pnl=%.2f trades=%s history=%s positions=%s",
            previous_account.account_id if previous_account else (bound_account.account_id if bound_account else ""),
            login,
            safe_float(dashboard_payload.get("balance")),
            safe_float(dashboard_payload.get("equity")),
            safe_float(dashboard_payload.get("openPnl")),
            safe_float(dashboard_payload.get("closedPnl")),
            len(dashboard_payload.get("trades") or []),
            len(dashboard_payload.get("history") or []),
            len(dashboard_payload.get("positions") or []),
        )
        try:
            synced_account = await account_store_io(
                "connector_sync_persist",
                account_service.link_connector_sync,
                user_id=sync_user_id,
                account_info={
                    **sanitized_account,
                    "platform": "mt5",
                },
                payload=dashboard_payload,
                account_id=bound_account.account_id if bound_account else None,
                api_key=connection_key,
                nickname=bound_account.alias if bound_account else None,
            )
        except OSError as exc:
            if is_account_store_unavailable_exception(exc):
                return mt5_account_store_unavailable_response(
                    "/api/mt5/sync",
                    exc,
                    operation="connector_sync_persist",
                    connection_key=connection_key,
                    sync_id=sync_id,
                )
            raise
        remember_live_account_snapshot(synced_account)
        log.info(
            "ACCOUNT sync upsert | account_id=%s login=%s status=%s broker=%s server=%s last_sync_at=%s",
            synced_account.account_id,
            synced_account.login,
            synced_account.status,
            synced_account.broker,
            synced_account.server,
            synced_account.last_sync_at.isoformat() if synced_account.last_sync_at else "",
        )
        log.info(
            "RISK snapshot built | login=%s floating_dd=%.4f peak_to_equity_dd=%.4f open_risk=%.4f",
            login,
            dashboard_payload["riskSnapshot"]["summary"]["floating_drawdown_pct"],
            dashboard_payload["riskSnapshot"]["summary"]["peak_to_equity_drawdown_pct"],
            dashboard_payload["riskSnapshot"]["summary"]["total_open_risk_pct"],
        )

        if issues:
            log.warning(
                "SYNC accepted with issues | sync_id=%s login=%s connector_version=%s issues=%s",
                sync_id,
                login,
                connector_version,
                issues,
            )
        else:
            log.info(
                "SYNC accepted | sync_id=%s login=%s connector_version=%s positions=%s trades=%s",
                sync_id,
                login,
                connector_version,
                len(sanitized_positions),
                len(sanitized_trades),
            )

        remember_processed_sync(
            sync_id,
            login=login,
            account_id=synced_account.account_id,
            policy_hash=policy["policy_hash"],
        )

        return connector_json_response(
            {
                "ok": True,
                "received": True,
                "sync_id": sync_id,
                "disposition": "accepted",
                "login": login,
                "policy_hash": policy["policy_hash"],
                "reason": "accepted",
                "error_code": None,
                "details": {
                    "positions_count": len(sanitized_positions),
                    "trades_count": len(sanitized_trades),
                    "issues": issues,
                    "account_id": synced_account.account_id,
                },
                **bandwidth_policy_payload(),
                "timestamp": now_iso(),
            },
        )
    except Exception as exc:  # pragma: no cover
        details = {
            "section": "root",
            "field": "sync_handler",
            "problem": "unexpected_exception",
            "message": str(exc),
            "exception_type": type(exc).__name__,
            "traceback": traceback.format_exc(),
        }
        log.exception("SYNC unexpected failure | details=%s", details)
        return sync_error_response("unexpected_exception", details, sync_id=sync_id)


@app.post("/api/mt5/journal")
async def mt5_journal(request: Request) -> JSONResponse:
    batch_id = ""
    query_rejection = query_connection_key_rejection_response("/api/mt5/journal", request)
    if query_rejection is not None:
        return query_rejection

    payload, payload_error = await read_mt5_json_payload(request, "/api/mt5/journal", batch_id=batch_id)
    if payload_error is not None:
        return payload_error

    if not isinstance(payload, dict):
        return connector_json_response(
            {
                "ok": False,
                "received": False,
                "batch_id": batch_id,
                "disposition": "rejected",
                "reason": "invalid_payload_shape",
                "error_code": SYNC_ERROR_INVALID_PAYLOAD,
                "details": {"problem": "expected_object"},
                "timestamp": now_iso(),
            }
        )

    batch_id = safe_str(payload.get("batch_id"))
    connection_key = resolve_connection_key(payload, request)
    login = normalize_login(payload)
    auth_scope_user_id = ""
    if connection_key:
        rate_limited = connection_key_rate_limit_response("/api/mt5/journal", connection_key)
        if rate_limited is not None:
            return rate_limited
        try:
            bound_account = await account_store_io(
                "connection_key_lookup",
                resolve_account_by_connection_key,
                connection_key,
            )
        except OSError as exc:
            if is_account_store_unavailable_exception(exc):
                return mt5_account_store_unavailable_response(
                    "/api/mt5/journal",
                    exc,
                    operation="connection_key_lookup",
                    connection_key=connection_key,
                    batch_id=batch_id,
                )
            raise
        log.info(
            "JOURNAL connection_key lookup | marker=%s key=%s lookup=get_account_by_api_key_any_user called=true found=%s",
            RUNTIME_SYNC_KEY_LOOKUP_MARKER,
            mask_connection_key(connection_key),
            bool(bound_account),
        )
        if bound_account is None:
            try:
                is_revoked = await account_store_io(
                    "revoked_connection_key_lookup",
                    account_service.is_connection_key_revoked_any_user,
                    connection_key,
                )
            except OSError as exc:
                if is_account_store_unavailable_exception(exc):
                    return mt5_account_store_unavailable_response(
                        "/api/mt5/journal",
                        exc,
                        operation="revoked_connection_key_lookup",
                        connection_key=connection_key,
                        batch_id=batch_id,
                    )
                raise
            if is_revoked:
                return mt5_revoked_connection_key_response("/api/mt5/journal", connection_key, batch_id=batch_id)
            log_connection_key_validation("/api/mt5/journal", connection_key, False)
            return connector_json_response(
                {
                    "ok": False,
                    "received": False,
                    "batch_id": batch_id,
                    "disposition": "rejected",
                    "reason": "unknown_connection_key",
                    "error": "unknown_connection_key",
                    "details": {
                        "field": "connection_key",
                        "problem": "unknown_connection_key",
                        "connection_key": mask_connection_key(connection_key),
                        "lookup": "get_account_by_api_key_any_user",
                        "runtime_marker": RUNTIME_SYNC_KEY_LOOKUP_MARKER,
                    },
                    "timestamp": now_iso(),
                },
                status_code=401,
            )
        log_connection_key_validation("/api/mt5/journal", connection_key, True)
    else:
        scoped_user_id, _auth_context = resolve_account_scope(request)
        if scoped_user_id:
            auth_scope_user_id = scoped_user_id
        elif not _allow_no_key_mt5_ingest(request):
            return mt5_missing_connection_key_response("/api/mt5/journal", batch_id=batch_id)

    identity_key = resolve_identity_key(connection_key, _auth_identity_key(auth_scope_user_id, login) if auth_scope_user_id else login)
    if not batch_id or not identity_key:
        return connector_json_response(
            {
                "ok": False,
                "received": False,
                "batch_id": batch_id,
                "disposition": "rejected",
                "reason": "missing_identity_or_batch",
                "error_code": SYNC_ERROR_INVALID_PAYLOAD,
                "details": {"batch_id": batch_id, "identity_key": identity_key},
                "timestamp": now_iso(),
            }
        )

    existing_receipt = get_processed_journal_receipt(batch_id)
    if existing_receipt:
        return connector_json_response(
            {
                "ok": True,
                "received": True,
                "batch_id": batch_id,
                "disposition": "duplicate",
                "reason": "already_processed",
                "error_code": None,
                "details": {
                    "trade_count": existing_receipt.get("trade_count", 0),
                    "received_at": existing_receipt.get("received_at", ""),
                },
                "timestamp": now_iso(),
            }
        )

    trades, trade_issues = sanitize_trades(payload.get("trades"))
    remember_journal_trades(identity_key, trades)
    remember_processed_journal(batch_id, identity_key=identity_key, trade_count=len(trades))
    log.info("JOURNAL accepted | batch_id=%s identity=%s trades=%s issues=%s", batch_id, mask_connection_key(identity_key) or identity_key, len(trades), trade_issues)
    return connector_json_response(
        {
            "ok": True,
            "received": True,
            "batch_id": batch_id,
            "disposition": "accepted",
            "reason": "accepted",
            "error_code": None,
            "details": {
                "trade_count": len(trades),
                "issues": trade_issues,
            },
            "timestamp": now_iso(),
        }
    )


@app.get("/api/mt5/policy")
async def mt5_policy(
    request: Request,
    login: str = Query("", min_length=0),
) -> JSONResponse:
    normalized_login = safe_str(login)
    query_rejection = query_connection_key_rejection_response("/api/mt5/policy", request)
    if query_rejection is not None:
        return query_rejection
    normalized_connection_key = resolve_connection_key({}, request)
    identity_key = resolve_identity_key(normalized_connection_key, normalized_login)
    if not normalized_connection_key:
        scoped_user_id, _auth_context = resolve_account_scope(request)
        if scoped_user_id:
            identity_key = resolve_identity_key("", _auth_identity_key(scoped_user_id, normalized_login))
        elif not _allow_no_key_mt5_ingest(request):
            return mt5_missing_connection_key_response("/api/mt5/policy")
    if not identity_key:
        return connector_json_response({
            "ok": False,
            "reason": "missing_identity",
            "error_code": 4001,
            "details": {"field": "connection_key|login", "problem": "one identity value is required"},
            "timestamp": now_iso(),
        })

    bound_account = None
    if normalized_connection_key:
        rate_limited = connection_key_rate_limit_response("/api/mt5/policy", normalized_connection_key)
        if rate_limited is not None:
            return rate_limited
        try:
            bound_account = await account_store_io(
                "connection_key_lookup",
                resolve_account_by_connection_key,
                normalized_connection_key,
            )
        except OSError as exc:
            if is_account_store_unavailable_exception(exc):
                return mt5_account_store_unavailable_response(
                    "/api/mt5/policy",
                    exc,
                    operation="connection_key_lookup",
                    connection_key=normalized_connection_key,
                )
            raise
        log.info(
            "POLICY connection_key lookup | marker=%s key=%s lookup=get_account_by_api_key_any_user called=true found=%s",
            RUNTIME_SYNC_KEY_LOOKUP_MARKER,
            mask_connection_key(normalized_connection_key),
            bool(bound_account),
        )
        if bound_account is None:
            try:
                is_revoked = await account_store_io(
                    "revoked_connection_key_lookup",
                    account_service.is_connection_key_revoked_any_user,
                    normalized_connection_key,
                )
            except OSError as exc:
                if is_account_store_unavailable_exception(exc):
                    return mt5_account_store_unavailable_response(
                        "/api/mt5/policy",
                        exc,
                        operation="revoked_connection_key_lookup",
                        connection_key=normalized_connection_key,
                    )
                raise
            if is_revoked:
                return mt5_revoked_connection_key_response("/api/mt5/policy", normalized_connection_key)
            log_connection_key_validation("/api/mt5/policy", normalized_connection_key, False)
            return connector_json_response(
                {
                    "ok": False,
                    "reason": "unknown_connection_key",
                    "error": "unknown_connection_key",
                    "details": {
                        "field": "connection_key",
                        "problem": "unknown_connection_key",
                        "connection_key": mask_connection_key(normalized_connection_key),
                        "lookup": "get_account_by_api_key_any_user",
                        "runtime_marker": RUNTIME_SYNC_KEY_LOOKUP_MARKER,
                    },
                    "timestamp": now_iso(),
                },
                status_code=401,
            )
        log_connection_key_validation("/api/mt5/policy", normalized_connection_key, True)
        try:
            await account_store_io(
                "policy_access_persist",
                account_service.record_policy_access,
                bound_account.account_id,
            )
        except OSError as exc:
            if not is_account_store_unavailable_exception(exc):
                raise
            log.warning(
                "Policy access persistence skipped | reason=account_store_unavailable account_id=%s error_type=%s",
                bound_account.account_id,
                type(exc).__name__,
            )

    persisted_state = load_persisted_account_state(normalized_connection_key, identity_key, bound_account)
    policy = build_connector_policy_response(identity_key, persisted_state)
    log.info(
        "Policy requested | identity=%s hash=%s equity_peak=%.2f daily_start_equity=%.2f",
        mask_connection_key(identity_key) or identity_key,
        policy["policy_hash"],
        safe_float(policy.get("equity_peak")),
        safe_float(policy.get("daily_start_equity")),
    )
    return connector_json_response(policy)


@app.get("/api/accounts/snapshot")
async def accounts_snapshot(
    request: Request,
    view: str = Query("full", pattern="^(full|summary)$"),
) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        snapshot = empty_accounts_payload(auth_context)
        log.info("Accounts snapshot denied closed | reason=auth_required")
        return connector_json_response(snapshot)
    access_denial = live_accounts_access_denial(auth_context)
    if access_denial is not None:
        log.info(
            "Accounts snapshot denied closed | reason=%s scope_user_id=%s plan=%s access=%s",
            access_denial.get("reason", ""),
            scope_user_id,
            ensure_dict(access_denial.get("details")).get("effective_plan", ""),
            ensure_dict(access_denial.get("details")).get("billing_access", ""),
        )
        return connector_json_response(billing_blocked_accounts_payload(auth_context, access_denial))
    allowed_connection_keys = admin_launcher_connection_keys_for_context(auth_context)
    normalized_view = str(view or "full").lower() if isinstance(view, str) else "full"
    guard_mode = str(bandwidth_guard_snapshot().get("mode") or "normal")
    if (
        normalized_view == "full"
        and guard_mode in {"saving", "critical", "hard"}
        and not preview_bearer_full_snapshot_allowed(auth_context)
    ):
        log.warning(
            "Accounts snapshot downgraded | reason=bandwidth_guard requested=full served=summary mode=%s",
            guard_mode,
        )
        normalized_view = "summary"
    summary_only = normalized_view == "summary"
    cache_status = "bypass"
    if summary_only:
        cache_key = accounts_summary_snapshot_cache_key(scope_user_id, allowed_connection_keys)
        cached_snapshot = cached_accounts_summary_snapshot(cache_key)
        if cached_snapshot is not None:
            snapshot = cached_snapshot
            cache_status = "hit"
        else:
            snapshot = build_live_accounts_snapshot(
                scope_user_id,
                allowed_connection_keys=allowed_connection_keys,
                summary_only=True,
            )
            remember_accounts_summary_snapshot(cache_key, snapshot)
            cache_status = "miss"
    else:
        snapshot = build_live_accounts_snapshot(
            scope_user_id,
            allowed_connection_keys=allowed_connection_keys,
            summary_only=False,
        )
    snapshot["is_admin"] = auth_context["is_admin"]
    snapshot["auth_email"] = auth_context["email"]
    snapshot["scope_user_id"] = scope_user_id
    snapshot["admin_launcher_bridge"] = bool(allowed_connection_keys)
    log.info(
        "Accounts snapshot built | scope_user_id=%s accounts=%s active_account_id=%s view=%s cache=%s",
        scope_user_id,
        len(snapshot.get("accounts") or []),
        snapshot.get("active_account_id") or "",
        normalized_view,
        cache_status,
    )
    if summary_only:
        etag_seed = "|".join(
            [
                safe_str(snapshot.get("updated_at")),
                safe_str(scope_user_id),
                "1" if bool(snapshot.get("is_admin")) else "0",
                safe_str(snapshot.get("auth_email")),
                "1" if bool(snapshot.get("admin_launcher_bridge")) else "0",
                safe_str(snapshot.get("active_account_id")),
                str(len(snapshot.get("accounts") or [])),
            ]
        )
        etag = hashlib.sha256(etag_seed.encode("utf-8")).hexdigest()[:32]
        etag_header = f'W/"{etag}"'
        response_headers = {
            "Connection": "close",
            # Allow per-user revalidation to reduce egress on frequent polling.
            "Cache-Control": "private, max-age=0, must-revalidate",
            "ETag": etag_header,
            "Vary": "Authorization",
        }
        if safe_str(request.headers.get("if-none-match")) == etag_header:
            return Response(status_code=304, headers=response_headers)
        return JSONResponse(status_code=200, content=snapshot, headers=response_headers)

    return connector_json_response(snapshot)


@app.get("/api/billing/status")
async def billing_status(request: Request) -> JSONResponse:
    context = build_admin_context(request)
    payload = billing_status_payload_for_context(context)
    log.info(
        "Billing status built | scope_user_id=%s plan=%s status=%s access=%s",
        payload.get("scope_user_id") or "",
        ensure_dict(payload.get("billing")).get("plan") or "",
        ensure_dict(payload.get("billing")).get("status") or "",
        ensure_dict(payload.get("billing")).get("access") or "",
    )
    return no_store_json_response(payload)


@app.post("/api/billing/checkout")
async def billing_checkout(request: Request) -> JSONResponse:
    payload, payload_error = await read_json_object_payload(request, "/api/billing/checkout")
    if payload_error is not None:
        return payload_error
    context, denial = billing_user_context(request)
    if denial is not None:
        return denial
    if not kmfx_feature_enabled("billing", default=True):
        return feature_disabled_response("billing")
    rate_limited = sensitive_rate_limit_response(
        "/api/billing/checkout",
        request,
        user_id=safe_str(context.get("user_id")),
        email=safe_str(context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    plan = normalize_plan_key(payload.get("plan") or payload.get("plan_key") or payload.get("planKey") or "pro")
    interval = safe_str(payload.get("interval") or payload.get("cadence") or "monthly").lower()
    if interval not in {"monthly", "yearly"}:
        return billing_json_response({"ok": False, "reason": "invalid_interval", "error": "invalid_interval"}, status_code=400)
    if plan not in {"core", "pro", "unlimited"}:
        return billing_json_response({"ok": False, "reason": "invalid_plan", "error": "invalid_plan"}, status_code=400)

    try:
        customer_id = ensure_billing_customer(context)
        user_id = safe_str(context.get("user_id")).lower()
        email = safe_str(context.get("email")).lower()
        price_reference = resolve_stripe_price_reference(plan, interval)
        existing_subscription = existing_kmfx_subscription_for_checkout(context, customer_id)
        if existing_subscription:
            existing_subscription_id = safe_str(existing_subscription.get("stripe_subscription_id"))
            existing_price_id = safe_str(existing_subscription.get("stripe_price_id"))
            if existing_subscription_id and existing_price_id and existing_price_id != price_reference["price_id"]:
                updated_subscription = stripe_change_kmfx_subscription_price(
                    existing_subscription_id,
                    price_id=price_reference["price_id"],
                    user_id=user_id,
                    email=email,
                )
                updated_row = stripe_subscription_to_billing_row(updated_subscription, user_id=user_id)
                return billing_json_response(
                    {
                        "ok": True,
                        "reason": "subscription_updated",
                        "message": "Plan actualizado correctamente.",
                        "billing": billing_subscription_payload(updated_row),
                    }
                )
            existing_status = safe_str(existing_subscription.get("status")).lower()
            return billing_json_response(
                {
                    "ok": True,
                    "reason": "subscription_unchanged",
                    "message": "Ya estás en este plan.",
                    "billing": {
                        "plan": normalize_plan_key(existing_subscription.get("plan_key")),
                        "status": existing_status,
                        "currentPeriodEndsAt": safe_str(existing_subscription.get("current_period_end")),
                        "trialEndsAt": safe_str(existing_subscription.get("trial_end")),
                        "cancelAtPeriodEnd": bool(existing_subscription.get("cancel_at_period_end")),
                        "displayName": PLAN_DISPLAY_NAMES.get(normalize_plan_key(existing_subscription.get("plan_key")), PLAN_DISPLAY_NAMES["free"]),
                    },
                }
            )
        checkout_metadata = {
            "app": "kmfx_edge",
            "kmfx_user_id": user_id,
            "user_id": user_id,
            "kmfx_user_email": email,
            "user_email": email,
            "kmfx_plan": plan,
            "plan_key": plan,
            "kmfx_interval": interval,
            "interval": interval,
            "stripe_lookup_key": price_reference.get("lookup_key") or "",
            "price_lookup_key": price_reference.get("lookup_key") or "",
        }
        subscription_data: dict[str, Any] = {
            "metadata": {
                "app": "kmfx_edge",
                "kmfx_user_id": user_id,
                "user_id": user_id,
                "kmfx_user_email": email,
                "user_email": email,
                "kmfx_plan": plan,
                "plan_key": plan,
                "kmfx_interval": interval,
                "interval": interval,
            },
        }
        trial_days = billing_trial_period_days()
        if trial_days > 0:
            subscription_data["trial_period_days"] = trial_days
            if not billing_trial_requires_card():
                subscription_data["trial_settings"] = {
                    "end_behavior": {
                        "missing_payment_method": "pause",
                    }
                }
        checkout_params: dict[str, Any] = {
            "mode": "subscription",
            "customer": customer_id,
            "client_reference_id": user_id,
            "success_url": billing_safe_return_url(payload.get("success_url") or payload.get("successUrl"), billing_success_url()),
            "cancel_url": billing_safe_return_url(payload.get("cancel_url") or payload.get("cancelUrl"), billing_cancel_url()),
            "allow_promotion_codes": _env_flag("STRIPE_ALLOW_PROMOTION_CODES", default=True),
            "line_items": [
                {
                    "price": price_reference["price_id"],
                    "quantity": 1,
                }
            ],
            "metadata": checkout_metadata,
            "subscription_data": subscription_data,
        }
        if trial_days > 0 and not billing_trial_requires_card():
            checkout_params["payment_method_collection"] = "if_required"
        session = stripe_api_request(
            "POST",
            "/checkout/sessions",
            checkout_params,
            idempotency_key=stripe_idempotency_key("kmfx_checkout", user_id, plan, interval),
        )
    except ValueError as exc:
        return billing_json_response({"ok": False, "reason": safe_str(exc) or "invalid_request", "error": safe_str(exc) or "invalid_request"}, status_code=400)
    except RuntimeError as exc:
        reason = safe_str(exc) or "billing_checkout_failed"
        status_code = 503 if reason in {"stripe_not_configured", "supabase_service_role_not_configured", "price_not_configured"} else 502
        return billing_json_response({"ok": False, "reason": reason, "error": reason}, status_code=status_code)

    checkout_url = safe_str(session.get("url"))
    if not checkout_url:
        return billing_json_response({"ok": False, "reason": "stripe_checkout_url_missing", "error": "stripe_checkout_url_missing"}, status_code=502)
    return billing_json_response(
        {
            "ok": True,
            "checkout_url": checkout_url,
            "url": checkout_url,
            "session_id": safe_str(session.get("id")),
            "plan": plan,
            "interval": interval,
        }
    )


@app.post("/api/billing/portal")
async def billing_portal(request: Request) -> JSONResponse:
    payload, payload_error = await read_json_object_payload(request, "/api/billing/portal")
    if payload_error is not None:
        return payload_error
    context, denial = billing_user_context(request)
    if denial is not None:
        return denial
    if not kmfx_feature_enabled("billing", default=True):
        return feature_disabled_response("billing")
    rate_limited = sensitive_rate_limit_response(
        "/api/billing/portal",
        request,
        user_id=safe_str(context.get("user_id")),
        email=safe_str(context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited
    try:
        customer_id = ensure_billing_customer(context)
        existing_subscription = existing_kmfx_subscription_for_checkout(context, customer_id)
        portal_customer_id = safe_str(existing_subscription.get("stripe_customer_id")) or customer_id
    except RuntimeError as exc:
        reason = safe_str(exc) or "billing_customer_failed"
        status_code = 503 if reason in {"stripe_not_configured", "supabase_service_role_not_configured"} else 502
        return billing_json_response({"ok": False, "reason": reason, "error": reason}, status_code=status_code)
    try:
        session = stripe_create_billing_portal_session(
            portal_customer_id,
            billing_safe_return_url(payload.get("return_url") or payload.get("returnUrl"), f"{billing_public_app_url()}/ajustes"),
        )
    except RuntimeError as exc:
        reason = safe_str(exc) or "billing_portal_failed"
        status_code = 503 if reason in {"stripe_not_configured", "supabase_service_role_not_configured"} else 502
        return billing_json_response({"ok": False, "reason": reason, "error": reason}, status_code=status_code)

    portal_url = safe_str(session.get("url"))
    if not portal_url:
        return billing_json_response({"ok": False, "reason": "stripe_portal_url_missing", "error": "stripe_portal_url_missing"}, status_code=502)
    return billing_json_response(
        {
            "ok": True,
            "portal_url": portal_url,
            "url": portal_url,
            "session_id": safe_str(session.get("id")),
        }
    )


@app.post("/api/billing/subscription")
async def billing_subscription_action(request: Request) -> JSONResponse:
    payload, payload_error = await read_json_object_payload(request, "/api/billing/subscription")
    if payload_error is not None:
        return payload_error
    context, denial = billing_user_context(request)
    if denial is not None:
        return denial
    if not kmfx_feature_enabled("billing", default=True):
        return feature_disabled_response("billing")
    rate_limited = sensitive_rate_limit_response(
        "/api/billing/subscription",
        request,
        user_id=safe_str(context.get("user_id")),
        email=safe_str(context.get("email")),
    )
    if rate_limited is not None:
        return rate_limited

    action = safe_str(payload.get("action")).lower()
    if action not in {"cancel", "resume"}:
        return billing_json_response({"ok": False, "reason": "invalid_action", "error": "invalid_action"}, status_code=400)

    try:
        customer_id = ensure_billing_customer(context)
        user_id = safe_str(context.get("user_id")).lower()
        email = safe_str(context.get("email")).lower()
        existing_subscription = billing_manageable_subscription(context, customer_id)
        subscription_id = safe_str(existing_subscription.get("stripe_subscription_id"))
        if not subscription_id:
            return billing_json_response({"ok": False, "reason": "subscription_not_found", "error": "subscription_not_found"}, status_code=404)
        updated_subscription = stripe_update_subscription(
            subscription_id,
            {"cancel_at_period_end": action == "cancel"},
            idempotency_key=stripe_idempotency_key("kmfx_subscription_action", user_id, subscription_id, action),
        )
        sync_billing_subscription(updated_subscription, user_id=user_id, email=email)
        updated_row = stripe_subscription_to_billing_row(updated_subscription, user_id=user_id)
    except RuntimeError as exc:
        reason = safe_str(exc) or "billing_subscription_update_failed"
        status_code = 503 if reason in {"stripe_not_configured", "supabase_service_role_not_configured"} else 502
        return billing_json_response({"ok": False, "reason": reason, "error": reason}, status_code=status_code)

    plan_key = normalize_plan_key(updated_row.get("plan_key") or existing_subscription.get("plan_key"))
    email_result: dict[str, Any] = {}
    if email:
        if action == "cancel":
            email_result = send_subscription_cancel_scheduled_email(
                email=email,
                plan=plan_key,
                event_id="manual_subscription_action_cancel",
            )
        else:
            email_result = send_subscription_reactivated_email(
                email=email,
                plan=plan_key,
                event_id="manual_subscription_action_resume",
            )

    return billing_json_response(
        {
            "ok": True,
            "action": action,
            "message": "Cancelación programada correctamente." if action == "cancel" else "La renovación automática vuelve a estar activa.",
            "billing": billing_subscription_payload(updated_row),
            "email": email_result,
        }
    )


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request) -> JSONResponse:
    raw_body = await request.body()
    signature = safe_str(request.headers.get("stripe-signature") or request.headers.get("Stripe-Signature"))
    secret = stripe_webhook_secret()
    if not verify_stripe_webhook_signature(raw_body, signature, secret):
        log.warning("Stripe webhook rejected | reason=invalid_signature")
        return billing_json_response({"ok": False, "reason": "invalid_signature", "error": "invalid_signature"}, status_code=400)
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return billing_json_response({"ok": False, "reason": "invalid_payload", "error": "invalid_payload"}, status_code=400)
    if not isinstance(event, dict):
        return billing_json_response({"ok": False, "reason": "invalid_payload", "error": "invalid_payload"}, status_code=400)

    event_id = safe_str(event.get("id"))
    try:
        should_process = record_billing_event_once(event)
    except RuntimeError as exc:
        reason = safe_str(exc) or "billing_event_record_failed"
        status_code = 503 if reason == "supabase_service_role_not_configured" else 502
        emit_operational_alert(
            "billing_webhook_failed",
            severity="error",
            details={
                "stage": "record_event",
                "reason": reason,
                "event_id": event_id,
                "event_type": safe_str(event.get("type")),
            },
        )
        return billing_json_response({"ok": False, "reason": reason, "error": reason}, status_code=status_code)
    if not should_process:
        return billing_json_response({"ok": True, "duplicate": True, "event_id": event_id})

    try:
        result = process_stripe_billing_event(event)
        if result.get("ignored"):
            mark_billing_event_status(event_id, "ignored")
        else:
            mark_billing_event_status(event_id, "processed")
    except Exception as exc:
        if _is_idempotent_conflict_error(exc):
            log.warning("Stripe webhook idempotent conflict | event_id=%s type=%s", event_id, safe_str(event.get("type")))
            try:
                mark_billing_event_status(event_id, "processed", "idempotent_conflict")
            except Exception:
                log.warning("Stripe webhook conflict status update failed | event_id=%s", event_id)
            return billing_json_response(
                {
                    "ok": True,
                    "event_id": event_id,
                    "event_type": safe_str(event.get("type")),
                    "conflict": True,
                }
            )
        log.exception("Stripe webhook processing failed | event_id=%s type=%s", event_id, safe_str(event.get("type")))
        emit_operational_alert(
            "billing_webhook_failed",
            severity="critical",
            details={
                "stage": "process_event",
                "reason": "webhook_processing_failed",
                "event_id": event_id,
                "event_type": safe_str(event.get("type")),
                "error_type": type(exc).__name__,
            },
        )
        try:
            mark_billing_event_status(event_id, "failed", safe_str(exc))
        except Exception:
            log.warning("Stripe webhook failed status update failed | event_id=%s", event_id)
        return billing_json_response({"ok": False, "reason": "webhook_processing_failed", "error": "webhook_processing_failed"}, status_code=500)

    return billing_json_response(
        {
            "ok": True,
            "event_id": event_id,
            "event_type": safe_str(event.get("type")),
            "result": result,
        }
    )


@app.post("/api/backtests/mt5/import")
async def import_mt5_strategy_tester_reports(request: Request) -> JSONResponse:
    payload, payload_error = await read_json_object_payload(request, "/api/backtests/mt5/import")
    if payload_error is not None:
        return payload_error

    starting_equity = safe_float(payload.get("starting_equity") or payload.get("startingEquity"), 100_000.0)
    min_real_trades = int(safe_float(payload.get("min_real_trades") or payload.get("minRealTrades"), 30))
    min_backtest_trades = int(safe_float(payload.get("min_backtest_trades") or payload.get("minBacktestTrades"), 100))
    raw_reports = payload.get("reports")
    if isinstance(raw_reports, list):
        report_inputs = [item for item in raw_reports if isinstance(item, dict)]
    else:
        report_inputs = [
            {
                "content": payload.get("content") or payload.get("report") or payload.get("text"),
                "filename": payload.get("filename") or payload.get("name"),
                "strategy": payload.get("strategy") or payload.get("strategy_name"),
            }
        ]

    backtests = parse_mt5_strategy_tester_reports(
        report_inputs,
        starting_equity=starting_equity,
        imported_at=now_iso(),
    )
    response: dict[str, Any] = {
        "ok": True,
        "imported_count": len(backtests),
        "backtests": backtests,
        "timestamp": now_iso(),
    }

    account_id = safe_str(payload.get("account_id") or payload.get("accountId"))
    compare_requested = bool(payload.get("compare")) or bool(account_id)
    if not compare_requested:
        return connector_json_response(response)

    real_trades = payload.get("real_trades") if isinstance(payload.get("real_trades"), list) else []
    if real_trades:
        response["comparison"] = build_backtest_vs_real_report(
            backtests=backtests,
            real_trades=real_trades,
            starting_equity=starting_equity,
            min_real_trades=min_real_trades,
            min_backtest_trades=min_backtest_trades,
        )
        return connector_json_response(response)

    if not account_id:
        response["comparison"] = build_backtest_vs_real_report(
            backtests=backtests,
            real_trades=[],
            starting_equity=starting_equity,
            min_real_trades=min_real_trades,
            min_backtest_trades=min_backtest_trades,
        )
        return connector_json_response(response)

    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "auth_required": True,
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    allowed_connection_keys = admin_launcher_connection_keys_for_context(auth_context)
    snapshot = build_live_accounts_snapshot(scope_user_id, allowed_connection_keys=allowed_connection_keys)
    account_entry = find_scoped_account_entry(snapshot, account_id)
    if account_entry is None:
        return connector_json_response(
            {
                "ok": False,
                "reason": "account_not_found",
                "account_id": account_id,
                "timestamp": now_iso(),
            },
            status_code=404,
        )

    comparison = build_backtest_vs_real_for_account_entry(
        account_entry,
        backtests,
        starting_equity=starting_equity,
        min_real_trades=min_real_trades,
        min_backtest_trades=min_backtest_trades,
    )
    response["comparison"] = comparison["report"]
    response["account_id"] = comparison["account_id"]
    return connector_json_response(response)


@app.get("/api/accounts/{account_id}/ai-evidence-report")
async def account_ai_evidence_report(
    account_id: str,
    request: Request,
    format: str = Query("bundle", pattern="^(bundle|markdown|json)$"),
) -> JSONResponse:
    scope_user_id, auth_context = resolve_account_scope(request)
    if not scope_user_id:
        return connector_json_response(
            {
                "ok": False,
                "reason": "auth_required",
                "auth_required": True,
                "timestamp": now_iso(),
            },
            status_code=401,
        )
    if not kmfx_feature_enabled("exports", default=True):
        return feature_disabled_response("exports")
    entitlement_denial = product_entitlement_denial(context=auth_context, entitlement="exports")
    if entitlement_denial is not None:
        return entitlement_denial

    allowed_connection_keys = admin_launcher_connection_keys_for_context(auth_context)
    snapshot = build_live_accounts_snapshot(scope_user_id, allowed_connection_keys=allowed_connection_keys)
    account_entry = find_scoped_account_entry(snapshot, account_id)
    if account_entry is None:
        return connector_json_response(
            {
                "ok": False,
                "reason": "account_not_found",
                "account_id": safe_str(account_id),
                "timestamp": now_iso(),
            },
            status_code=404,
        )

    report = build_ai_evidence_report_for_account_entry(account_entry)
    if format == "markdown":
        return connector_json_response(
            {
                "ok": True,
                "account_id": report["account_id"],
                "generated_at": report["generated_at"],
                "report_type": report["report_type"],
                "schema_version": report["schema_version"],
                "markdown": report["markdown"],
            }
        )
    if format == "json":
        return connector_json_response(
            {
                "ok": True,
                "account_id": report["account_id"],
                "generated_at": report["generated_at"],
                "report_type": report["report_type"],
                "schema_version": report["schema_version"],
                "pack": report["pack"],
                "json": report["json"],
            }
        )
    return connector_json_response(report)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("kmfx_connector_api:app", host="0.0.0.0", port=port, reload=False)
