from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import NAMESPACE_URL, uuid4, uuid5

from account_models import Account
from account_store import AccountStore


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _stable_account_id(platform: str, broker: str, server: str, login: str) -> str:
    seed = f"{platform}:{broker}:{server}:{login}"
    return str(uuid5(NAMESPACE_URL, seed))


def _display_name(account: Account) -> str:
    if account.alias:
        return account.alias
    if account.nickname:
        return account.nickname
    if account.broker and account.login:
        return f"{account.broker} · {account.login}"
    return account.login or account.account_id


def _resolve_account_id(platform: str, broker: str, server: str, login: str) -> str:
    return _stable_account_id(platform, broker, server, login)


class AccountService:
    def __init__(self, store: AccountStore) -> None:
        self.store = store

    def list_accounts(self, user_id: str = "local") -> list[Account]:
        accounts = [account for account in self.store.list_accounts() if account.user_id == user_id]
        accounts.sort(key=lambda item: ((not item.is_default), item.nickname or "", item.login))
        return accounts

    def create_account(
        self,
        *,
        user_id: str,
        alias: str = "",
        broker: str,
        platform: str,
        login: str,
        server: str,
        connection_mode: str,
        status: str = "pending",
        api_key: str = "",
        nickname: str | None = None,
        is_default: bool = False,
        account_id: str | None = None,
    ) -> Account:
        all_accounts = self.store.list_accounts()
        resolved_account_id = account_id or _resolve_account_id(platform, broker, server, login)
        existing = next((account for account in all_accounts if account.account_id == resolved_account_id), None)
        now = _now_utc()

        if existing is None:
            existing = Account(
                account_id=resolved_account_id,
                user_id=user_id,
                alias=alias or nickname or "",
                broker=broker,
                platform=platform,
                login=login,
                server=server,
                connection_mode=connection_mode,
                status=status,
                api_key=api_key,
                nickname=nickname,
                is_default=is_default,
                created_at=now,
                updated_at=now,
            )
            all_accounts.append(existing)
        else:
            existing.user_id = user_id
            existing.alias = alias or existing.alias or nickname or ""
            existing.broker = broker
            existing.platform = platform
            existing.login = login
            existing.server = server
            existing.connection_mode = connection_mode
            existing.status = status
            existing.api_key = api_key or existing.api_key
            existing.nickname = nickname or existing.nickname
            existing.is_default = bool(is_default or existing.is_default)
            existing.updated_at = now

        if existing.is_default:
            for account in all_accounts:
                if account.account_id != existing.account_id and account.user_id == user_id:
                    account.is_default = False

        self.store.save_accounts(all_accounts)
        return deepcopy(existing)

    def _generate_connection_key(self) -> str:
        existing_keys = {account.api_key for account in self.store.list_accounts() if account.api_key}
        while True:
            candidate = f"kmfx_{uuid4().hex}"
            if candidate not in existing_keys:
                return candidate

    def create_pending_account(
        self,
        *,
        user_id: str,
        alias: str,
        platform: str = "mt5",
    ) -> Account:
        return self.create_account(
            user_id=user_id,
            alias=alias,
            broker="",
            platform=platform,
            login="",
            server="",
            connection_mode="launcher",
            status="pending_setup",
            api_key=self._generate_connection_key(),
            nickname=alias,
            is_default=False,
            account_id=str(uuid4()),
        )

    def set_default_account(self, user_id: str, account_id: str) -> Account | None:
        accounts = self.store.list_accounts()
        selected: Account | None = None
        for account in accounts:
            if account.user_id != user_id:
                continue
            account.is_default = account.account_id == account_id
            if account.is_default:
                account.updated_at = _now_utc()
                selected = account
        self.store.save_accounts(accounts)
        return deepcopy(selected) if selected else None

    def get_account_by_identity(
        self,
        *,
        user_id: str,
        platform: str,
        broker: str,
        server: str,
        login: str,
    ) -> Account | None:
        resolved_account_id = _resolve_account_id(platform, broker, server, login)
        account = next(
            (
                account
                for account in self.store.list_accounts()
                if account.user_id == user_id and account.account_id == resolved_account_id
            ),
            None,
        )
        return deepcopy(account) if account else None

    def get_account_by_api_key(self, *, user_id: str, api_key: str) -> Account | None:
        normalized = str(api_key or "").strip()
        if not normalized:
            return None
        account = next(
            (
                account
                for account in self.store.list_accounts()
                if account.user_id == user_id and account.api_key == normalized
            ),
            None,
        )
        return deepcopy(account) if account else None

    def update_account_status(
        self,
        *,
        user_id: str,
        account_id: str,
        status: str,
        last_sync_at: datetime | None = None,
    ) -> Account | None:
        accounts = self.store.list_accounts()
        target: Account | None = None
        for account in accounts:
            if account.user_id == user_id and account.account_id == account_id:
                account.status = status
                account.last_sync_at = last_sync_at or account.last_sync_at
                account.updated_at = _now_utc()
                target = account
                break
        self.store.save_accounts(accounts)
        return deepcopy(target) if target else None

    def ingest_account_snapshot(
        self,
        *,
        user_id: str,
        account_info: dict[str, Any],
        connection_mode: str,
        payload: dict[str, Any],
        account_id: str | None = None,
        api_key: str = "",
        nickname: str | None = None,
        make_default_if_first: bool = True,
    ) -> Account:
        broker = str(account_info.get("broker") or account_info.get("company") or "Unknown broker")
        platform = str(account_info.get("platform") or "mt5")
        login = str(account_info.get("login") or "")
        server = str(account_info.get("server") or "")
        accounts = self.store.list_accounts()
        resolved_account_id = account_id or _resolve_account_id(platform, broker, server, login)
        now = _now_utc()
        target = next((account for account in accounts if account.account_id == resolved_account_id), None)
        is_first = not any(account.user_id == user_id for account in accounts)

        if target is None:
            target = Account(
                account_id=resolved_account_id,
                user_id=user_id,
                alias=nickname or "",
                broker=broker,
                platform=platform,
                login=login,
                server=server,
                connection_mode=connection_mode,
                status="connected",
                api_key=api_key,
                nickname=nickname,
                is_default=bool(make_default_if_first and is_first),
                created_at=now,
                updated_at=now,
                last_sync_at=now,
                latest_payload=deepcopy(payload),
            )
            accounts.append(target)
        else:
            target.broker = broker
            target.platform = platform
            target.login = login
            target.server = server
            target.alias = target.alias or nickname or ""
            target.connection_mode = connection_mode
            target.status = "connected"
            target.api_key = api_key or target.api_key
            target.nickname = nickname or target.nickname
            target.last_sync_at = now
            target.updated_at = now
            target.latest_payload = deepcopy(payload)

        if target.is_default:
            for account in accounts:
                if account.user_id == user_id and account.account_id != target.account_id:
                    account.is_default = False

        self.store.save_accounts(accounts)
        return deepcopy(target)

    def link_connector_sync(
        self,
        *,
        user_id: str,
        account_info: dict[str, Any],
        payload: dict[str, Any],
        account_id: str | None = None,
        api_key: str = "",
        nickname: str | None = None,
    ) -> Account:
        return self.ingest_account_snapshot(
            user_id=user_id,
            account_info=account_info,
            connection_mode="connector",
            payload=payload,
            account_id=account_id,
            api_key=api_key,
            nickname=nickname,
        )

    def build_accounts_snapshot(self, user_id: str = "local") -> dict[str, Any]:
        accounts = [
            account
            for account in self.list_accounts(user_id)
            if account.status not in {"pending_setup", "waiting_sync"}
        ]
        return {
            "accounts": [
                {
                    "account_id": account.account_id,
                    "user_id": account.user_id,
                    "alias": account.alias,
                    "broker": account.broker,
                    "platform": account.platform,
                    "login": account.login,
                    "server": account.server,
                    "connection_mode": account.connection_mode,
                    "status": account.status,
                    "api_key": account.api_key,
                    "connection_key": account.api_key,
                    "last_sync_at": account.last_sync_at.isoformat() if account.last_sync_at else "",
                    "is_default": bool(account.is_default),
                    "nickname": account.nickname or "",
                    "display_name": _display_name(account),
                    "dashboard_payload": deepcopy(account.latest_payload or {}),
                }
                for account in accounts
            ],
            "active_account_id": next((account.account_id for account in accounts if account.is_default), ""),
            "updated_at": _now_utc().isoformat(),
        }

    def build_accounts_registry(self, user_id: str = "local") -> list[dict[str, Any]]:
        accounts = self.list_accounts(user_id)
        return [
            {
                "account_id": account.account_id,
                "user_id": account.user_id,
                "alias": account.alias or account.nickname or "",
                "platform": account.platform,
                "connection_key": account.api_key,
                "status": account.status,
                "broker": account.broker,
                "login": account.login,
                "server": account.server,
                "last_sync_at": account.last_sync_at.isoformat() if account.last_sync_at else "",
                "created_at": account.created_at.isoformat(),
                "display_name": _display_name(account),
            }
            for account in accounts
        ]
