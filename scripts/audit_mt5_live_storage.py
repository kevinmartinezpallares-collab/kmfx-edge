#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from account_service import AccountService
from account_store import SupabaseAccountStore


DEFAULT_SUPABASE_URL = "https://uuhiqreifisppqkawzif.supabase.co"


def _env_value(*names: str) -> str:
    for name in names:
        value = str(os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _parse_datetime(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _age_minutes(value: datetime | None, now: datetime) -> int | None:
    if value is None:
        return None
    return max(0, round((now - value.astimezone(timezone.utc)).total_seconds() / 60))


def _masked(value: object, *, keep: int = 4) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) <= keep * 2:
        return "***"
    return f"{text[:keep]}...{text[-keep:]}"


def _row_count(store: SupabaseAccountStore, table: str, account_id: str) -> int:
    rows = store._request_table(  # noqa: SLF001 - operational audit script for this local codebase.
        table,
        "GET",
        query={"select": "account_id", "account_id": f"eq.{account_id}", "limit": "1000"},
    )
    return len(rows) if isinstance(rows, list) else -1


def _find_account(store: SupabaseAccountStore, account_id: str, user_id: str):
    if account_id:
        return store.find_account_by_id(account_id)
    accounts = store.list_accounts_for_user(user_id) if user_id else store.list_accounts()
    live_accounts = [
        account
        for account in accounts
        if str(account.status or "").lower() == "active" and not account.archived_at and not account.deleted_at
    ]
    candidates = live_accounts or [account for account in accounts if not account.archived_at and not account.deleted_at]
    candidates.sort(key=lambda account: account.last_sync_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return candidates[0] if candidates else None


def build_audit(args: argparse.Namespace) -> dict[str, Any]:
    service_role_key = _env_value("SUPABASE_SERVICE_ROLE_KEY", "KMFX_SUPABASE_SERVICE_ROLE_KEY")
    if not service_role_key:
        raise SystemExit("missing_supabase_service_role_key")

    project_url = _env_value("SUPABASE_URL", "KMFX_SUPABASE_URL") or DEFAULT_SUPABASE_URL
    store = SupabaseAccountStore(project_url, service_role_key)
    account = _find_account(store, args.account_id, args.user_id)
    if account is None:
        raise SystemExit("no_live_account_found")

    now = datetime.now(timezone.utc)
    last_sync_at = account.last_sync_at.astimezone(timezone.utc) if account.last_sync_at else None
    deploy_after = _parse_datetime(args.require_sync_after)
    payload = dict(account.latest_payload or {})
    service = AccountService(store)
    full_snapshot = service.build_accounts_snapshot(account.user_id, summary_only=False)
    full_account = next(
        (item for item in full_snapshot.get("accounts", []) if item.get("account_id") == account.account_id),
        {},
    )
    full_payload = full_account.get("dashboard_payload") if isinstance(full_account, dict) else {}
    full_payload = full_payload if isinstance(full_payload, dict) else {}
    trades = full_payload.get("trades") if isinstance(full_payload.get("trades"), list) else []
    history = full_payload.get("history") if isinstance(full_payload.get("history"), list) else []
    metrics = payload.get("reportMetrics") if isinstance(payload.get("reportMetrics"), dict) else {}

    blockers: list[str] = []
    warnings: list[str] = []
    age = _age_minutes(last_sync_at, now)
    if age is None:
        blockers.append("missing_last_sync_at")
    elif age > args.max_sync_age_minutes:
        blockers.append(f"stale_sync:{age}min")
    if deploy_after and (last_sync_at is None or last_sync_at <= deploy_after):
        blockers.append("no_sync_after_required_timestamp")
    if payload.get("payloadShape") != "storage-summary":
        blockers.append("registry_payload_not_storage_summary")
    if payload.get("fullPayloadStored") is not False:
        blockers.append("registry_full_payload_still_enabled")
    if isinstance(payload.get("trades"), list) or isinstance(payload.get("history"), list):
        blockers.append("registry_contains_heavy_arrays")
    if not trades:
        blockers.append("hydrated_trades_missing")
    if len(history) < 2:
        blockers.append("hydrated_equity_history_insufficient")
    if metrics.get("totalTrades") is not None and int(float(metrics["totalTrades"])) != len(trades):
        warnings.append("report_metrics_total_trades_differs_from_hydrated_trade_count")
    if payload.get("payload_mode") not in ("lightweight", "full", None):
        warnings.append("unknown_payload_mode")

    normalized = {
        "positions": _row_count(store, "mt5_account_positions", account.account_id),
        "trades": _row_count(store, "mt5_account_trades", account.account_id),
        "equity_points": _row_count(store, "mt5_equity_points", account.account_id),
    }
    if normalized["trades"] < len(trades):
        blockers.append("normalized_trades_below_hydrated_count")
    if normalized["equity_points"] < len(history):
        blockers.append("normalized_equity_below_hydrated_count")

    return {
        "status": "blocked" if blockers else "ready",
        "checked_at": now.isoformat(),
        "account": {
            "account_id": _masked(account.account_id),
            "user_id": _masked(account.user_id),
            "login": _masked(account.login, keep=2),
            "status": account.status,
            "last_sync_at": last_sync_at.isoformat() if last_sync_at else "",
            "sync_age_minutes": age,
        },
        "registry": {
            "payloadShape": payload.get("payloadShape"),
            "fullPayloadStored": payload.get("fullPayloadStored"),
            "has_trades_array": isinstance(payload.get("trades"), list),
            "has_history_array": isinstance(payload.get("history"), list),
            "payload_mode": payload.get("payload_mode"),
            "sync_reason": payload.get("sync_reason"),
            "historyBootstrapFull": payload.get("historyBootstrapFull"),
            "tradesCount": payload.get("tradesCount"),
            "historyCount": payload.get("historyCount"),
            "totalTrades": payload.get("totalTrades") or metrics.get("totalTrades"),
            "winRate": payload.get("winRate") or metrics.get("winRate"),
            "netProfit": metrics.get("netProfit"),
        },
        "hydrated": {
            "trades": len(trades),
            "history": len(history),
        },
        "normalized_rows": normalized,
        "required_sync_after": deploy_after.isoformat() if deploy_after else "",
        "blockers": blockers,
        "warnings": warnings,
    }


def print_human(audit: dict[str, Any]) -> None:
    account = audit["account"]
    registry = audit["registry"]
    hydrated = audit["hydrated"]
    normalized = audit["normalized_rows"]
    print("MT5 live storage audit")
    print(f"Estado: {audit['status']}")
    print(
        "Cuenta: {login} | {status} | last_sync={last_sync_at} | age={sync_age_minutes}min".format(
            **account
        )
    )
    print(
        "Registro: shape={payloadShape}, fullPayloadStored={fullPayloadStored}, mode={payload_mode}, reason={sync_reason}".format(
            **registry
        )
    )
    print(
        "Arrays en registro: trades={has_trades_array}, history={has_history_array}".format(
            **registry
        )
    )
    print(f"Hidratado: trades={hydrated['trades']}, history={hydrated['history']}")
    print(
        "Normalizado: positions={positions}, trades={trades}, equity_points={equity_points}".format(
            **normalized
        )
    )
    if audit["warnings"]:
        print("Avisos:")
        for warning in audit["warnings"]:
            print(f"- {warning}")
    if audit["blockers"]:
        print("Bloqueos:")
        for blocker in audit["blockers"]:
            print(f"- {blocker}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit KMFX MT5 live normalized storage without printing secrets.")
    parser.add_argument("--account-id", default="", help="Optional exact account id to audit.")
    parser.add_argument("--user-id", default="", help="Optional user id scope when account id is not provided.")
    parser.add_argument("--max-sync-age-minutes", type=int, default=30)
    parser.add_argument("--require-sync-after", default="", help="ISO timestamp that last_sync_at must be newer than.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    audit = build_audit(args)
    if args.json:
        print(json.dumps(audit, indent=2, sort_keys=True))
    else:
        print_human(audit)
    return 1 if audit["status"] == "blocked" else 0


if __name__ == "__main__":
    sys.exit(main())
