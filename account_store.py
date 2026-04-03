from __future__ import annotations

import json
import os
import tempfile
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Iterable

from account_models import Account


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


def account_to_record(account: Account) -> dict:
    return {
        "account_id": account.account_id,
        "user_id": account.user_id,
        "broker": account.broker,
        "platform": account.platform,
        "login": account.login,
        "server": account.server,
        "connection_mode": account.connection_mode,
        "status": account.status,
        "api_key": account.api_key,
        "last_sync_at": _serialize_datetime(account.last_sync_at),
        "is_default": bool(account.is_default),
        "nickname": account.nickname,
        "latest_payload": dict(account.latest_payload or {}),
        "created_at": _serialize_datetime(account.created_at),
        "updated_at": _serialize_datetime(account.updated_at),
    }


def record_to_account(record: dict) -> Account:
    now = _now_utc()
    return Account(
        account_id=str(record.get("account_id") or ""),
        user_id=str(record.get("user_id") or "local"),
        broker=str(record.get("broker") or ""),
        platform=str(record.get("platform") or "mt5"),
        login=str(record.get("login") or ""),
        server=str(record.get("server") or ""),
        connection_mode=str(record.get("connection_mode") or "bridge"),
        status=str(record.get("status") or "pending"),
        api_key=str(record.get("api_key") or ""),
        last_sync_at=_parse_datetime(record.get("last_sync_at")),
        is_default=bool(record.get("is_default")),
        nickname=record.get("nickname") or None,
        latest_payload=dict(record.get("latest_payload") or {}),
        created_at=_parse_datetime(record.get("created_at")) or now,
        updated_at=_parse_datetime(record.get("updated_at")) or now,
    )


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
        return [record_to_account(record) for record in records if isinstance(record, dict)]

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

