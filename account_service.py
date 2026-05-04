from __future__ import annotations

import logging
import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import NAMESPACE_URL, uuid4, uuid5

from account_keys import (
    connection_key_matches_any_hash,
    connection_key_matches_hash,
    hash_connection_key,
    mask_connection_key,
    normalize_connection_key,
)
from account_models import Account
from account_store import AccountStore


log = logging.getLogger("kmfx.account_service")
VALID_ALIAS_RE = re.compile(r"^[\w\s.\-·]{1,80}$", re.UNICODE)
PENDING_STATUSES = {"draft", "pending", "pending_setup", "pending_link", "waiting_sync", "linked"}
OPERATIONAL_STATUSES = {"active"}
ARCHIVED_STATUSES = {"archived"}
CLAIMABLE_LAUNCHER_USER_IDS = {"", "local"}


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


def _first_finite_number(*values: Any) -> float | None:
    for value in values:
        if value is None or value == "":
            continue
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(parsed):
            return parsed
    return None


def _first_text(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def account_summary_fields_from_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Expose display-only account totals already present in the latest MT5 snapshot."""
    safe_payload = payload if isinstance(payload, dict) else {}
    account_payload = safe_payload.get("account") if isinstance(safe_payload.get("account"), dict) else {}
    summary: dict[str, Any] = {}

    balance = _first_finite_number(safe_payload.get("balance"), account_payload.get("balance"))
    equity = _first_finite_number(safe_payload.get("equity"), account_payload.get("equity"))
    open_pnl = _first_finite_number(
        safe_payload.get("openPnl"),
        safe_payload.get("floatingPnl"),
        safe_payload.get("open_pnl"),
        safe_payload.get("floating_pnl"),
        account_payload.get("profit"),
        account_payload.get("openPnl"),
        account_payload.get("floatingPnl"),
    )
    total_pnl = _first_finite_number(
        safe_payload.get("totalPnl"),
        safe_payload.get("total_pnl"),
        safe_payload.get("pnl"),
        safe_payload.get("netPnl"),
        safe_payload.get("net_pnl"),
    )
    closed_pnl = _first_finite_number(
        safe_payload.get("closedPnl"),
        safe_payload.get("closed_pnl"),
    )
    currency = _first_text(safe_payload.get("currency"), account_payload.get("currency"))

    if balance is not None:
        summary["balance"] = balance
        summary["account_balance"] = balance
    if equity is not None:
        summary["equity"] = equity
        summary["account_equity"] = equity
    if open_pnl is not None:
        summary["open_pnl"] = open_pnl
        summary["openPnl"] = open_pnl
        summary["floating_pnl"] = open_pnl
        summary["floatingPnl"] = open_pnl
    if total_pnl is not None:
        summary["total_pnl"] = total_pnl
        summary["totalPnl"] = total_pnl
        summary["pnl"] = total_pnl
        summary["net_pnl"] = total_pnl
        summary["netPnl"] = total_pnl
    if closed_pnl is not None:
        summary["closed_pnl"] = closed_pnl
        summary["closedPnl"] = closed_pnl
    if currency:
        summary["currency"] = currency
        summary["account_currency"] = currency

    return summary


def _resolve_account_id(platform: str, broker: str, server: str, login: str) -> str:
    return _stable_account_id(platform, broker, server, login)


def _normalize_status(status: str) -> str:
    normalized = str(status or "").strip().lower()
    aliases = {
        "pending": "pending_link",
        "pending_setup": "pending_link",
        "waiting_sync": "linked",
        "connected": "active",
    }
    return aliases.get(normalized, normalized or "pending_link")


def _clean_alias(alias: str) -> str:
    cleaned = str(alias or "").strip()
    if cleaned and not VALID_ALIAS_RE.fullmatch(cleaned):
        raise ValueError("invalid_alias")
    return cleaned


def _identity_tuple(account: Account) -> tuple[str, str, str, str]:
    return (
        str(account.platform or "mt5").strip().lower(),
        str(account.broker or "").strip().lower(),
        str(account.server or "").strip().lower(),
        str(account.login or account.mt5_login or "").strip(),
    )


def _has_complete_mt5_identity(account: Account) -> bool:
    platform, broker, server, login = _identity_tuple(account)
    return bool(platform and broker and server and login)


def _is_deleted(account: Account) -> bool:
    return bool(account.deleted_at)


def _is_archived(account: Account) -> bool:
    return bool(account.archived_at or _normalize_status(account.status) in ARCHIVED_STATUSES or account.deleted_at)


def _is_connection_key_revoked(account: Account) -> bool:
    return bool(account.connection_key_revoked_at)


def _set_account_connection_key(account: Account, connection_key: str) -> None:
    normalized = normalize_connection_key(connection_key)
    if not normalized:
        return
    account.api_key = normalized
    account.connection_key_hash = hash_connection_key(normalized)
    account.connection_key_preview = mask_connection_key(normalized)


def _account_has_connection_key(account: Account) -> bool:
    return bool(normalize_connection_key(account.api_key) or account.connection_key_hash)


def _account_connection_key_matches(account: Account, connection_key: str) -> bool:
    normalized = normalize_connection_key(connection_key)
    if not normalized:
        return False
    if normalize_connection_key(account.api_key) == normalized:
        return True
    return connection_key_matches_hash(normalized, account.connection_key_hash)


def _account_connection_key_preview(account: Account) -> str:
    return account.connection_key_preview or mask_connection_key(account.api_key)


def _has_revoked_connection_key(account: Account, connection_key: str) -> bool:
    normalized = normalize_connection_key(connection_key)
    if not normalized:
        return False
    if _account_connection_key_matches(account, normalized) and _is_connection_key_revoked(account):
        return True
    return normalized in set(account.revoked_connection_keys or []) or connection_key_matches_any_hash(
        normalized,
        account.revoked_connection_key_hashes,
    )


def _is_operational(account: Account) -> bool:
    return (
        not _is_archived(account)
        and not _is_connection_key_revoked(account)
        and _normalize_status(account.status) in OPERATIONAL_STATUSES
        and bool(account.first_sync_at or account.last_sync_at)
        and bool(account.latest_payload)
    )


def _is_claimable_launcher_user_id(user_id: str) -> bool:
    return str(user_id or "").strip().lower() in CLAIMABLE_LAUNCHER_USER_IDS


class AccountService:
    def __init__(self, store: AccountStore) -> None:
        self.store = store

    def list_accounts(self, user_id: str = "local") -> list[Account]:
        accounts = [account for account in self.store.list_accounts() if account.user_id == user_id and not _is_deleted(account)]
        accounts.sort(key=lambda item: ((not item.is_primary and not item.is_default), item.nickname or "", item.login))
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
        alias = _clean_alias(alias or nickname or "")
        normalized_status = _normalize_status(status)

        if existing is None:
            existing = Account(
                account_id=resolved_account_id,
                user_id=user_id,
                alias=alias,
                broker=broker,
                platform=platform,
                login=login,
                server=server,
                connection_mode=connection_mode,
                status=normalized_status,
                api_key=api_key,
                connection_key_hash=hash_connection_key(api_key),
                connection_key_preview=mask_connection_key(api_key),
                nickname=nickname,
                mt5_login=login,
                is_primary=is_default,
                linked_at=now if normalized_status in {"linked", "active"} else None,
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
            existing.mt5_login = login or existing.mt5_login
            existing.server = server
            existing.connection_mode = connection_mode
            existing.status = normalized_status
            if api_key:
                _set_account_connection_key(existing, api_key)
            elif existing.api_key and not existing.connection_key_hash:
                _set_account_connection_key(existing, existing.api_key)
            existing.nickname = nickname or existing.nickname
            existing.is_default = bool(is_default or existing.is_default)
            existing.is_primary = bool(is_default or existing.is_primary or existing.is_default)
            if normalized_status in {"linked", "active"} and existing.linked_at is None:
                existing.linked_at = now
            existing.updated_at = now

        if existing.is_default or existing.is_primary:
            for account in all_accounts:
                if account.account_id != existing.account_id and account.user_id == user_id:
                    account.is_default = False
                    account.is_primary = False

        self.store.save_accounts(all_accounts)
        return deepcopy(existing)

    def _generate_connection_key(self) -> str:
        existing_hashes = {
            key_hash
            for account in self.store.list_accounts()
            for key_hash in [
                account.connection_key_hash,
                *[
                    hash_connection_key(connection_key)
                    for connection_key in [account.api_key, *(account.revoked_connection_keys or [])]
                    if normalize_connection_key(connection_key)
                ],
                *(account.revoked_connection_key_hashes or []),
            ]
            if key_hash
        }
        while True:
            candidate = str(uuid4())
            if hash_connection_key(candidate) not in existing_hashes:
                log.info("[KMFX][CONNECTION_KEY_VALIDATION] event=key_generated key=%s", mask_connection_key(candidate))
                return candidate

    def connection_slot_count(self, user_id: str) -> int:
        normalized_user_id = str(user_id or "").strip()
        if not normalized_user_id:
            return 0
        return sum(
            1
            for account in self.store.list_accounts()
            if account.user_id == normalized_user_id
            and not _is_deleted(account)
            and not _is_archived(account)
            and _account_has_connection_key(account)
        )

    def create_pending_account(
        self,
        *,
        user_id: str,
        alias: str,
        platform: str = "mt5",
        connection_mode: str = "launcher",
        broker: str = "",
        login: str = "",
        server: str = "",
    ) -> Account:
        created = self.create_account(
            user_id=user_id,
            alias=alias,
            broker=broker,
            platform=platform,
            login=login,
            server=server,
            connection_mode=connection_mode or "launcher",
            status="pending_link",
            api_key=self._generate_connection_key(),
            nickname=alias,
            is_default=False,
            account_id=str(uuid4()),
        )
        log.info(
            "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s status=pending_link event=key_persisted key=%s",
            created.account_id,
            user_id,
            _account_connection_key_preview(created),
        )
        return created

    def create_pending_account_with_key(
        self,
        *,
        user_id: str,
        alias: str,
        connection_key: str,
        platform: str = "mt5",
        connection_mode: str = "launcher",
        broker: str = "",
        login: str = "",
        server: str = "",
    ) -> Account | None:
        normalized_key = normalize_connection_key(connection_key)
        if not normalized_key:
            raise ValueError("missing_connection_key")
        if self.is_connection_key_revoked_any_user(normalized_key):
            log.warning(
                "[KMFX][CONNECTION_KEY_VALIDATION] event=key_bootstrap_blocked reason=revoked_key key=%s",
                mask_connection_key(normalized_key),
            )
            return None
        existing = self.get_account_by_api_key_any_user(normalized_key)
        if existing is not None:
            return existing
        blocked = next(
            (
                account
                for account in self.store.list_accounts()
                if _account_connection_key_matches(account, normalized_key) and _is_archived(account)
            ),
            None,
        )
        if blocked is not None:
            log.warning(
                "[KMFX][CONNECTION_KEY_VALIDATION] event=key_bootstrap_blocked reason=archived_key account_id=%s user_id=%s key=%s",
                blocked.account_id,
                blocked.user_id,
                mask_connection_key(normalized_key),
            )
            return None
        self.archive_stale_pending_alias_accounts(
            user_id=user_id,
            alias=alias,
            keep_connection_key=normalized_key,
        )
        created = self.create_account(
            user_id=user_id,
            alias=alias,
            broker=broker,
            platform=platform,
            login=login,
            server=server,
            connection_mode=connection_mode or "launcher",
            status="pending_link",
            api_key=normalized_key,
            nickname=alias,
            is_default=False,
            account_id=str(uuid4()),
        )
        log.info(
            "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s status=pending_link event=key_persisted key=%s",
            created.account_id,
            user_id,
            mask_connection_key(normalized_key),
        )
        return created

    def archive_stale_pending_alias_accounts(self, *, user_id: str, alias: str, keep_connection_key: str) -> None:
        cleaned_alias = _clean_alias(alias or "")
        if not cleaned_alias:
            return
        accounts = self.store.list_accounts()
        now = _now_utc()
        changed = False
        for account in accounts:
            has_identity = bool(
                str(account.broker or "").strip()
                or str(account.login or account.mt5_login or "").strip()
                or str(account.server or "").strip()
            )
            if (
                account.user_id == user_id
                and not _is_deleted(account)
                and not _is_archived(account)
                and _normalize_status(account.status) in PENDING_STATUSES
                and (account.alias or account.nickname or "") == cleaned_alias
                and not _account_connection_key_matches(account, keep_connection_key)
                and not has_identity
            ):
                account.status = "archived"
                account.archived_at = account.archived_at or now
                account.updated_at = now
                changed = True
                log.info(
                    "[KMFX][ACCOUNT_DEDUPE] user_id=%s archived_stale_pending=%s alias=%s kept_key=%s",
                    user_id,
                    account.account_id,
                    cleaned_alias,
                    mask_connection_key(keep_connection_key),
                )
        if changed:
            self.store.save_accounts(accounts)

    def set_default_account(self, user_id: str, account_id: str) -> Account | None:
        accounts = self.store.list_accounts()
        selected: Account | None = None
        for account in accounts:
            if account.user_id != user_id or _is_deleted(account):
                continue
            account.is_default = account.account_id == account_id and _is_operational(account)
            account.is_primary = account.is_default
            if account.is_default:
                account.updated_at = _now_utc()
                selected = account
        self.store.save_accounts(accounts)
        if selected:
            log.info(
                "[KMFX][ACCOUNT_PRIMARY_RESOLUTION] user_id=%s account_id=%s source=admin_set_default",
                user_id,
                selected.account_id,
            )
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
                if account.user_id == user_id and account.account_id == resolved_account_id and not _is_deleted(account)
            ),
            None,
        )
        return deepcopy(account) if account else None

    def get_account_by_api_key(self, *, user_id: str, api_key: str) -> Account | None:
        normalized = normalize_connection_key(api_key)
        if not normalized:
            return None
        account = next(
            (
                account
                for account in self.store.list_accounts()
                if account.user_id == user_id
                and _account_connection_key_matches(account, normalized)
                and not _is_archived(account)
                and not _is_connection_key_revoked(account)
            ),
            None,
        )
        return deepcopy(account) if account else None

    def get_account_by_api_key_any_user(self, api_key: str) -> Account | None:
        normalized = normalize_connection_key(api_key)
        if not normalized:
            return None
        account = next(
            (
                account
                for account in self.store.list_accounts()
                if _account_connection_key_matches(account, normalized)
                and not _is_archived(account)
                and not _is_connection_key_revoked(account)
            ),
            None,
        )
        return deepcopy(account) if account else None

    def is_connection_key_revoked_any_user(self, api_key: str) -> bool:
        normalized = normalize_connection_key(api_key)
        if not normalized:
            return False
        return any(_has_revoked_connection_key(account, normalized) for account in self.store.list_accounts())

    def get_revoked_account_by_api_key_any_user(self, api_key: str) -> Account | None:
        normalized = normalize_connection_key(api_key)
        if not normalized:
            return None
        account = next(
            (
                account
                for account in self.store.list_accounts()
                if _has_revoked_connection_key(account, normalized)
            ),
            None,
        )
        return deepcopy(account) if account else None

    def claim_account_by_api_key(self, *, user_id: str, api_key: str, alias: str = "") -> Account | None:
        normalized = normalize_connection_key(api_key)
        if not normalized:
            return None
        target_user_id = str(user_id or "").strip()
        if not target_user_id:
            raise ValueError("missing_user_id")
        alias = _clean_alias(alias or "")
        accounts = self.store.list_accounts()
        target = next(
            (
                account
                for account in accounts
                if _account_connection_key_matches(account, normalized)
                and not _is_archived(account)
                and not _is_connection_key_revoked(account)
            ),
            None,
        )
        if target is None:
            return None

        now = _now_utc()
        changed = False
        previous_user_id = target.user_id
        if target.user_id != target_user_id:
            if not _is_claimable_launcher_user_id(target.user_id):
                raise ValueError("connection_key_already_linked")
            target.user_id = target_user_id
            target.linked_at = target.linked_at or now
            changed = True

        if alias:
            if not target.alias:
                target.alias = alias
                changed = True
            if not target.nickname:
                target.nickname = alias
                changed = True

        if _is_operational(target):
            has_other_operational = any(
                account.account_id != target.account_id
                and account.user_id == target_user_id
                and _is_operational(account)
                for account in accounts
            )
            if not has_other_operational and not (target.is_default or target.is_primary):
                target.is_default = True
                target.is_primary = True
                changed = True

        if target.is_default or target.is_primary:
            for account in accounts:
                if account.account_id != target.account_id and account.user_id == target_user_id:
                    if account.is_default or account.is_primary:
                        account.is_default = False
                        account.is_primary = False
                        account.updated_at = now
                        changed = True

        if changed:
            target.updated_at = now
            self.store.save_accounts(accounts)
            log.info(
                "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s previous_user_id=%s event=launcher_key_claimed key=%s",
                target.account_id,
                target.user_id,
                previous_user_id,
                mask_connection_key(normalized),
            )
        target_copy = deepcopy(target)
        target_copy.api_key = normalized
        target_copy.connection_key_hash = target.connection_key_hash or hash_connection_key(normalized)
        target_copy.connection_key_preview = target.connection_key_preview or mask_connection_key(normalized)
        return target_copy

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
            if account.user_id == user_id and account.account_id == account_id and not _is_deleted(account):
                account.status = _normalize_status(status)
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
        target = next((account for account in accounts if account.account_id == resolved_account_id and not _is_deleted(account)), None)
        is_first = not any(account.user_id == user_id and _is_operational(account) for account in accounts)
        report_metrics = payload.get("reportMetrics") if isinstance(payload.get("reportMetrics"), dict) else {}
        connector_version = str(payload.get("connectorVersion") or payload.get("connector_version") or "")

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
                status="active",
                api_key=api_key,
                connection_key_hash=hash_connection_key(api_key),
                connection_key_preview=mask_connection_key(api_key),
                mt5_login=login,
                linked_at=now,
                first_sync_at=now,
                latest_report_metrics=deepcopy(report_metrics),
                connector_version=connector_version,
                nickname=nickname,
                is_default=bool(make_default_if_first and is_first),
                is_primary=bool(make_default_if_first and is_first),
                created_at=now,
                updated_at=now,
                last_sync_at=now,
                latest_payload=deepcopy(payload),
            )
            accounts.append(target)
            log.info(
                "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s status=active event=first_sync_received",
                target.account_id,
                user_id,
            )
        else:
            target.broker = broker
            target.platform = platform
            target.login = login
            target.mt5_login = login
            target.server = server
            target.alias = target.alias or nickname or ""
            target.connection_mode = connection_mode
            previous_status = target.status
            target.status = "active"
            if api_key:
                _set_account_connection_key(target, api_key)
            elif target.api_key and not target.connection_key_hash:
                _set_account_connection_key(target, target.api_key)
            target.nickname = nickname or target.nickname
            if target.linked_at is None:
                target.linked_at = now
            if target.first_sync_at is None:
                target.first_sync_at = now
            target.latest_report_metrics = deepcopy(report_metrics)
            target.connector_version = connector_version or target.connector_version
            target.last_error_code = ""
            target.last_error_message = ""
            target.archived_at = None
            target.deleted_at = None
            target.last_sync_at = now
            target.updated_at = now
            target.latest_payload = deepcopy(payload)
            log.info(
                "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s from_status=%s to_status=active event=sync_received",
                target.account_id,
                user_id,
                previous_status,
            )

        self._archive_duplicate_active_accounts(accounts, target)

        if target.is_default or target.is_primary:
            for account in accounts:
                if account.user_id == user_id and account.account_id != target.account_id:
                    account.is_default = False
                    account.is_primary = False

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

    def _archive_duplicate_active_accounts(self, accounts: list[Account], target: Account) -> None:
        if not _has_complete_mt5_identity(target):
            return
        target_identity = _identity_tuple(target)
        for account in accounts:
            if account.account_id == target.account_id or account.user_id != target.user_id:
                continue
            if not _is_operational(account):
                continue
            if _identity_tuple(account) != target_identity:
                continue
            account.status = "archived"
            account.archived_at = _now_utc()
            account.is_default = False
            account.is_primary = False
            account.updated_at = _now_utc()
            log.warning(
                "[KMFX][ACCOUNT_DEDUPE] user_id=%s archived_duplicate=%s kept_account=%s login=%s broker=%s server=%s",
                target.user_id,
                account.account_id,
                target.account_id,
                target.login,
                target.broker,
                target.server,
            )

    def resolve_operational_account(self, user_id: str = "local") -> Account | None:
        operational = [account for account in self.list_accounts(user_id) if _is_operational(account)]
        primary = next((account for account in operational if account.is_primary or account.is_default), None)
        selected = primary or max(operational, key=lambda account: account.last_sync_at or account.updated_at, default=None)
        log.info(
            "[KMFX][ACCOUNT_PRIMARY_RESOLUTION] user_id=%s selected=%s source=%s candidates=%s",
            user_id,
            selected.account_id if selected else "",
            "primary_active" if primary else ("latest_active" if selected else "empty"),
            len(operational),
        )
        return deepcopy(selected) if selected else None

    def archive_account(self, account_id: str) -> Account | None:
        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        for account in accounts:
            if account.account_id == account_id and not _is_deleted(account):
                account.status = "archived"
                account.archived_at = account.archived_at or now
                account.is_default = False
                account.is_primary = False
                account.updated_at = now
                target = account
                log.info(
                    "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s status=archived event=admin_archive",
                    account.account_id,
                    account.user_id,
                )
                break
        self.store.save_accounts(accounts)
        return deepcopy(target) if target else None

    def revoke_connection_key(self, account_id: str, reason: str = "manual_revocation") -> Account | None:
        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        cleaned_reason = str(reason or "manual_revocation").strip()[:120] or "manual_revocation"
        for account in accounts:
            if account.account_id == account_id and not _is_deleted(account):
                current_hash = account.connection_key_hash or hash_connection_key(account.api_key)
                if current_hash and current_hash not in account.revoked_connection_key_hashes:
                    account.revoked_connection_key_hashes.append(current_hash)
                account.connection_key_revoked_at = account.connection_key_revoked_at or now
                account.connection_key_revocation_reason = cleaned_reason
                account.status = "pending_link"
                account.is_default = False
                account.is_primary = False
                account.updated_at = now
                target = account
                log.warning(
                    "[KMFX][CONNECTION_KEY_VALIDATION] event=key_revoked account_id=%s user_id=%s key=%s reason=%s",
                    account.account_id,
                    account.user_id,
                    _account_connection_key_preview(account),
                    cleaned_reason,
                )
                break
        self.store.save_accounts(accounts)
        return deepcopy(target) if target else None

    def delete_account(self, account_id: str) -> Account | None:
        accounts = self.store.list_accounts()
        target = next((account for account in accounts if account.account_id == account_id), None)
        if target is None:
            return None
        remaining = [account for account in accounts if account.account_id != account_id]
        self.store.save_accounts(remaining)
        log.warning(
            "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s event=admin_hard_delete",
            target.account_id,
            target.user_id,
        )
        return deepcopy(target)

    def regenerate_connection_key(self, account_id: str) -> Account | None:
        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        new_key = self._generate_connection_key()
        for account in accounts:
            if account.account_id == account_id and not _is_deleted(account):
                previous_hash = account.connection_key_hash or hash_connection_key(account.api_key)
                if previous_hash and previous_hash not in account.revoked_connection_key_hashes:
                    account.revoked_connection_key_hashes.append(previous_hash)
                _set_account_connection_key(account, new_key)
                account.status = "pending_link"
                account.archived_at = None
                account.connection_key_revoked_at = None
                account.connection_key_revocation_reason = ""
                account.is_default = False
                account.is_primary = False
                account.last_error_code = ""
                account.last_error_message = ""
                account.updated_at = now
                target = account
                log.info(
                    "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s status=pending_link event=admin_regenerate_key key=%s",
                    account.account_id,
                    account.user_id,
                    mask_connection_key(new_key),
                )
                log.info(
                    "[KMFX][CONNECTION_KEY_VALIDATION] event=key_regenerated account_id=%s user_id=%s key=%s",
                    account.account_id,
                    account.user_id,
                    mask_connection_key(new_key),
                )
                break
        self.store.save_accounts(accounts)
        return deepcopy(target) if target else None

    def record_policy_access(self, account_id: str) -> Account | None:
        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        for account in accounts:
            if account.account_id == account_id and not _is_deleted(account) and not _is_connection_key_revoked(account):
                if _normalize_status(account.status) in {"pending_link", "waiting_sync"}:
                    account.status = "linked"
                account.last_policy_at = now
                account.updated_at = now
                target = account
                break
        self.store.save_accounts(accounts)
        return deepcopy(target) if target else None

    def record_sync_error_by_key(self, connection_key: str, error_code: str, error_message: str) -> Account | None:
        normalized = normalize_connection_key(connection_key)
        if not normalized:
            return None
        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        for account in accounts:
            if not _account_connection_key_matches(account, normalized) or _is_archived(account) or _is_connection_key_revoked(account):
                continue
            account.status = "error"
            account.last_error_code = error_code
            account.last_error_message = error_message
            account.updated_at = now
            target = account
            break
        self.store.save_accounts(accounts)
        return deepcopy(target) if target else None

    def build_accounts_snapshot(self, user_id: str = "local") -> dict[str, Any]:
        selected = self.resolve_operational_account(user_id)
        accounts = [selected] if selected else []
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
                    "lifecycle_status": account.status,
                    "api_key": "",
                    "connection_key": "",
                    "mt5_login": account.mt5_login or account.login,
                    "last_sync_at": account.last_sync_at.isoformat() if account.last_sync_at else "",
                    "first_sync_at": account.first_sync_at.isoformat() if account.first_sync_at else "",
                    "last_policy_at": account.last_policy_at.isoformat() if account.last_policy_at else "",
                    "last_error_code": account.last_error_code,
                    "last_error_message": account.last_error_message,
                    "connector_version": account.connector_version,
                    "connection_key_revoked": _is_connection_key_revoked(account),
                    "connection_key_revoked_at": account.connection_key_revoked_at.isoformat() if account.connection_key_revoked_at else "",
                    "connection_key_revocation_reason": account.connection_key_revocation_reason,
                    "connection_key_preview": _account_connection_key_preview(account),
                    "has_connection_key": _account_has_connection_key(account),
                    "is_default": bool(account.is_default or account.is_primary),
                    "is_primary": bool(account.is_default or account.is_primary),
                    "nickname": account.nickname or "",
                    "display_name": _display_name(account),
                    "dashboard_payload": deepcopy(account.latest_payload or {}),
                    "latest_report_metrics": deepcopy(account.latest_report_metrics or {}),
                }
                for account in accounts
            ],
            "active_account_id": selected.account_id if selected else "",
            "updated_at": _now_utc().isoformat(),
        }

    def build_accounts_registry(self, user_id: str = "local") -> list[dict[str, Any]]:
        accounts = [account for account in self.list_accounts(user_id) if not _is_deleted(account) and not _is_archived(account)]
        return [
            {
                "account_id": account.account_id,
                "user_id": account.user_id,
                "alias": account.alias or account.nickname or "",
                "platform": account.platform,
                "connection_mode": account.connection_mode,
                "connection_key": "",
                "connection_key_preview": _account_connection_key_preview(account),
                "has_connection_key": _account_has_connection_key(account),
                "status": account.status,
                "lifecycle_status": account.status,
                "broker": account.broker,
                "login": account.login,
                "mt5_login": account.mt5_login or account.login,
                "server": account.server,
                "last_sync_at": account.last_sync_at.isoformat() if account.last_sync_at else "",
                "first_sync_at": account.first_sync_at.isoformat() if account.first_sync_at else "",
                "last_policy_at": account.last_policy_at.isoformat() if account.last_policy_at else "",
                "last_error_code": account.last_error_code,
                "last_error_message": account.last_error_message,
                "connector_version": account.connector_version,
                "connection_key_revoked": _is_connection_key_revoked(account),
                "connection_key_revoked_at": account.connection_key_revoked_at.isoformat() if account.connection_key_revoked_at else "",
                "connection_key_revocation_reason": account.connection_key_revocation_reason,
                "archived_at": account.archived_at.isoformat() if account.archived_at else "",
                "is_default": bool(account.is_default or account.is_primary),
                "is_primary": bool(account.is_default or account.is_primary),
                "created_at": account.created_at.isoformat(),
                "updated_at": account.updated_at.isoformat(),
                "display_name": _display_name(account),
                **account_summary_fields_from_payload(account.latest_payload),
            }
            for account in accounts
        ]
