from __future__ import annotations

import logging
import math
import os
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
    seal_connection_key,
)
from account_models import Account
from account_store import AccountStore


log = logging.getLogger("kmfx.account_service")
VALID_ALIAS_RE = re.compile(r"^[\w\s.\-·]{1,80}$", re.UNICODE)
PENDING_STATUSES = {"draft", "pending", "pending_setup", "pending_link", "waiting_sync", "linked"}
OPERATIONAL_STATUSES = {"active"}
ARCHIVED_STATUSES = {"archived"}
CLAIMABLE_LAUNCHER_USER_IDS = {"", "local"}
STORAGE_REPORT_METRIC_KEYS = (
    "balance",
    "equity",
    "netProfit",
    "grossProfit",
    "grossLoss",
    "winRate",
    "totalTrades",
    "profitFactor",
    "drawdownPct",
    "commissions",
    "swaps",
    "bestTrade",
    "worstTrade",
    "source",
)
ACCOUNT_PROFILE_CLASSES = {"own", "real", "demo", "challenge", "evaluation", "funded"}
ACCOUNT_PROFILE_LABELS = {
    "own": "Cuenta propia",
    "real": "Cuenta real",
    "demo": "Demo",
    "challenge": "Reto",
    "evaluation": "Fase 2",
    "funded": "Cuenta fondeada",
}
FUNDING_PROFILE_ACCOUNT_TYPES = {"challenge", "funded", "evaluation"}


