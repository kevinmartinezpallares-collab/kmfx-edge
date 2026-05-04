from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


DEFAULT_DIRECT_MT5_SERVERS: tuple[dict[str, Any], ...] = (
    {"broker": "4xCube", "servers": ["4xCube-MT5"]},
    {"broker": "AxiCorp Financial Services Pty Ltd", "servers": ["Axi-US50-Demo", "Axi-US50-Live", "Axi-US51-Live"]},
    {"broker": "Darwinex", "servers": ["Darwinex-Demo", "Darwinex-Live"]},
    {"broker": "Equitex Capital Limited", "servers": ["BullWaves-Live"]},
    {"broker": "Equity Edge Ltd.", "servers": ["EquityEdge-Trade"]},
    {"broker": "Exness Technologies Ltd", "servers": ["Exness-MT5Real", "Exness-MT5Trial"]},
    {"broker": "FTMO", "servers": ["FTMO-Server", "FTMO-Server2", "FTMO-Server3", "FTMO-Server4", "FTMO-Server5", "FTMO-Demo", "FTMO-Demo2"]},
    {"broker": "FundedNext", "servers": ["FundedNext-Server", "FundedNext-Server 2", "FundedNext-Server 3", "FundedNext-Server 4"]},
    {"broker": "FundingPips", "servers": ["FundingPips-SIM", "FundingPips2-SIM"]},
    {"broker": "HF Markets (SV) Ltd", "servers": ["HFMarketsGlobal-Live5"]},
    {"broker": "IC Markets Raw Trading Ltd", "servers": ["ICMarketsSC-MT5", "ICMarketsSC-MT5-2", "ICMarketsSC-MT5-4", "ICMarketsSC-Demo"]},
    {"broker": "Neomaaa Ltd", "servers": ["Neomaaa-Live"]},
)


