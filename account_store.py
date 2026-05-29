from __future__ import annotations

import json
import logging
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Iterable

from account_keys import hash_connection_key, mask_connection_key, normalize_connection_key
from account_models import Account


log = logging.getLogger("kmfx.account_store")


def _env_float(name: str, *, default: float) -> float:
    value = str(os.getenv(name) or "").strip()
    if not value:
        return default
    try:
        parsed = float(value)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _env_int(name: str, *, default: int) -> int:
    value = str(os.getenv(name) or "").strip()
    if not value:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return parsed if parsed >= 0 else default


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _parse_datetime(value: object) -> datetime | None:
    if not value:
        return None
    if not isinstance(value, str):
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        for date_format in ("%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M", "%Y.%m.%d"):
            try:
                parsed = datetime.strptime(value, date_format)
                break
            except ValueError:
                parsed = None
        if parsed is None:
            return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _unique_text(values: Iterable[object]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        result.append(text)
        seen.add(text)
    return result


def _bool_from_value(value: object) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    return text in {"1", "true", "yes", "on"}


def _first_text(*values: object) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _first_present(*values: object) -> object:
    for value in values:
        if value not in (None, ""):
            return value
    return None


def _safe_float_or_none(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int_or_none(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _iso_or_none(value: object) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), timezone.utc).isoformat()
        except (OSError, OverflowError, ValueError):
            return None
    parsed = _parse_datetime(str(value))
    return _serialize_datetime(parsed)


def _record_key(item: dict, *fields: str, fallback: str = "") -> str:
    for field in fields:
        text = str(item.get(field) or "").strip()
        if text:
            return text
    return fallback


def _compact_raw(item: dict, allowed_keys: tuple[str, ...]) -> dict:
    return {key: item.get(key) for key in allowed_keys if item.get(key) not in (None, "")}


def _normalized_position_payload(row: dict) -> dict:
    return {
        "position_id": _first_text(row.get("position_key")),
        "ticket": _first_text(row.get("ticket")),
        "symbol": _first_text(row.get("symbol")),
        "type": _first_text(row.get("side")),
        "volume": row.get("volume"),
        "open_price": row.get("price_open"),
        "current_price": row.get("price_current"),
        "sl": row.get("stop_loss"),
        "tp": row.get("take_profit"),
        "profit": row.get("profit"),
        "swap": row.get("swap"),
        "floating_pnl": row.get("floating_pnl"),
        "risk_amount": row.get("risk_amount"),
        "risk_pct": row.get("risk_pct"),
        "risk_state": row.get("risk_state"),
        "risk_calculable": row.get("risk_calculable"),
        "time": row.get("opened_at"),
        "time_unix": row.get("time_unix"),
    }


def _normalized_trade_payload(row: dict) -> dict:
    return {
        "trade_id": _first_text(row.get("trade_key")),
        "ticket": _first_text(row.get("ticket")),
        "deal_id": _first_text(row.get("deal_id")),
        "order_id": _first_text(row.get("order_id")),
        "position_id": _first_text(row.get("position_id")),
        "symbol": _first_text(row.get("symbol")),
        "type": _first_text(row.get("side")),
        "volume": row.get("volume"),
        "price": row.get("price"),
        "open_price": row.get("open_price"),
        "open_time": row.get("open_time"),
        "close_time": row.get("close_time"),
        "open_time_unix": row.get("open_time_unix"),
        "time_unix": row.get("close_time_unix"),
        "sl": row.get("stop_loss"),
        "tp": row.get("take_profit"),
        "profit": row.get("profit"),
        "commission": row.get("commission"),
        "swap": row.get("swap"),
        "net": row.get("net"),
        "strategy_tag": row.get("strategy_tag"),
        "comment": row.get("comment"),
        "time": row.get("close_time"),
    }


def _normalized_equity_payload(row: dict) -> dict:
    return {
        "timestamp": row.get("point_time"),
        "value": row.get("value"),
        "source": row.get("source"),
    }


def _projected_account_record(row: dict) -> dict:
    account_payload = row.get("payload_account") if isinstance(row.get("payload_account"), dict) else {}
    risk_summary = row.get("payload_risk_summary") if isinstance(row.get("payload_risk_summary"), dict) else {}
    risk_status = row.get("payload_risk_status") if isinstance(row.get("payload_risk_status"), dict) else {}
    report_metrics = row.get("payload_report_metrics") if isinstance(row.get("payload_report_metrics"), dict) else {}
    positions_count = _first_present(row.get("payload_open_positions_count"), 0)
    latest_payload = {
        "payloadSource": row.get("payload_source") or "mt5_sync_live",
        "payloadShape": "summary",
        "data_status": row.get("payload_data_status") or "",
        "timestamp": _first_text(row.get("payload_timestamp"), row.get("payload_updated_at"), row.get("last_sync_at")),
        "updated_at": _first_text(row.get("payload_updated_at"), row.get("last_sync_at")),
        "last_sync_at": row.get("last_sync_at") or "",
        "name": _first_text(row.get("payload_name"), row.get("payload_account_name"), row.get("alias")),
        "accountName": _first_text(row.get("payload_account_name"), row.get("payload_name"), row.get("alias")),
        "broker": _first_text(row.get("payload_broker"), row.get("broker"), account_payload.get("broker")),
        "server": _first_text(row.get("payload_server"), row.get("server"), account_payload.get("server")),
        "login": _first_text(row.get("payload_login"), row.get("login"), row.get("mt5_login"), account_payload.get("login")),
        "currency": _first_text(row.get("payload_currency"), account_payload.get("currency")),
        "balance": _first_present(row.get("payload_balance"), account_payload.get("balance")),
        "equity": _first_present(row.get("payload_equity"), account_payload.get("equity")),
        "openPnl": _first_present(row.get("payload_open_pnl"), account_payload.get("profit")),
        "floatingPnl": _first_present(row.get("payload_open_pnl"), account_payload.get("profit")),
        "closedPnl": row.get("payload_closed_pnl"),
        "totalPnl": row.get("payload_total_pnl"),
        "pnl": row.get("payload_total_pnl"),
        "openPositionsCount": positions_count,
        "positionsCount": positions_count,
        "totalTrades": _first_present(row.get("payload_total_trades"), report_metrics.get("totalTrades")),
        "winRate": _first_present(row.get("payload_win_rate"), report_metrics.get("winRate")),
        "drawdownPct": _first_present(row.get("payload_drawdown_pct"), report_metrics.get("drawdownPct")),
        "reportMetrics": report_metrics,
        "account": account_payload,
        "riskSnapshot": {
            "summary": risk_summary,
            "status": risk_status,
        },
    }
    latest_payload = {key: value for key, value in latest_payload.items() if value not in ("", None)}
    return {
        "account_id": row.get("account_id") or "",
        "user_id": row.get("user_id") or "local",
        "alias": row.get("alias") or "",
        "broker": row.get("broker") or "",
        "platform": row.get("platform") or "mt5",
        "login": row.get("login") or "",
        "server": row.get("server") or "",
        "connection_mode": row.get("connection_mode") or "bridge",
        "status": row.get("status") or "pending",
        "api_key": "",
        "connection_key_hash": row.get("connection_key_hash") or "",
        "connection_key_preview": row.get("connection_key_preview") or "",
        "last_sync_at": row.get("last_sync_at") or "",
        "mt5_login": row.get("mt5_login") or row.get("login") or "",
        "is_primary": _bool_from_value(row.get("is_primary")),
        "linked_at": row.get("linked_at") or "",
        "first_sync_at": row.get("first_sync_at") or "",
        "last_policy_at": row.get("last_policy_at") or "",
        "last_error_code": row.get("last_error_code") or "",
        "last_error_message": row.get("last_error_message") or "",
        "latest_report_metrics": {},
        "connector_version": row.get("connector_version") or "",
        "connection_key_revoked_at": row.get("connection_key_revoked_at") or "",
        "connection_key_revocation_reason": row.get("connection_key_revocation_reason") or "",
        "revoked_connection_keys": [],
        "revoked_connection_key_hashes": [],
        "archived_at": row.get("archived_at") or "",
        "deleted_at": row.get("deleted_at") or "",
        "is_default": _bool_from_value(row.get("is_default")),
        "nickname": row.get("nickname") or None,
        "latest_payload": latest_payload,
        "created_at": row.get("created_at") or "",
        "updated_at": row.get("updated_at") or "",
    }


def account_to_record(account: Account) -> dict:
    connection_key_hash = account.connection_key_hash or hash_connection_key(account.api_key)
    connection_key_preview = account.connection_key_preview or mask_connection_key(account.api_key)
    revoked_connection_key_hashes = _unique_text(
        [
            *(account.revoked_connection_key_hashes or []),
            *[
                hash_connection_key(connection_key)
                for connection_key in (account.revoked_connection_keys or [])
                if normalize_connection_key(connection_key)
            ],
        ]
    )
    return {
        "account_id": account.account_id,
        "user_id": account.user_id,
        "alias": account.alias,
        "broker": account.broker,
        "platform": account.platform,
        "login": account.login,
        "server": account.server,
        "connection_mode": account.connection_mode,
        "status": account.status,
        "api_key": "",
        "connection_key_hash": connection_key_hash,
        "connection_key_preview": connection_key_preview,
        "last_sync_at": _serialize_datetime(account.last_sync_at),
        "mt5_login": account.mt5_login,
        "is_primary": bool(account.is_primary or account.is_default),
        "linked_at": _serialize_datetime(account.linked_at),
        "first_sync_at": _serialize_datetime(account.first_sync_at),
        "last_policy_at": _serialize_datetime(account.last_policy_at),
        "last_error_code": account.last_error_code,
        "last_error_message": account.last_error_message,
        "latest_report_metrics": dict(account.latest_report_metrics or {}),
        "connector_version": account.connector_version,
        "connection_key_revoked_at": _serialize_datetime(account.connection_key_revoked_at),
        "connection_key_revocation_reason": account.connection_key_revocation_reason,
        "revoked_connection_keys": [],
        "revoked_connection_key_hashes": revoked_connection_key_hashes,
        "archived_at": _serialize_datetime(account.archived_at),
        "deleted_at": _serialize_datetime(account.deleted_at),
        "is_default": bool(account.is_default),
        "nickname": account.nickname,
        "latest_payload": dict(account.latest_payload or {}),
        "created_at": _serialize_datetime(account.created_at),
        "updated_at": _serialize_datetime(account.updated_at),
    }


def record_to_account(record: dict) -> Account:
    now = _now_utc()
    raw_api_key = normalize_connection_key(record.get("api_key"))
    raw_revoked_keys = [
        normalize_connection_key(item)
        for item in (record.get("revoked_connection_keys") or [])
        if normalize_connection_key(item)
    ]
    connection_key_hash = str(record.get("connection_key_hash") or "").strip() or hash_connection_key(raw_api_key)
    connection_key_preview = str(record.get("connection_key_preview") or "").strip() or mask_connection_key(raw_api_key)
    revoked_connection_key_hashes = _unique_text(
        [
            *(record.get("revoked_connection_key_hashes") or []),
            *[hash_connection_key(item) for item in raw_revoked_keys],
        ]
    )
    return Account(
        account_id=str(record.get("account_id") or ""),
        user_id=str(record.get("user_id") or "local"),
        alias=str(record.get("alias") or record.get("nickname") or ""),
        broker=str(record.get("broker") or ""),
        platform=str(record.get("platform") or "mt5"),
        login=str(record.get("login") or ""),
        server=str(record.get("server") or ""),
        connection_mode=str(record.get("connection_mode") or "bridge"),
        status=str(record.get("status") or "pending"),
        api_key=raw_api_key,
        connection_key_hash=connection_key_hash,
        connection_key_preview=connection_key_preview,
        last_sync_at=_parse_datetime(record.get("last_sync_at")),
        mt5_login=str(record.get("mt5_login") or record.get("login") or ""),
        is_primary=bool(record.get("is_primary") if "is_primary" in record else record.get("is_default")),
        linked_at=_parse_datetime(record.get("linked_at")),
        first_sync_at=_parse_datetime(record.get("first_sync_at")),
        last_policy_at=_parse_datetime(record.get("last_policy_at")),
        last_error_code=str(record.get("last_error_code") or ""),
        last_error_message=str(record.get("last_error_message") or ""),
        latest_report_metrics=dict(record.get("latest_report_metrics") or {}),
        connector_version=str(record.get("connector_version") or ""),
        connection_key_revoked_at=_parse_datetime(record.get("connection_key_revoked_at")),
        connection_key_revocation_reason=str(record.get("connection_key_revocation_reason") or ""),
        revoked_connection_keys=raw_revoked_keys,
        revoked_connection_key_hashes=revoked_connection_key_hashes,
        archived_at=_parse_datetime(record.get("archived_at")),
        deleted_at=_parse_datetime(record.get("deleted_at")),
        is_default=bool(record.get("is_default")),
        nickname=record.get("nickname") or None,
        latest_payload=dict(record.get("latest_payload") or {}),
        created_at=_parse_datetime(record.get("created_at")) or now,
        updated_at=_parse_datetime(record.get("updated_at")) or now,
    )


def record_needs_connection_key_migration(record: dict) -> bool:
    if not isinstance(record, dict):
        return False
    if normalize_connection_key(record.get("api_key")):
        return True
    revoked_connection_keys = record.get("revoked_connection_keys") or []
    if isinstance(revoked_connection_keys, list) and any(normalize_connection_key(item) for item in revoked_connection_keys):
        return True
    return False


class AccountStore(ABC):
    @abstractmethod
    def list_accounts(self) -> list[Account]:
        raise NotImplementedError

    @abstractmethod
    def save_accounts(self, accounts: Iterable[Account]) -> None:
        raise NotImplementedError

    def save_normalized_snapshot(self, account: Account, payload: dict) -> None:
        return None


class JsonFileAccountStore(AccountStore):
    def __init__(self, path: str) -> None:
        self.path = path

    def list_accounts(self) -> list[Account]:
        if not os.path.exists(self.path):
            return []
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return []

        records = payload.get("accounts") if isinstance(payload, dict) else []
        if not isinstance(records, list):
            return []
        account_records = [record for record in records if isinstance(record, dict)]
        accounts = [record_to_account(record) for record in account_records]
        if any(record_needs_connection_key_migration(record) for record in account_records):
            try:
                self.save_accounts(accounts)
            except OSError:
                pass
        return accounts

    def save_accounts(self, accounts: Iterable[Account]) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        payload = {
            "accounts": [account_to_record(account) for account in accounts],
            "saved_at": _serialize_datetime(_now_utc()),
        }
        with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(self.path) or ".", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, indent=2)
            temp_path = handle.name
        os.replace(temp_path, self.path)