def _env_flag(name: str, *, default: bool = False) -> bool:
    value = str(os.getenv(name) or "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "y", "on", "enabled"}


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


def _history_total_trades(payload: dict[str, Any] | None) -> int:
    safe_payload = payload if isinstance(payload, dict) else {}
    report_metrics = safe_payload.get("reportMetrics") if isinstance(safe_payload.get("reportMetrics"), dict) else {}
    for value in (
        safe_payload.get("totalTrades"),
        safe_payload.get("tradesCount"),
        report_metrics.get("totalTrades"),
    ):
        parsed = _first_finite_number(value)
        if parsed is not None:
            return int(parsed)
    return 0


def _preserve_full_history_metrics(
    *,
    compact_payload: dict[str, Any],
    previous_payload: dict[str, Any] | None,
    incoming_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    incoming = incoming_payload if isinstance(incoming_payload, dict) else {}
    if incoming.get("historyBootstrapFull") is True or str(incoming.get("payload_mode") or "").lower() != "lightweight":
        return compact_payload

    previous = previous_payload if isinstance(previous_payload, dict) else {}
    previous_total = _history_total_trades(previous)
    incoming_total = _history_total_trades(compact_payload)
    if previous_total <= incoming_total:
        return compact_payload

    preserved = deepcopy(compact_payload)
    preserved["totalTrades"] = previous_total
    preserved["tradesCount"] = max(previous_total, int(preserved.get("tradesCount") or 0))
    previous_metrics = previous.get("reportMetrics") if isinstance(previous.get("reportMetrics"), dict) else {}
    current_metrics = preserved.get("reportMetrics") if isinstance(preserved.get("reportMetrics"), dict) else {}
    if previous_metrics:
        historical_keys = (
            "netProfit",
            "grossProfit",
            "grossLoss",
            "netGrossProfit",
            "netGrossLoss",
            "profitFactor",
            "grossProfitFactor",
            "netProfitFactor",
            "profitFactorBasis",
            "winRate",
            "totalTrades",
            "winTrades",
            "lossTrades",
            "avgWin",
            "avgLoss",
            "bestTrade",
            "worstTrade",
            "drawdownPct",
            "commissions",
            "swaps",
            "dividends",
            "maxConsecutiveWins",
            "maxConsecutiveLosses",
            "maxConsecutiveProfit",
            "maxConsecutiveLoss",
        )
        merged_metrics = deepcopy(current_metrics)
        for key in historical_keys:
            if key in previous_metrics:
                merged_metrics[key] = deepcopy(previous_metrics[key])
        preserved["reportMetrics"] = merged_metrics
        if "winRate" in previous_metrics:
            preserved["winRate"] = previous_metrics["winRate"]
        if "drawdownPct" in previous_metrics:
            preserved["drawdownPct"] = previous_metrics["drawdownPct"]
    preserved["historyCompleteness"] = "preserved_full_metrics_after_lightweight_sync"
    return preserved


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


def _compact_report_metrics_from_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    safe_payload = payload if isinstance(payload, dict) else {}
    report_metrics = safe_payload.get("reportMetrics") if isinstance(safe_payload.get("reportMetrics"), dict) else {}
    if not report_metrics:
        return {}

    return {
        key: deepcopy(report_metrics[key])
        for key in STORAGE_REPORT_METRIC_KEYS
        if key in report_metrics and report_metrics[key] is not None
    }


def compact_dashboard_payload_from_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Keep only the fields needed for live status refreshes.

    The full MT5 payload can contain hundreds of closed trades and history points.
    Polling that blob is expensive in Supabase egress, so the regular refresh path
    uses this compact shape and keeps the heavy payload for explicit/full loads.
    """
    safe_payload = payload if isinstance(payload, dict) else {}
    account_payload = safe_payload.get("account") if isinstance(safe_payload.get("account"), dict) else {}
    positions = safe_payload.get("positions") if isinstance(safe_payload.get("positions"), list) else []
    risk_snapshot = safe_payload.get("riskSnapshot") if isinstance(safe_payload.get("riskSnapshot"), dict) else {}
    risk_summary = risk_snapshot.get("summary") if isinstance(risk_snapshot.get("summary"), dict) else {}
    risk_status = risk_snapshot.get("status") if isinstance(risk_snapshot.get("status"), dict) else {}

    compact: dict[str, Any] = {
        "payloadSource": safe_payload.get("payloadSource") or "mt5_sync_live",
        "payloadShape": "summary",
        "data_status": safe_payload.get("data_status") or safe_payload.get("dataStatus") or "",
        "timestamp": safe_payload.get("timestamp") or safe_payload.get("updated_at") or safe_payload.get("updatedAt") or "",
        "updated_at": safe_payload.get("updated_at") or safe_payload.get("updatedAt") or "",
        "last_sync_at": safe_payload.get("last_sync_at") or safe_payload.get("lastSyncAt") or "",
        "name": _first_text(safe_payload.get("name"), safe_payload.get("accountName"), account_payload.get("name")),
        "accountName": _first_text(safe_payload.get("accountName"), safe_payload.get("name"), account_payload.get("name")),
        "broker": _first_text(safe_payload.get("broker"), account_payload.get("broker")),
        "server": _first_text(safe_payload.get("server"), account_payload.get("server")),
        "login": _first_text(safe_payload.get("login"), account_payload.get("login")),
        "currency": _first_text(safe_payload.get("currency"), account_payload.get("currency")),
        "openPositionsCount": _first_finite_number(safe_payload.get("openPositionsCount"), len(positions)) or 0,
        "positionsCount": _first_finite_number(safe_payload.get("openPositionsCount"), len(positions)) or 0,
        "account": {
            "broker": _first_text(account_payload.get("broker"), safe_payload.get("broker")),
            "server": _first_text(account_payload.get("server"), safe_payload.get("server")),
            "login": _first_text(account_payload.get("login"), safe_payload.get("login")),
            "currency": _first_text(account_payload.get("currency"), safe_payload.get("currency")),
            "balance": _first_finite_number(account_payload.get("balance"), safe_payload.get("balance")),
            "equity": _first_finite_number(account_payload.get("equity"), safe_payload.get("equity")),
            "profit": _first_finite_number(account_payload.get("profit"), safe_payload.get("openPnl"), safe_payload.get("floatingPnl")),
        },
        "riskSnapshot": {
            "summary": risk_summary,
            "status": risk_status,
        },
    }
    compact.update(account_summary_fields_from_payload(safe_payload))
    report_metrics = _compact_report_metrics_from_payload(safe_payload)
    for key in ("totalTrades", "winRate", "drawdownPct"):
        value = _first_finite_number(safe_payload.get(key), report_metrics.get(key))
        if value is not None:
            compact[key] = value
    if report_metrics:
        compact["reportMetrics"] = report_metrics
    for key in ("accountProfile", "account_profile", "fundingProfile"):
        value = safe_payload.get(key)
        if isinstance(value, dict):
            compact[key] = deepcopy(value)
    return {key: value for key, value in compact.items() if value not in ("", None)}


def compact_storage_payload_from_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Persist a bounded MT5 snapshot so Supabase writes stay small."""
    safe_payload = payload if isinstance(payload, dict) else {}
    compact = compact_dashboard_payload_from_payload(safe_payload)
    positions_is_list = isinstance(safe_payload.get("positions"), list)
    trades_is_list = isinstance(safe_payload.get("trades"), list)
    history_is_list = isinstance(safe_payload.get("history"), list)
    positions = safe_payload.get("positions") if positions_is_list else []
    trades = safe_payload.get("trades") if trades_is_list else []
    history = safe_payload.get("history") if history_is_list else []
    max_positions = max(0, _env_int("KMFX_MAX_STORED_OPEN_POSITIONS", default=25))
    if positions and max_positions:
        compact["positions"] = deepcopy(positions[:max_positions])
    compact["payloadShape"] = "storage-summary"
    compact["fullPayloadStored"] = False
    report_metrics = _compact_report_metrics_from_payload(safe_payload)
    trades_count = (
        len(trades)
        if trades_is_list
        else _first_finite_number(safe_payload.get("tradesCount"), safe_payload.get("totalTrades"), report_metrics.get("totalTrades"))
    )
    history_count = len(history) if history_is_list else _first_finite_number(safe_payload.get("historyCount"))
    positions_count = len(positions) if positions_is_list else _first_finite_number(safe_payload.get("openPositionsCount"), safe_payload.get("positionsCount"))
    compact["tradesCount"] = int(trades_count or 0)
    compact["historyCount"] = int(history_count or 0)
    compact["openPositionsCount"] = int(positions_count or 0)
    compact["positionsCount"] = int(positions_count or 0)

    if report_metrics:
        compact["reportMetrics"] = report_metrics
    direct_sync = safe_payload.get("directSync") if isinstance(safe_payload.get("directSync"), dict) else {}
    if direct_sync:
        compact["directSync"] = deepcopy(direct_sync)

    for key in (
        "equity_peak",
        "daily_start_equity",
        "daily_start_day_key",
        "connector_version",
        "connectorVersion",
        "historyBootstrapFull",
        "identity_status",
        "payload_mode",
        "sync_reason",
    ):
        if safe_payload.get(key) not in (None, ""):
            compact[key] = safe_payload.get(key)
    return compact


def should_store_full_dashboard_payload(payload: dict[str, Any] | None) -> bool:
    if not _env_flag("KMFX_STORE_FULL_MT5_PAYLOADS", default=False):
        return False
    safe_payload = payload if isinstance(payload, dict) else {}
    max_trades = _env_int("KMFX_MAX_STORED_TRADES", default=40)
    max_history = _env_int("KMFX_MAX_STORED_HISTORY_POINTS", default=48)
    trades = safe_payload.get("trades") if isinstance(safe_payload.get("trades"), list) else []
    history = safe_payload.get("history") if isinstance(safe_payload.get("history"), list) else []
    return len(trades) <= max_trades and len(history) <= max_history


def _safe_sort_timestamp(value: Any) -> float:
    if value in (None, ""):
        return float("-inf")
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return float("-inf")
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return float("-inf")


def _trade_record_key(trade: dict[str, Any], index: int) -> str:
    stable = _first_text(
        trade.get("trade_id"),
        trade.get("ticket"),
        trade.get("deal_id"),
        trade.get("order_id"),
        trade.get("position_id"),
    )
    if stable:
        return f"trade:{stable}"
    return "trade-fallback:{time}|{symbol}|{volume}|{profit}|{index}".format(
        time=_first_text(trade.get("time"), trade.get("timestamp")),
        symbol=_first_text(trade.get("symbol")),
        volume=_first_text(trade.get("volume")),
        profit=_first_text(trade.get("profit"), trade.get("net")),
        index=index,
    )


def _history_record_key(point: dict[str, Any], index: int) -> str:
    timestamp = _first_text(point.get("timestamp"), point.get("time"), point.get("date"))
    if timestamp:
        return f"history:{timestamp}"
    label = _first_text(point.get("label"))
    value = _first_text(point.get("value"), point.get("equity"), point.get("balance"))
    return f"history-fallback:{label}|{value}|{index}"


def _merge_payload_records(
    previous_records: Any,
    incoming_records: Any,
    *,
    key_builder,
    timestamp_fields: tuple[str, ...],
) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for records in (previous_records, incoming_records):
        if not isinstance(records, list):
            continue
        for index, item in enumerate(records):
            if not isinstance(item, dict):
                continue
            merged[key_builder(item, index)] = deepcopy(item)
    rows = list(merged.values())
    rows.sort(
        key=lambda item: max(
            (_safe_sort_timestamp(item.get(field)) for field in timestamp_fields),
            default=float("-inf"),
        )
    )
    return rows


def merge_historical_dashboard_payload(
    previous_payload: dict[str, Any] | None,
    incoming_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    safe_previous = previous_payload if isinstance(previous_payload, dict) else {}
    safe_incoming = incoming_payload if isinstance(incoming_payload, dict) else {}
    merged_payload = deepcopy(safe_incoming)

    merged_trades = _merge_payload_records(
        safe_previous.get("trades"),
        safe_incoming.get("trades"),
        key_builder=_trade_record_key,
        timestamp_fields=("time_unix", "time", "timestamp"),
    )
    if merged_trades:
        merged_payload["trades"] = merged_trades

    merged_history = _merge_payload_records(
        safe_previous.get("history"),
        safe_incoming.get("history"),
        key_builder=_history_record_key,
        timestamp_fields=("timestamp", "time", "date"),
    )
    if merged_history:
        merged_payload["history"] = merged_history

    incoming_trades = incoming_payload.get("trades") if isinstance(incoming_payload, dict) else []
    incoming_history = incoming_payload.get("history") if isinstance(incoming_payload, dict) else []
    if (
        len(merged_trades) > (len(incoming_trades) if isinstance(incoming_trades, list) else 0)
        or len(merged_history) > (len(incoming_history) if isinstance(incoming_history, list) else 0)
    ):
        merged_payload.pop("reportMetrics", None)
        merged_payload.pop("report_metrics", None)

    return merged_payload


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


def _clean_short_label(value: Any, *, max_length: int = 80) -> str:
    cleaned = str(value or "").strip()
    if len(cleaned) > max_length:
        raise ValueError("invalid_label")
    return cleaned


def _clean_account_profile(profile: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(profile, dict):
        return None

    account_class = str(
        profile.get("account_class") or profile.get("accountClass") or "",
    ).strip()
    if account_class not in ACCOUNT_PROFILE_CLASSES:
        raise ValueError("invalid_account_profile")

    badge_label = _clean_short_label(
        profile.get("badge_label")
        or profile.get("badgeLabel")
        or ACCOUNT_PROFILE_LABELS[account_class],
    )

    return {
        "account_class": account_class,
        "badge_label": badge_label or ACCOUNT_PROFILE_LABELS[account_class],
        "source": "manual" if str(profile.get("source") or "").strip() == "manual" else "auto",
    }


def _clean_funding_profile(profile: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(profile, dict):
        return None

    account_type = str(profile.get("account_type") or profile.get("accountType") or "").strip()
    if account_type not in FUNDING_PROFILE_ACCOUNT_TYPES:
        raise ValueError("invalid_funding_profile")

    phase_label = _clean_short_label(profile.get("phase_label") or profile.get("phaseLabel"))
    clean_profile: dict[str, Any] = {
        "account_type": account_type,
        "phase_label": phase_label or ACCOUNT_PROFILE_LABELS.get(account_type, "Reto"),
    }

    for key in (
        "firm",
        "playbook_label",
        "payout_cadence_label",
        "next_payout_label",
    ):
        value = _clean_short_label(profile.get(key))
        if value:
            clean_profile[key] = value

    for key in (
        "objective_pct",
        "current_progress_pct",
        "consistency_pct",
        "recommended_risk_pct",
        "reset_cost_usd",
    ):
        value = _first_finite_number(profile.get(key))
        if value is not None:
            clean_profile[key] = value

    return clean_profile


def _identity_tuple(account: Account) -> tuple[str, str, str, str]:
    return (
        str(account.platform or "mt5").strip().lower(),
        str(account.broker or "").strip().lower(),
        str(account.server or "").strip().lower(),
        str(account.login or account.mt5_login or "").strip(),
    )


def _mt5_binding_tuple(platform: str, server: str, login: str) -> tuple[str, str, str]:
    return (
        str(platform or "mt5").strip().lower(),
        str(server or "").strip().lower(),
        str(login or "").strip(),
    )


def _account_mt5_binding_tuple(account: Account) -> tuple[str, str, str]:
    return _mt5_binding_tuple(
        account.platform or "mt5",
        account.server or "",
        account.login or account.mt5_login or "",
    )


def _has_complete_mt5_binding(account: Account) -> bool:
    return all(_account_mt5_binding_tuple(account))


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
    account.connection_key_sealed = seal_connection_key(normalized)


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

    def _supports_partial_user_mutations(self) -> bool:
        return callable(getattr(self.store, "list_accounts_for_user", None)) and callable(
            getattr(self.store, "save_account", None)
        )

    def _save_accounts_for_mutation(self, accounts: list[Account], *, partial: bool = False) -> None:
        save_account = getattr(self.store, "save_account", None)
        if partial and callable(save_account):
            for account in accounts:
                save_account(account)
            return
        self.store.save_accounts(accounts)

    def list_accounts(self, user_id: str = "local") -> list[Account]:
        list_for_user = getattr(self.store, "list_accounts_for_user", None)
        if callable(list_for_user):
            source_accounts = list_for_user(user_id)
        else:
            source_accounts = self.store.list_accounts()
        accounts = [account for account in source_accounts if account.user_id == user_id and not _is_deleted(account)]
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
                connection_key_sealed=seal_connection_key(api_key),
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
            for account in self.list_accounts(normalized_user_id)
            if not _is_archived(account) and _account_has_connection_key(account)
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
        finder = getattr(self.store, "find_account_by_user_and_connection_key_hash", None)
        if callable(finder):
            account = finder(user_id, hash_connection_key(normalized))
            if (
                account is not None
                and account.user_id == user_id
                and _account_connection_key_matches(account, normalized)
                and not _is_archived(account)
                and not _is_connection_key_revoked(account)
            ):
                return deepcopy(account)
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
        finder = getattr(self.store, "find_account_by_connection_key_hash", None)
        if callable(finder):
            account = finder(hash_connection_key(normalized))
            if (
                account is not None
                and _account_connection_key_matches(account, normalized)
                and not _is_archived(account)
                and not _is_connection_key_revoked(account)
            ):
                return deepcopy(account)
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
        partial_mutation = self._supports_partial_user_mutations()
        accounts = self.list_accounts(user_id) if partial_mutation else self.store.list_accounts()
        resolved_account_id = account_id or _resolve_account_id(platform, broker, server, login)
        now = _now_utc()
        target = next((account for account in accounts if account.account_id == resolved_account_id and not _is_deleted(account)), None)
        incoming_binding = _mt5_binding_tuple(platform, server, login)
        if (
            account_id
            and target is not None
            and _has_complete_mt5_binding(target)
            and all(incoming_binding)
            and _account_mt5_binding_tuple(target) != incoming_binding
        ):
            log.warning(
                "[KMFX][CONNECTION_KEY_VALIDATION] event=identity_mismatch "
                "account_id=%s user_id=%s stored_login=%s incoming_login=%s "
                "stored_server=%s incoming_server=%s",
                target.account_id,
                target.user_id,
                target.login or target.mt5_login,
                login,
                target.server,
                server,
            )
            raise ValueError("connection_key_identity_mismatch")
        is_first = not any(account.user_id == user_id and _is_operational(account) for account in accounts)
        if should_store_full_dashboard_payload(payload):
            merged_payload = merge_historical_dashboard_payload(target.latest_payload if target else {}, payload)
            merged_payload["payloadShape"] = merged_payload.get("payloadShape") or "full"
            merged_payload["fullPayloadStored"] = True
        else:
            merged_payload = compact_storage_payload_from_payload(payload)
            merged_payload = _preserve_full_history_metrics(
                compact_payload=merged_payload,
                previous_payload=target.latest_payload if target else {},
                incoming_payload=payload,
            )
        report_metrics = merged_payload.get("reportMetrics") if isinstance(merged_payload.get("reportMetrics"), dict) else {}
        connector_version = str(merged_payload.get("connectorVersion") or merged_payload.get("connector_version") or "")

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
                latest_payload=deepcopy(merged_payload),
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
            target.latest_payload = deepcopy(merged_payload)
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

        self._save_accounts_for_mutation(accounts, partial=partial_mutation)
        save_normalized_snapshot = getattr(self.store, "save_normalized_snapshot", None)
        if callable(save_normalized_snapshot):
            try:
                save_normalized_snapshot(target, payload)
            except OSError as exc:
                log.warning(
                    "[KMFX][NORMALIZED_SYNC] skipped account_id=%s reason=store_error error=%s",
                    target.account_id,
                    exc,
                )
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

    def rename_account(self, account_id: str, alias: str) -> Account | None:
        cleaned_alias = _clean_alias(alias)
        if not cleaned_alias:
            raise ValueError("missing_alias")

        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        for account in accounts:
            if account.account_id == account_id and not _is_deleted(account):
                account.alias = cleaned_alias
                account.nickname = cleaned_alias
                account.updated_at = now
                target = account
                log.info(
                    "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s event=rename_account",
                    account.account_id,
                    account.user_id,
                )
                break
        self.store.save_accounts(accounts)
        return deepcopy(target) if target else None

    def update_account_display_profile(
        self,
        account_id: str,
        *,
        alias: str | None = None,
        account_profile: dict[str, Any] | None = None,
        clear_account_profile: bool = False,
        funding_profile: dict[str, Any] | None = None,
        clear_funding_profile: bool = False,
    ) -> Account | None:
        cleaned_alias = _clean_alias(alias or "") if alias is not None else ""
        clean_account_profile = _clean_account_profile(account_profile)
        clean_funding_profile = _clean_funding_profile(funding_profile)

        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        for account in accounts:
            if account.account_id == account_id and not _is_deleted(account):
                if alias is not None:
                    if not cleaned_alias:
                        raise ValueError("missing_alias")
                    account.alias = cleaned_alias
                    account.nickname = cleaned_alias

                latest_payload = deepcopy(account.latest_payload or {})
                if clear_account_profile:
                    latest_payload.pop("accountProfile", None)
                    latest_payload.pop("account_profile", None)
                elif clean_account_profile is not None:
                    clean_account_profile["updated_at"] = now.isoformat()
                    latest_payload["accountProfile"] = deepcopy(clean_account_profile)
                    latest_payload["account_profile"] = deepcopy(clean_account_profile)

                if clear_funding_profile:
                    latest_payload.pop("fundingProfile", None)
                elif clean_funding_profile is not None:
                    clean_funding_profile["updated_at"] = now.isoformat()
                    latest_payload["fundingProfile"] = deepcopy(clean_funding_profile)

                account.latest_payload = latest_payload
                account.updated_at = now
                target = account
                log.info(
                    "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s event=update_account_display_profile",
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

    def restore_connection_key(self, account_id: str) -> Account | None:
        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        for account in accounts:
            if account.account_id != account_id or _is_deleted(account):
                continue
            normalized_key = normalize_connection_key(account.api_key)
            if not normalized_key:
                return None
            current_hash = account.connection_key_hash or hash_connection_key(normalized_key)
            account.connection_key_hash = current_hash
            account.connection_key_preview = account.connection_key_preview or mask_connection_key(normalized_key)
            if current_hash:
                account.revoked_connection_key_hashes = [
                    key_hash
                    for key_hash in (account.revoked_connection_key_hashes or [])
                    if key_hash != current_hash
                ]
            account.revoked_connection_keys = [
                key
                for key in (account.revoked_connection_keys or [])
                if normalize_connection_key(key) != normalized_key
            ]
            account.connection_key_revoked_at = None
            account.connection_key_revocation_reason = ""
            account.updated_at = now
            target = account
            log.info(
                "[KMFX][CONNECTION_KEY_VALIDATION] event=key_restored account_id=%s user_id=%s key=%s",
                account.account_id,
                account.user_id,
                account.connection_key_preview,
            )
            break
        if target is None:
            return None
        self.store.save_accounts(accounts)
        return deepcopy(target)

    def restore_connection_key_with_key(self, account_id: str, connection_key: str) -> Account | None:
        normalized_key = normalize_connection_key(connection_key)
        if not normalized_key:
            return None
        accounts = self.store.list_accounts()
        target: Account | None = None
        now = _now_utc()
        current_hash = hash_connection_key(normalized_key)
        for account in accounts:
            if account.account_id != account_id or _is_deleted(account):
                continue
            if not _account_connection_key_matches(account, normalized_key):
                return None
            account.connection_key_hash = account.connection_key_hash or current_hash
            account.connection_key_preview = account.connection_key_preview or mask_connection_key(normalized_key)
            account.revoked_connection_key_hashes = [
                key_hash
                for key_hash in (account.revoked_connection_key_hashes or [])
                if key_hash != current_hash
            ]
            account.revoked_connection_keys = [
                key
                for key in (account.revoked_connection_keys or [])
                if normalize_connection_key(key) != normalized_key
            ]
            account.connection_key_revoked_at = None
            account.connection_key_revocation_reason = ""
            account.updated_at = now
            if account.status == "pending_link":
                account.status = "connected" if account.last_sync_at else "pending_link"
            target = account
            log.info(
                "[KMFX][CONNECTION_KEY_VALIDATION] event=key_restored_with_supplied_key account_id=%s user_id=%s key=%s",
                account.account_id,
                account.user_id,
                account.connection_key_preview,
            )
            break
        if target is None:
            return None
        self.store.save_accounts(accounts)
        target_copy = deepcopy(target)
        target_copy.api_key = normalized_key
        target_copy.connection_key_hash = target_copy.connection_key_hash or current_hash
        target_copy.connection_key_preview = target_copy.connection_key_preview or mask_connection_key(normalized_key)
        return target_copy

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
                    "[KMFX][ACCOUNT_LIFECYCLE] account_id=%s user_id=%s status=pending_link event=regenerate_key key=%s",
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
        find_account_by_id = getattr(self.store, "find_account_by_id", None)
        save_account = getattr(self.store, "save_account", None)
        if callable(find_account_by_id) and callable(save_account):
            target = find_account_by_id(account_id)
            if target is None or _is_deleted(target) or _is_connection_key_revoked(target):
                return None
            now = _now_utc()
            if _normalize_status(target.status) in {"pending_link", "waiting_sync"}:
                target.status = "linked"
            target.last_policy_at = now
            target.updated_at = now
            save_account(target)
            return deepcopy(target)

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
        save_account = getattr(self.store, "save_account", None)
        if callable(save_account):
            target = self.get_account_by_api_key_any_user(normalized)
            if target is None:
                return None
            target.status = "error"
            target.last_error_code = error_code
            target.last_error_message = error_message
            target.updated_at = _now_utc()
            save_account(target)
            return deepcopy(target)

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

    def build_accounts_snapshot(self, user_id: str = "local", *, summary_only: bool = False) -> dict[str, Any]:
        list_summary_for_user = getattr(self.store, "list_account_summaries_for_user", None)
        if summary_only and callable(list_summary_for_user):
            source_accounts = list_summary_for_user(user_id)
        elif not summary_only and callable(getattr(self.store, "list_accounts_with_normalized_payload_for_user", None)):
            source_accounts = self.store.list_accounts_with_normalized_payload_for_user(user_id)
        else:
            source_accounts = self.list_accounts(user_id)
        accounts = [
            account
            for account in source_accounts
            if _is_operational(account)
        ]
        primary = next((account for account in accounts if account.is_primary or account.is_default), None)
        selected = primary or max(accounts, key=lambda account: account.last_sync_at or account.updated_at, default=None)
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
                    "dashboard_payload": (
                        compact_dashboard_payload_from_payload(account.latest_payload)
                        if summary_only
                        else deepcopy(account.latest_payload or {})
                    ),
                    "snapshot_payload_shape": "summary" if summary_only else "full",
                    "latest_report_metrics": deepcopy(account.latest_report_metrics or {}),
                }
                for account in accounts
            ],
            "active_account_id": selected.account_id if selected else "",
            "snapshot_mode": "summary" if summary_only else "full",
            "updated_at": _now_utc().isoformat(),
        }

    def build_accounts_registry(self, user_id: str = "local", *, summary_only: bool = False) -> list[dict[str, Any]]:
        list_summary_for_user = getattr(self.store, "list_account_summaries_for_user", None)
        if summary_only and callable(list_summary_for_user):
            source_accounts = list_summary_for_user(user_id)
        else:
            source_accounts = self.list_accounts(user_id)
        accounts = [account for account in source_accounts if not _is_deleted(account) and not _is_archived(account)]
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