def _env_value(*names: str) -> str:
    for name in names:
        value = str(os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _safe_text(value: Any, fallback: str = "") -> str:
    text = str(value if value is not None else "").strip()
    return text or fallback


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed == parsed and parsed not in (float("inf"), float("-inf")) else fallback


def _ensure_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _ensure_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def infer_broker_from_server(server: str) -> str:
    normalized = _safe_text(server)
    if not normalized:
        return ""
    for group in DEFAULT_DIRECT_MT5_SERVERS:
        if normalized in group.get("servers", []):
            return _safe_text(group.get("broker"))
    if "-" in normalized:
        return normalized.split("-", 1)[0]
    return normalized


def list_direct_mt5_servers(query: str = "", limit: int = 160) -> list[dict[str, str]]:
    needle = _safe_text(query).lower()
    max_items = max(1, min(int(limit or 160), 500))
    rows: list[dict[str, str]] = []
    for group in DEFAULT_DIRECT_MT5_SERVERS:
        broker = _safe_text(group.get("broker"))
        for server in group.get("servers", []):
            label = _safe_text(server)
            haystack = f"{broker} {label}".lower()
            if needle and needle not in haystack:
                continue
            rows.append({"broker": broker, "server": label, "label": label})
            if len(rows) >= max_items:
                return rows
    return rows


class DirectMt5ProviderError(Exception):
    def __init__(
        self,
        reason: str,
        message: str,
        *,
        status_code: int = 502,
        retryable: bool = False,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.details = details or {}


class DirectMt5ProviderUnavailable(DirectMt5ProviderError):
    def __init__(self, message: str = "Direct MT5 provider is not configured.") -> None:
        super().__init__(
            "direct_mt5_provider_unavailable",
            message,
            status_code=503,
            retryable=False,
        )


@dataclass(frozen=True)
class DirectMt5ProviderStatus:
    name: str
    configured: bool
    mode: str


class BaseDirectMt5Provider:
    name = "disabled"

    def status(self) -> DirectMt5ProviderStatus:
        return DirectMt5ProviderStatus(name=self.name, configured=False, mode="disabled")

    def link_account(self, credentials: dict[str, str]) -> dict[str, Any]:
        raise DirectMt5ProviderUnavailable()


class DisabledDirectMt5Provider(BaseDirectMt5Provider):
    name = "disabled"


class FixtureDirectMt5Provider(BaseDirectMt5Provider):
    name = "fixture"

    def status(self) -> DirectMt5ProviderStatus:
        return DirectMt5ProviderStatus(name=self.name, configured=True, mode="fixture")

    def link_account(self, credentials: dict[str, str]) -> dict[str, Any]:
        login = _safe_text(credentials.get("login"))
        server = _safe_text(credentials.get("server"))
        password = _safe_text(credentials.get("password"))
        if not login or not server or not password:
            raise DirectMt5ProviderError("invalid_direct_mt5_credentials", "Login, server and password are required.", status_code=400)
        if password.lower() in {"bad", "invalid", "wrong"}:
            raise DirectMt5ProviderError("invalid_direct_mt5_credentials", "MT5 rejected the provided credentials.", status_code=401)

        broker = _safe_text(credentials.get("broker")) or infer_broker_from_server(server) or "MT5"
        now = datetime.now(timezone.utc).isoformat()
        trades = [
            {
                "ticket": f"{login}-fixture-1",
                "symbol": "EURUSD",
                "type": "BUY",
                "direction": "BUY",
                "volume": 0.10,
                "price": 1.085,
                "open_price": 1.081,
                "profit": 120.0,
                "commission": -3.5,
                "swap": 0.0,
                "net": 116.5,
                "time": now,
                "open_time": now,
            },
            {
                "ticket": f"{login}-fixture-2",
                "symbol": "XAUUSD",
                "type": "SELL",
                "direction": "SELL",
                "volume": 0.05,
                "price": 2325.0,
                "open_price": 2329.0,
                "profit": -42.0,
                "commission": -2.0,
                "swap": 0.0,
                "net": -44.0,
                "time": now,
                "open_time": now,
            },
        ]
        return {
            "ok": True,
            "provider": self.name,
            "provider_connection_id": f"fixture:{server}:{login}",
            "message": "MT5 account linked and synced",
            "account": {
                "login": login,
                "broker": broker,
                "server": server,
                "currency": "USD",
                "balance": 139751.86,
                "equity": 139751.86,
                "profit": 0.0,
                "timestamp": now,
            },
            "positions": [],
            "trades": trades,
            "history": trades,
            "metrics": {
                "total_trades_fetched": len(trades),
                "trades_synced": len(trades),
                "trades_failed": 0,
                "failed_trades": [],
            },
        }


class HttpDirectMt5Provider(BaseDirectMt5Provider):
    name = "http"

    def __init__(self) -> None:
        self.base_url = _env_value("KMFX_DIRECT_MT5_API_BASE_URL", "DIRECT_MT5_API_BASE_URL").rstrip("/")
        self.link_path = _env_value("KMFX_DIRECT_MT5_LINK_PATH", "DIRECT_MT5_LINK_PATH") or "/api/v1/mt5-oauth/link"
        self.api_key = _env_value("KMFX_DIRECT_MT5_API_KEY", "DIRECT_MT5_API_KEY")
        self.auth_header = _env_value("KMFX_DIRECT_MT5_AUTH_HEADER", "DIRECT_MT5_AUTH_HEADER") or "Authorization"
        self.timeout_seconds = int(_env_value("KMFX_DIRECT_MT5_TIMEOUT_SECONDS", "DIRECT_MT5_TIMEOUT_SECONDS") or "45")

    def status(self) -> DirectMt5ProviderStatus:
        return DirectMt5ProviderStatus(name=self.name, configured=bool(self.base_url), mode="http")

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.api_key:
            headers[self.auth_header] = self.api_key if self.auth_header.lower() != "authorization" else f"Bearer {self.api_key}"
        return headers

    def link_account(self, credentials: dict[str, str]) -> dict[str, Any]:
        if not self.base_url:
            raise DirectMt5ProviderUnavailable("Direct MT5 HTTP provider is missing KMFX_DIRECT_MT5_API_BASE_URL.")
        endpoint = f"{self.base_url}{self.link_path if self.link_path.startswith('/') else '/' + self.link_path}"
        payload = {
            "login": _safe_text(credentials.get("login")),
            "server": _safe_text(credentials.get("server")),
            "password": _safe_text(credentials.get("password")),
        }
        if _safe_text(credentials.get("broker")):
            payload["broker"] = _safe_text(credentials.get("broker"))
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers=self._headers(),
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw_body = response.read().decode("utf-8")
                data = json.loads(raw_body or "{}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(body or "{}")
            except json.JSONDecodeError:
                parsed = {}
            reason = _safe_text(parsed.get("reason") or parsed.get("error"), "direct_mt5_provider_error")
            message = _safe_text(parsed.get("message"), "Direct MT5 provider rejected the connection.")
            raise DirectMt5ProviderError(reason, message, status_code=exc.code, retryable=exc.code >= 500, details={"provider_status": exc.code}) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise DirectMt5ProviderError(
                "direct_mt5_provider_unreachable",
                "Direct MT5 provider is unreachable.",
                status_code=503,
                retryable=True,
            ) from exc
        except json.JSONDecodeError as exc:
            raise DirectMt5ProviderError(
                "direct_mt5_provider_invalid_response",
                "Direct MT5 provider returned invalid JSON.",
                status_code=502,
                retryable=True,
            ) from exc
        return normalize_direct_mt5_provider_response(data, credentials, provider_name=self.name)


def get_direct_mt5_provider() -> BaseDirectMt5Provider:
    provider = _env_value("KMFX_DIRECT_MT5_PROVIDER", "DIRECT_MT5_PROVIDER").lower()
    if provider in {"fixture", "test"}:
        return FixtureDirectMt5Provider()
    if provider in {"http", "gateway", "external"}:
        return HttpDirectMt5Provider()
    return DisabledDirectMt5Provider()


def direct_provider_status_dict() -> dict[str, Any]:
    status = get_direct_mt5_provider().status()
    return {"name": status.name, "configured": status.configured, "mode": status.mode}


def normalize_direct_mt5_provider_response(
    data: dict[str, Any],
    credentials: dict[str, str],
    *,
    provider_name: str,
) -> dict[str, Any]:
    safe_data = _ensure_dict(data)
    data_container = _ensure_dict(safe_data.get("data"))
    account = _ensure_dict(
        safe_data.get("account")
        or safe_data.get("account_info")
        or safe_data.get("accountInfo")
        or data_container.get("account")
        or data_container.get("account_info")
    )
    login = _safe_text(account.get("login") or credentials.get("login"))
    server = _safe_text(account.get("server") or credentials.get("server"))
    broker = _safe_text(account.get("broker") or account.get("company") or credentials.get("broker")) or infer_broker_from_server(server) or "MT5"
    normalized_account = {
        **account,
        "login": login,
        "broker": broker,
        "server": server,
        "currency": _safe_text(account.get("currency"), "USD"),
        "balance": _safe_float(account.get("balance") or account.get("account_balance")),
        "equity": _safe_float(account.get("equity") or account.get("account_equity") or account.get("balance") or account.get("account_balance")),
        "profit": _safe_float(account.get("profit") or account.get("openPnl") or account.get("floatingPnl")),
    }
    dashboard_payload = _ensure_dict(
        safe_data.get("dashboard_payload")
        or safe_data.get("dashboardPayload")
        or data_container.get("dashboard_payload")
        or data_container.get("dashboardPayload")
    )
    metrics = _ensure_dict(safe_data.get("metrics") or data_container.get("metrics"))
    return {
        "ok": safe_data.get("ok", True) is not False,
        "provider": _safe_text(safe_data.get("provider"), provider_name),
        "provider_connection_id": _safe_text(
            safe_data.get("provider_connection_id")
            or safe_data.get("connection_id")
            or safe_data.get("connectionId")
            or data_container.get("connection_id")
            or data_container.get("connectionId")
        ),
        "message": _safe_text(safe_data.get("message") or data_container.get("message"), "MT5 account linked and synced"),
        "account": normalized_account,
        "positions": _ensure_list(safe_data.get("positions") or data_container.get("positions")),
        "trades": _ensure_list(safe_data.get("trades") or data_container.get("trades")),
        "history": _ensure_list(safe_data.get("history") or data_container.get("history") or safe_data.get("trades") or data_container.get("trades")),
        "dashboard_payload": dashboard_payload,
        "metrics": {
            "total_trades_fetched": int(_safe_float(metrics.get("total_trades_fetched") or safe_data.get("total_trades_fetched") or len(_ensure_list(safe_data.get("trades"))))),
            "trades_synced": int(_safe_float(metrics.get("trades_synced") or safe_data.get("trades_synced") or len(_ensure_list(safe_data.get("trades"))))),
            "trades_failed": int(_safe_float(metrics.get("trades_failed") or safe_data.get("trades_failed"))),
            "failed_trades": _ensure_list(metrics.get("failed_trades") or safe_data.get("failed_trades")),
        },
    }