class SupabaseAccountStore(AccountStore):
    SUMMARY_SELECT = ",".join(
        [
            "account_id",
            "user_id",
            "status",
            "connection_key_hash",
            "connection_key_preview",
            "created_at",
            "updated_at",
            "alias:record->>alias",
            "broker:record->>broker",
            "platform:record->>platform",
            "login:record->>login",
            "server:record->>server",
            "connection_mode:record->>connection_mode",
            "mt5_login:record->>mt5_login",
            "is_primary:record->>is_primary",
            "is_default:record->>is_default",
            "linked_at:record->>linked_at",
            "first_sync_at:record->>first_sync_at",
            "last_sync_at:record->>last_sync_at",
            "last_policy_at:record->>last_policy_at",
            "last_error_code:record->>last_error_code",
            "last_error_message:record->>last_error_message",
            "connector_version:record->>connector_version",
            "connection_key_revoked_at:record->>connection_key_revoked_at",
            "connection_key_revocation_reason:record->>connection_key_revocation_reason",
            "archived_at:record->>archived_at",
            "deleted_at:record->>deleted_at",
            "nickname:record->>nickname",
            "payload_source:record->latest_payload->>payloadSource",
            "payload_data_status:record->latest_payload->>data_status",
            "payload_timestamp:record->latest_payload->>timestamp",
            "payload_updated_at:record->latest_payload->>updated_at",
            "payload_name:record->latest_payload->>name",
            "payload_account_name:record->latest_payload->>accountName",
            "payload_broker:record->latest_payload->>broker",
            "payload_server:record->latest_payload->>server",
            "payload_login:record->latest_payload->>login",
            "payload_currency:record->latest_payload->>currency",
            "payload_balance:record->latest_payload->>balance",
            "payload_equity:record->latest_payload->>equity",
            "payload_open_pnl:record->latest_payload->>openPnl",
            "payload_closed_pnl:record->latest_payload->>closedPnl",
            "payload_total_pnl:record->latest_payload->>totalPnl",
            "payload_open_positions_count:record->latest_payload->>openPositionsCount",
            "payload_total_trades:record->latest_payload->>totalTrades",
            "payload_win_rate:record->latest_payload->>winRate",
            "payload_drawdown_pct:record->latest_payload->>drawdownPct",
            "payload_report_metrics:record->latest_payload->reportMetrics",
            "payload_risk_summary:record->latest_payload->riskSnapshot->summary",
            "payload_risk_status:record->latest_payload->riskSnapshot->status",
        ]
    )

    def __init__(self, project_url: str, service_role_key: str, table: str = "mt5_account_registry") -> None:
        self.project_url = str(project_url or "").strip().rstrip("/")
        self.service_role_key = str(service_role_key or "").strip()
        self.table = str(table or "mt5_account_registry").strip()
        self.timeout_seconds = _env_float("KMFX_SUPABASE_ACCOUNT_STORE_TIMEOUT_SECONDS", default=3.0)
        if not self.project_url or not self.service_role_key:
            raise ValueError("supabase_account_store_not_configured")

    def _request(
        self,
        method: str,
        *,
        query: dict[str, str] | None = None,
        payload: object | None = None,
        prefer: str = "return=representation",
    ) -> object:
        return self._request_table(self.table, method, query=query, payload=payload, prefer=prefer)

    def _request_table(
        self,
        table: str,
        method: str,
        *,
        query: dict[str, str] | None = None,
        payload: object | None = None,
        prefer: str = "return=representation",
    ) -> object:
        url = f"{self.project_url}/rest/v1/{urllib.parse.quote(table)}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.service_role_key}",
            "apikey": self.service_role_key,
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer
        request = urllib.request.Request(url, data=body, headers=headers, method=str(method or "GET").upper())
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw_body = response.read()
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")[:500]
            raise OSError(f"supabase_account_store_http_{exc.code}: {details}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise OSError("supabase_account_store_request_failed") from exc
        if not raw_body:
            return [] if str(method or "").upper() == "GET" else {}
        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise OSError("supabase_account_store_invalid_json") from exc

    def list_accounts(self) -> list[Account]:
        rows = self._request(
            "GET",
            query={
                "select": "record",
                "order": "updated_at.asc",
                "limit": "10000",
            },
        )
        if not isinstance(rows, list):
            return []
        records = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            record = row.get("record")
            if isinstance(record, dict):
                records.append(record)
        return [record_to_account(record) for record in records]

    def list_accounts_for_user(self, user_id: str) -> list[Account]:
        clean_user_id = str(user_id or "").strip()
        if not clean_user_id:
            return []
        rows = self._request(
            "GET",
            query={
                "select": "record",
                "user_id": f"eq.{clean_user_id}",
                "order": "updated_at.asc",
                "limit": "1000",
            },
        )
        if not isinstance(rows, list):
            return []
        records = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            record = row.get("record")
            if isinstance(record, dict):
                records.append(record)
        return [record_to_account(record) for record in records]

    def list_accounts_with_normalized_payload_for_user(self, user_id: str) -> list[Account]:
        accounts = self.list_accounts_for_user(user_id)
        if not accounts:
            return []

        max_positions = _env_int("KMFX_NORMALIZED_MAX_OPEN_POSITIONS", default=50)
        max_trades = max(_env_int("KMFX_NORMALIZED_MAX_TRADES", default=5000), 5000)
        max_equity_points = _env_int("KMFX_NORMALIZED_MAX_EQUITY_POINTS", default=400)
        for account in accounts:
            account_id = str(account.account_id or "").strip()
            if not account_id:
                continue
            payload = dict(account.latest_payload or {})
            try:
                if max_positions > 0:
                    position_rows = self._request_table(
                        "mt5_account_positions",
                        "GET",
                        query={
                            "select": "*",
                            "account_id": f"eq.{account_id}",
                            "order": "opened_at.asc.nullslast",
                            "limit": str(max_positions),
                        },
                    )
                    if isinstance(position_rows, list):
                        payload["positions"] = [
                            {key: value for key, value in _normalized_position_payload(row).items() if value not in (None, "")}
                            for row in position_rows
                            if isinstance(row, dict)
                        ]

                if max_trades > 0:
                    trade_rows = self._request_table(
                        "mt5_account_trades",
                        "GET",
                        query={
                            "select": "*",
                            "account_id": f"eq.{account_id}",
                            "order": "close_time.desc.nullslast",
                            "limit": str(max_trades),
                        },
                    )
                    if isinstance(trade_rows, list):
                        payload["trades"] = [
                            {key: value for key, value in _normalized_trade_payload(row).items() if value not in (None, "")}
                            for row in trade_rows
                            if isinstance(row, dict)
                        ]
                        payload["tradesCount"] = len(payload["trades"])
                        payload["totalTrades"] = len(payload["trades"])
                        report_metrics = payload.get("reportMetrics")
                        if isinstance(report_metrics, dict):
                            report_metrics["totalTrades"] = len(payload["trades"])

                if max_equity_points > 0:
                    equity_rows = self._request_table(
                        "mt5_equity_points",
                        "GET",
                        query={
                            "select": "*",
                            "account_id": f"eq.{account_id}",
                            "order": "point_time.desc",
                            "limit": str(max_equity_points),
                        },
                    )
                    if isinstance(equity_rows, list):
                        payload["history"] = [
                            {key: value for key, value in _normalized_equity_payload(row).items() if value not in (None, "")}
                            for row in reversed(equity_rows)
                            if isinstance(row, dict)
                        ]
                        payload["historyCount"] = len(payload["history"])
            except OSError as exc:
                log.warning("Supabase normalized payload hydration skipped | account_id=%s error=%s", account_id, exc)
            account.latest_payload = payload
        return accounts

    def list_account_summaries_for_user(self, user_id: str) -> list[Account]:
        clean_user_id = str(user_id or "").strip()
        if not clean_user_id:
            return []
        try:
            rows = self._request(
                "GET",
                query={
                    "select": self.SUMMARY_SELECT,
                    "user_id": f"eq.{clean_user_id}",
                    "order": "updated_at.asc",
                    "limit": "1000",
                },
            )
        except OSError as exc:
            log.warning("Supabase account summary projection failed; falling back to full records: %s", exc)
            return self.list_accounts_for_user(clean_user_id)
        if not isinstance(rows, list):
            return []
        records = [_projected_account_record(row) for row in rows if isinstance(row, dict)]
        return [record_to_account(record) for record in records]

    def find_account_by_id(self, account_id: str) -> Account | None:
        clean_account_id = str(account_id or "").strip()
        if not clean_account_id:
            return None
        rows = self._request(
            "GET",
            query={
                "select": "record",
                "account_id": f"eq.{clean_account_id}",
                "limit": "1",
            },
        )
        if not isinstance(rows, list) or not rows:
            return None
        first = rows[0] if isinstance(rows[0], dict) else {}
        record = first.get("record") if isinstance(first, dict) else None
        return record_to_account(record) if isinstance(record, dict) else None

    def find_account_by_connection_key_hash(self, connection_key_hash: str) -> Account | None:
        clean_hash = str(connection_key_hash or "").strip()
        if not clean_hash:
            return None
        rows = self._request(
            "GET",
            query={
                "select": "record",
                "connection_key_hash": f"eq.{clean_hash}",
                "limit": "1",
            },
        )
        if not isinstance(rows, list) or not rows:
            return None
        first = rows[0] if isinstance(rows[0], dict) else {}
        record = first.get("record") if isinstance(first, dict) else None
        return record_to_account(record) if isinstance(record, dict) else None

    def find_account_by_user_and_connection_key_hash(self, user_id: str, connection_key_hash: str) -> Account | None:
        clean_user_id = str(user_id or "").strip()
        clean_hash = str(connection_key_hash or "").strip()
        if not clean_user_id or not clean_hash:
            return None
        rows = self._request(
            "GET",
            query={
                "select": "record",
                "user_id": f"eq.{clean_user_id}",
                "connection_key_hash": f"eq.{clean_hash}",
                "limit": "1",
            },
        )
        if not isinstance(rows, list) or not rows:
            return None
        first = rows[0] if isinstance(rows[0], dict) else {}
        record = first.get("record") if isinstance(first, dict) else None
        return record_to_account(record) if isinstance(record, dict) else None

    def _row_for_account(self, account: Account) -> dict[str, object] | None:
        record = account_to_record(account)
        account_id = str(record.get("account_id") or "").strip()
        if not account_id:
            return None
        return {
            "account_id": account_id,
            "user_id": str(record.get("user_id") or "local"),
            "status": str(record.get("status") or "pending"),
            "connection_key_hash": str(record.get("connection_key_hash") or ""),
            "connection_key_preview": str(record.get("connection_key_preview") or ""),
            "record": record,
        }

    def save_account(self, account: Account) -> None:
        row = self._row_for_account(account)
        if row is None:
            return
        self._request(
            "POST",
            query={"on_conflict": "account_id"},
            payload=[row],
            prefer="resolution=merge-duplicates,return=minimal",
        )

    def save_accounts(self, accounts: Iterable[Account]) -> None:
        rows: list[dict[str, object]] = []
        for account in accounts:
            row = self._row_for_account(account)
            if row is not None:
                rows.append(row)
        if not rows:
            return
        self._request(
            "POST",
            query={"on_conflict": "account_id"},
            payload=rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )

    def save_normalized_snapshot(self, account: Account, payload: dict) -> None:
        if not isinstance(payload, dict):
            return
        account_id = str(account.account_id or "").strip()
        user_id = str(account.user_id or "local").strip()
        if not account_id:
            return

        positions = payload.get("positions") if isinstance(payload.get("positions"), list) else []
        trades = payload.get("trades") if isinstance(payload.get("trades"), list) else []
        history = payload.get("history") if isinstance(payload.get("history"), list) else []

        # Open positions are a current-state table, so replace this account's
        # rows on each accepted sync. The row count is intentionally small.
        self._request_table(
            "mt5_account_positions",
            "DELETE",
            query={"account_id": f"eq.{account_id}"},
            prefer="return=minimal",
        )
        position_rows = []
        for index, position in enumerate(item for item in positions if isinstance(item, dict)):
            position_key = _record_key(position, "position_id", "ticket", fallback=f"position:{index}")
            position_rows.append(
                {
                    "account_id": account_id,
                    "user_id": user_id,
                    "position_key": position_key,
                    "ticket": str(position.get("ticket") or ""),
                    "symbol": _first_text(position.get("symbol")),
                    "side": _first_text(position.get("type"), position.get("side")),
                    "volume": _safe_float_or_none(position.get("volume")),
                    "price_open": _safe_float_or_none(_first_present(position.get("price_open"), position.get("open_price"))),
                    "price_current": _safe_float_or_none(_first_present(position.get("price_current"), position.get("current_price"))),
                    "stop_loss": _safe_float_or_none(_first_present(position.get("sl"), position.get("stop_loss"))),
                    "take_profit": _safe_float_or_none(_first_present(position.get("tp"), position.get("take_profit"))),
                    "profit": _safe_float_or_none(position.get("profit")),
                    "swap": _safe_float_or_none(position.get("swap")),
                    "floating_pnl": _safe_float_or_none(_first_present(position.get("floating_pnl"), position.get("floatingPnl"))),
                    "risk_amount": _safe_float_or_none(position.get("risk_amount")),
                    "risk_pct": _safe_float_or_none(position.get("risk_pct")),
                    "risk_state": str(position.get("risk_state") or ""),
                    "risk_calculable": bool(position.get("risk_calculable", True)),
                    "opened_at": _iso_or_none(position.get("time")),
                    "time_unix": _safe_int_or_none(position.get("time_unix")),
                    "raw": _compact_raw(
                        position,
                        (
                            "position_id",
                            "ticket",
                            "symbol",
                            "type",
                            "volume",
                            "profit",
                            "swap",
                            "risk_state",
                            "strategy_tag",
                        ),
                    ),
                }
            )
        if position_rows:
            self._request_table(
                "mt5_account_positions",
                "POST",
                query={"on_conflict": "account_id,position_key"},
                payload=position_rows,
                prefer="resolution=merge-duplicates,return=minimal",
            )

        trade_rows = []
        for index, trade in enumerate(item for item in trades if isinstance(item, dict)):
            trade_key = _record_key(trade, "trade_id", "ticket", "deal_id", "order_id", fallback=f"trade:{index}")
            close_time = _iso_or_none(_first_present(trade.get("time"), trade.get("close_time")))
            trade_rows.append(
                {
                    "account_id": account_id,
                    "user_id": user_id,
                    "trade_key": trade_key,
                    "ticket": str(trade.get("ticket") or ""),
                    "deal_id": str(trade.get("deal_id") or ""),
                    "order_id": str(trade.get("order_id") or ""),
                    "position_id": str(trade.get("position_id") or ""),
                    "symbol": _first_text(trade.get("symbol")),
                    "side": _first_text(trade.get("type"), trade.get("side"), trade.get("direction")),
                    "volume": _safe_float_or_none(trade.get("volume")),
                    "price": _safe_float_or_none(trade.get("price")),
                    "open_price": _safe_float_or_none(trade.get("open_price")),
                    "open_time": _iso_or_none(trade.get("open_time")),
                    "close_time": close_time,
                    "open_time_unix": _safe_int_or_none(trade.get("open_time_unix")),
                    "close_time_unix": _safe_int_or_none(trade.get("time_unix")),
                    "stop_loss": _safe_float_or_none(_first_present(trade.get("sl"), trade.get("stop_loss"))),
                    "take_profit": _safe_float_or_none(_first_present(trade.get("tp"), trade.get("take_profit"))),
                    "profit": _safe_float_or_none(trade.get("profit")),
                    "commission": _safe_float_or_none(trade.get("commission")),
                    "swap": _safe_float_or_none(trade.get("swap")),
                    "net": _safe_float_or_none(trade.get("net")),
                    "strategy_tag": str(trade.get("strategy_tag") or ""),
                    "comment": str(trade.get("comment") or ""),
                    "raw": _compact_raw(
                        trade,
                        (
                            "trade_id",
                            "ticket",
                            "deal_id",
                            "order_id",
                            "position_id",
                            "symbol",
                            "type",
                            "profit",
                            "commission",
                            "swap",
                            "net",
                            "strategy_tag",
                        ),
                    ),
                }
            )
        if trade_rows:
            self._request_table(
                "mt5_account_trades",
                "POST",
                query={"on_conflict": "account_id,trade_key"},
                payload=trade_rows,
                prefer="resolution=merge-duplicates,return=minimal",
            )

        equity_rows = []
        used_equity_times: set[str] = set()
        for index, point in enumerate(item for item in history if isinstance(item, dict)):
            value = _safe_float_or_none(_first_present(point.get("value"), point.get("equity"), point.get("balance")))
            point_time = _iso_or_none(_first_present(point.get("timestamp"), point.get("time"), point.get("date")))
            if value is None or point_time is None:
                continue
            while point_time in used_equity_times:
                parsed_time = _parse_datetime(point_time)
                if parsed_time is None:
                    break
                point_time = _serialize_datetime(parsed_time + timedelta(seconds=1))
            used_equity_times.add(point_time)
            equity_rows.append(
                {
                    "account_id": account_id,
                    "user_id": user_id,
                    "point_time": point_time,
                    "value": value,
                    "source": str(point.get("source") or "mt5_sync"),
                    "raw": _compact_raw(point, ("timestamp", "time", "date", "label", "value", "equity", "balance")),
                }
            )
        if equity_rows:
            self._request_table(
                "mt5_equity_points",
                "POST",
                query={"on_conflict": "account_id,point_time"},
                payload=equity_rows,
                prefer="resolution=merge-duplicates,return=minimal",
            )
