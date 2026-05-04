from __future__ import annotations

import json
import os
import threading
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import ensure_launcher_home


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def state_path() -> Path:
    return ensure_launcher_home() / "state.json"


@dataclass
class QueueItem:
    item_id: str
    kind: str
    payload: dict[str, Any]
    attempts: int
    next_retry_at: str
    created_at: str
    status: str
    last_error: str = ""


class LauncherStateStore:
    def __init__(self) -> None:
        self.path = state_path()
        self._lock = threading.Lock()
        self._state = self._load()

    def _default_state(self) -> dict[str, Any]:
        return {
            "queue": {"snapshot": [], "journal": []},
            "receipts": {"snapshot": {}, "journal": {}},
            "cached_policy": {},
            "bindings": [],
            "account_connections": [],
            "last_sync": {},
            "last_policy": {},
            "last_backend_error": "",
            "last_local_error": "",
            "updated_at": _now_iso(),
        }

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            state = self._default_state()
            self._save(state)
            return state
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            state = self._default_state()
            self._save(state)
            return state

    def _save(self, state: dict[str, Any]) -> None:
        state["updated_at"] = _now_iso()
        self.path.write_text(json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8")
        if os.name != "nt":
            try:
                self.path.chmod(0o600)
            except OSError:
                pass

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return deepcopy(self._state)

    def queue_depth(self, kind: str) -> int:
        with self._lock:
            return len(self._state["queue"].get(kind, []))

    def find_receipt(self, kind: str, item_id: str) -> dict[str, Any] | None:
        with self._lock:
            return deepcopy(self._state["receipts"].get(kind, {}).get(item_id))

    def find_queue_item(self, kind: str, item_id: str) -> dict[str, Any] | None:
        with self._lock:
            for item in self._state["queue"].get(kind, []):
                if item.get("item_id") == item_id:
                    return deepcopy(item)
        return None

    def enqueue(self, kind: str, item: dict[str, Any], max_queue_size: int) -> None:
        with self._lock:
            queue = self._state["queue"].setdefault(kind, [])
            queue[:] = [queued for queued in queue if queued.get("item_id") != item.get("item_id")]
            queue.append(deepcopy(item))
            while len(queue) > max_queue_size:
                queue.pop(0)
            self._save(self._state)

    def update_queue_item(self, kind: str, item_id: str, **changes: Any) -> None:
        with self._lock:
            for item in self._state["queue"].get(kind, []):
                if item.get("item_id") == item_id:
                    item.update(deepcopy(changes))
                    break
            self._save(self._state)

    def pop_due_item(self, kind: str, now_iso: str) -> dict[str, Any] | None:
        with self._lock:
            queue = self._state["queue"].get(kind, [])
            for item in queue:
                if item.get("next_retry_at", "") <= now_iso:
                    return deepcopy(item)
        return None

    def remove_queue_item(self, kind: str, item_id: str) -> None:
        with self._lock:
            queue = self._state["queue"].get(kind, [])
            queue[:] = [item for item in queue if item.get("item_id") != item_id]
            self._save(self._state)

    def save_receipt(self, kind: str, item_id: str, receipt: dict[str, Any]) -> None:
        with self._lock:
            self._state["receipts"].setdefault(kind, {})[item_id] = deepcopy(receipt)
            self._save(self._state)

    def set_cached_policy(self, identity_key: str, policy: dict[str, Any]) -> None:
        with self._lock:
            self._state["cached_policy"][identity_key] = {"policy": deepcopy(policy), "stored_at": _now_iso()}
            self._save(self._state)

    def get_cached_policy(self, identity_key: str) -> dict[str, Any] | None:
        with self._lock:
            record = self._state["cached_policy"].get(identity_key)
            return deepcopy(record["policy"]) if isinstance(record, dict) else None

    def set_last_sync(self, payload: dict[str, Any]) -> None:
        with self._lock:
            self._state["last_sync"] = deepcopy(payload)
            self._save(self._state)

    def set_last_policy(self, payload: dict[str, Any]) -> None:
        with self._lock:
            self._state["last_policy"] = deepcopy(payload)
            self._save(self._state)

    def set_last_backend_error(self, message: str) -> None:
        with self._lock:
            self._state["last_backend_error"] = message
            self._save(self._state)

    def set_last_local_error(self, message: str) -> None:
        with self._lock:
            self._state["last_local_error"] = message
            self._save(self._state)

    def save_binding(self, binding: dict[str, Any]) -> None:
        with self._lock:
            bindings = self._state.setdefault("bindings", [])
            account_id = str(binding.get("account_id") or "")
            bindings[:] = [item for item in bindings if str(item.get("account_id") or "") != account_id]
            bindings.append(deepcopy(binding))
            self._save(self._state)

    def save_account_connection(self, account: dict[str, Any]) -> None:
        account_id = str(account.get("account_id") or "").strip()
        connection_key = str(account.get("connection_key") or "").strip()
        if not account_id or not connection_key:
            return
        with self._lock:
            connections = self._state.setdefault("account_connections", [])
            connections[:] = [item for item in connections if str(item.get("account_id") or "").strip() != account_id]
            stored = deepcopy(account)
            stored["account_id"] = account_id
            stored["connection_key"] = connection_key
            stored["updated_at"] = _now_iso()
            connections.append(stored)
            self._save(self._state)

    def list_account_connections(self) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self._state.setdefault("account_connections", []))
