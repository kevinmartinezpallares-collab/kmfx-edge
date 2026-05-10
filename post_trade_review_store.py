from __future__ import annotations

import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Iterable


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_text(value: object, *, max_length: int = 500) -> str:
    text = str(value or "").strip()
    if max_length > 0 and len(text) > max_length:
        return text[:max_length]
    return text


def _clean_answer_value(value: object, *, max_length: int = 240) -> object:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    return _clean_text(value, max_length=max_length)


def normalize_review_record(record: dict | None) -> dict:
    source = record if isinstance(record, dict) else {}
    answers = source.get("answers") if isinstance(source.get("answers"), dict) else {}
    custom_answers = source.get("customAnswers") if isinstance(source.get("customAnswers"), dict) else {}
    return {
        "tradeId": _clean_text(source.get("tradeId") or source.get("trade_id"), max_length=180),
        "timestamp": _clean_text(source.get("timestamp"), max_length=80),
        "tagQuestionVersion": int(source.get("tagQuestionVersion") or 2),
        "londonConfirmation": _clean_answer_value(source.get("londonConfirmation") if "londonConfirmation" in source else answers.get("londonConfirmation"), max_length=80),
        "obEntry": _clean_answer_value(source.get("obEntry") if "obEntry" in source else answers.get("obEntry"), max_length=80),
        "validSetup": _clean_answer_value(source.get("validSetup") if "validSetup" in source else answers.get("validSetup"), max_length=80),
        "beActivated": _clean_answer_value(source.get("beActivated") if "beActivated" in source else answers.get("beActivated"), max_length=80),
        "allowedPairs": _clean_answer_value(source.get("allowedPairs") if "allowedPairs" in source else answers.get("allowedPairs"), max_length=80),
        "emotionalState": _clean_answer_value(source.get("emotionalState") if "emotionalState" in source else answers.get("emotionalState"), max_length=80),
        "customAnswers": {
            _clean_text(key, max_length=80): _clean_answer_value(value, max_length=240)
            for key, value in custom_answers.items()
            if _clean_text(key, max_length=80)
        },
        "note": _clean_text(source.get("note"), max_length=2000) or None,
        "tagSkipped": bool(source.get("tagSkipped")),
        "tagPartial": bool(source.get("tagPartial")),
        "updatedAt": _clean_text(source.get("updatedAt") or source.get("updated_at"), max_length=80) or _now_iso(),
    }


class PostTradeReviewStore(ABC):
    @abstractmethod
    def list_reviews(self, *, user_id: str, account_id: str | None = None) -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    def upsert_review(self, *, user_id: str, account_id: str, trade_id: str, record: dict) -> dict:
        raise NotImplementedError


class JsonFilePostTradeReviewStore(PostTradeReviewStore):
    def __init__(self, path: str) -> None:
        self.path = path

    def _load_rows(self) -> list[dict]:
        if not os.path.exists(self.path):
            return []
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return []
        rows = payload.get("reviews") if isinstance(payload, dict) else []
        return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []

    def _save_rows(self, rows: Iterable[dict]) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        payload = {"reviews": list(rows), "saved_at": _now_iso()}
        with tempfile.NamedTemporaryFile("w", delete=False, dir=os.path.dirname(self.path) or ".", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, indent=2)
            temp_path = handle.name
        os.replace(temp_path, self.path)

    def list_reviews(self, *, user_id: str, account_id: str | None = None) -> list[dict]:
        clean_user_id = _clean_text(user_id, max_length=120)
        clean_account_id = _clean_text(account_id, max_length=180)
        return [
            row
            for row in self._load_rows()
            if row.get("user_id") == clean_user_id and (not clean_account_id or row.get("account_id") == clean_account_id)
        ]

    def upsert_review(self, *, user_id: str, account_id: str, trade_id: str, record: dict) -> dict:
        clean_user_id = _clean_text(user_id, max_length=120)
        clean_account_id = _clean_text(account_id, max_length=180)
        clean_trade_id = _clean_text(trade_id, max_length=180)
        normalized = normalize_review_record({**(record or {}), "tradeId": clean_trade_id, "updatedAt": _now_iso()})
        rows = self._load_rows()
        row = {
            "user_id": clean_user_id,
            "account_id": clean_account_id,
            "trade_id": clean_trade_id,
            "record": normalized,
            "updated_at": normalized["updatedAt"],
        }
        next_rows = [
            existing
            for existing in rows
            if not (
                existing.get("user_id") == clean_user_id
                and existing.get("account_id") == clean_account_id
                and existing.get("trade_id") == clean_trade_id
            )
        ]
        next_rows.append(row)
        self._save_rows(next_rows)
        return row


class SupabasePostTradeReviewStore(PostTradeReviewStore):
    def __init__(self, project_url: str, service_role_key: str, table: str = "post_trade_reviews") -> None:
        self.project_url = str(project_url or "").strip().rstrip("/")
        self.service_role_key = str(service_role_key or "").strip()
        self.table = str(table or "post_trade_reviews").strip()
        if not self.project_url or not self.service_role_key:
            raise ValueError("supabase_post_trade_review_store_not_configured")

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
            with urllib.request.urlopen(request, timeout=10) as response:
                raw_body = response.read()
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")[:500]
            raise OSError(f"supabase_post_trade_review_store_http_{exc.code}: {details}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise OSError("supabase_post_trade_review_store_request_failed") from exc
        if not raw_body:
            return [] if str(method or "").upper() == "GET" else {}
        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise OSError("supabase_post_trade_review_store_invalid_json") from exc

    def list_reviews(self, *, user_id: str, account_id: str | None = None) -> list[dict]:
        query = {
            "select": "user_id,account_id,trade_id,record,updated_at",
            "user_id": f"eq.{_clean_text(user_id, max_length=120)}",
            "order": "updated_at.desc",
            "limit": "1000",
        }
        clean_account_id = _clean_text(account_id, max_length=180)
        if clean_account_id:
            query["account_id"] = f"eq.{clean_account_id}"
        rows = self._request("GET", query=query)
        return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []

    def upsert_review(self, *, user_id: str, account_id: str, trade_id: str, record: dict) -> dict:
        clean_trade_id = _clean_text(trade_id, max_length=180)
        normalized = normalize_review_record({**(record or {}), "tradeId": clean_trade_id, "updatedAt": _now_iso()})
        row = {
            "user_id": _clean_text(user_id, max_length=120),
            "account_id": _clean_text(account_id, max_length=180),
            "trade_id": clean_trade_id,
            "record": normalized,
            "updated_at": normalized["updatedAt"],
        }
        self._request(
            "POST",
            query={"on_conflict": "user_id,account_id,trade_id"},
            payload=row,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        return row
