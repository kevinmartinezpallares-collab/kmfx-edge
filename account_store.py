from __future__ import annotations

import json
import logging
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from datetime import datetime, timezone
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


def _projected_account_record(row: dict) -> dict:
    account_payload = row.get("payload_account") if isinstance(row.get("payload_account"), dict) else {}
    risk_summary = row.get("payload_risk_summary") if isinstance(row.get("payload_risk_summary"), dict) else {}
    risk_status = row.get("payload_risk_status") if isinstance(row.get("payload_risk_status"), dict) else {}
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
            "payload_account:record->latest_payload->account",
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
        url = f"{self.project_url}/rest/v1/{urllib.parse.quote(self.table)}"
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
