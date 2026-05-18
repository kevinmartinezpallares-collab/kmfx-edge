from __future__ import annotations

import json
import logging
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

try:
    import certifi
except ImportError:  # pragma: no cover - dependency is bundled in production builds
    certifi = None

from .connection_keys import payload_connection_key
from .config import LauncherConfig, mask_connection_key

SUPABASE_AUTH_URL = "https://uuhiqreifisppqkawzif.supabase.co/auth/v1"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1aGlxcmVpZmlzcHBxa2F3emlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNDY0MDIsImV4cCI6MjA4OTgyMjQwMn0."
    "-9nOoN8smRXiYscUeNzOCkeDKSakv416JflmhnhVHfM"
)
SUPABASE_GOOGLE_AUTHORIZE_PATH = "/authorize"


@dataclass
class BackendResponse:
    ok: bool
    status_code: int
    body: dict[str, Any]
    error: str = ""
    method: str = ""
    request_url: str = ""
    request_attempted: bool = False


class BackendClient:
    def __init__(self, config: LauncherConfig) -> None:
        self.config = config
        self.logger = logging.getLogger("kmfx_launcher")

    def _ssl_context_for_url(self, url: str):
        if not str(url or "").lower().startswith("https://"):
            return None
        if certifi is not None:
            return ssl.create_default_context(cafile=certifi.where())
        return ssl.create_default_context()

    def _summarize_body(self, body: dict[str, Any] | None) -> str:
        if not body:
            return ""
        try:
            raw = json.dumps(self._redact_for_log(body), ensure_ascii=True, sort_keys=True)
        except Exception:
            raw = str(body)
        return raw[:280]

    def _redact_for_log(self, value: Any) -> Any:
        if isinstance(value, dict):
            redacted: dict[str, Any] = {}
            for key, item in value.items():
                normalized_key = str(key or "").lower()
                if normalized_key in {"connection_key", "api_key", "kmfxapikey"}:
                    redacted[key] = mask_connection_key(str(item or "")) or "[masked]"
                elif any(token in normalized_key for token in ("password", "token", "authorization", "secret")):
                    redacted[key] = "[masked]"
                else:
                    redacted[key] = self._redact_for_log(item)
            return redacted
        if isinstance(value, list):
            return [self._redact_for_log(item) for item in value]
        return value

    def _payload_without_connection_key(self, payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if payload is None:
            return None
        cleaned = dict(payload)
        for key in ("connection_key", "KMFXApiKey", "api_key"):
            cleaned.pop(key, None)
        return cleaned

    def _safe_url(self, url: str) -> str:
        try:
            parsed = urllib.parse.urlsplit(url)
            pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            safe_pairs = []
            for key, value in pairs:
                normalized_key = key.lower()
                if normalized_key in {"connection_key", "api_key", "key"} or "token" in normalized_key or "secret" in normalized_key:
                    value = mask_connection_key(value) or "[masked]"
                safe_pairs.append((key, value))
            return urllib.parse.urlunsplit(
                (
                    parsed.scheme,
                    parsed.netloc,
                    parsed.path,
                    urllib.parse.urlencode(safe_pairs),
                    parsed.fragment,
                )
            )
        except Exception:
            return url

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
        connection_key: str | None = None,
    ) -> BackendResponse:
        url = self.config.backend_base_url.rstrip("/") + path
        if query:
            encoded_query = urllib.parse.urlencode({key: value for key, value in query.items() if value is not None and value != ""})
            if encoded_query:
                url += "?" + encoded_query

        data = None
        headers = {"Content-Type": "application/json", "Connection": "close"}
        header_connection_key = self.config.connection_key if connection_key is None else str(connection_key or "").strip()
        if header_connection_key:
            headers["X-KMFX-Connection-Key"] = header_connection_key
        if self.config.backend_token:
            headers["Authorization"] = f"Bearer {self.config.backend_token}"
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        safe_url = self._safe_url(url)
        request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
        self.logger.info("[KMFX][HTTP] %s %s dispatch", method, safe_url)
        try:
            with urllib.request.urlopen(
                request,
                timeout=self.config.backend_timeout_seconds,
                context=self._ssl_context_for_url(url),
            ) as response:
                body = response.read().decode("utf-8", errors="ignore")
                parsed_body = json.loads(body) if body else {}
                self.logger.info("[KMFX][HTTP] %s %s %s", method, safe_url, response.status)
                return BackendResponse(
                    ok=200 <= response.status < 300,
                    status_code=response.status,
                    body=parsed_body,
                    method=method,
                    request_url=safe_url,
                    request_attempted=True,
                )
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(body) if body else {}
            except json.JSONDecodeError:
                parsed = {"raw": body}
            self.logger.error(
                "[KMFX][HTTP][ERROR] %s %s status=%s body=%s",
                method,
                safe_url,
                exc.code,
                self._summarize_body(parsed),
            )
            return BackendResponse(
                ok=False,
                status_code=exc.code,
                body=parsed,
                error=str(exc),
                method=method,
                request_url=safe_url,
                request_attempted=True,
            )
        except Exception as exc:
            self.logger.error("[KMFX][HTTP][EXCEPTION] %s %s error=%s", method, safe_url, exc)
            return BackendResponse(
                ok=False,
                status_code=0,
                body={},
                error=str(exc),
                method=method,
                request_url=safe_url,
                request_attempted=True,
            )

    def _supabase_auth_request(self, path: str, payload: dict[str, Any] | None = None, *, access_token: str = "") -> BackendResponse:
        url = SUPABASE_AUTH_URL.rstrip("/") + path
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {access_token or SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
            "Connection": "close",
        }
        data = json.dumps(payload or {}).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(url=url, data=data, headers=headers, method="POST")
        self.logger.info("[KMFX][AUTH][REQUEST] base=%s endpoint=%s method=POST", SUPABASE_AUTH_URL, path)
        try:
            with urllib.request.urlopen(
                request,
                timeout=self.config.backend_timeout_seconds,
                context=self._ssl_context_for_url(url),
            ) as response:
                body = response.read().decode("utf-8", errors="ignore")
                parsed_body = json.loads(body) if body else {}
                self.logger.info("[KMFX][AUTH][RESPONSE] endpoint=%s status=%s", path, response.status)
                return BackendResponse(
                    ok=200 <= response.status < 300,
                    status_code=response.status,
                    body=parsed_body,
                    method="POST",
                    request_url=url,
                    request_attempted=True,
                )
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(body) if body else {}
            except json.JSONDecodeError:
                parsed = {"raw": body}
            self.logger.warning(
                "[KMFX][AUTH][ERROR] base=%s endpoint=%s status=%s body=%s",
                SUPABASE_AUTH_URL,
                path,
                exc.code,
                self._summarize_body(parsed),
            )
            return BackendResponse(
                ok=False,
                status_code=exc.code,
                body=parsed,
                error=str(exc),
                method="POST",
                request_url=url,
                request_attempted=True,
            )
        except Exception as exc:
            self.logger.warning("[KMFX][AUTH][EXCEPTION] %s error=%s", path, exc)
            return BackendResponse(
                ok=False,
                status_code=0,
                body={},
                error=str(exc),
                method="POST",
                request_url=url,
                request_attempted=True,
            )

    def sign_in_with_password(self, *, email: str, password: str, captcha_token: str = "") -> BackendResponse:
        payload: dict[str, Any] = {"email": email, "password": password}
        normalized_captcha_token = str(captcha_token or "").strip()
        if normalized_captcha_token:
            payload["gotrue_meta_security"] = {"captcha_token": normalized_captcha_token}
        return self._supabase_auth_request(
            "/token?grant_type=password",
            payload=payload,
        )

    def google_oauth_url(self, *, redirect_to: str, code_challenge: str) -> str:
        query = urllib.parse.urlencode(
            {
                "provider": "google",
                "redirect_to": redirect_to,
                "code_challenge": code_challenge,
                "code_challenge_method": "s256",
                "prompt": "select_account",
            }
        )
        return f"{SUPABASE_AUTH_URL.rstrip('/')}{SUPABASE_GOOGLE_AUTHORIZE_PATH}?{query}"

    def exchange_pkce_code(self, *, auth_code: str, code_verifier: str) -> BackendResponse:
        return self._supabase_auth_request(
            "/token?grant_type=pkce",
            payload={"auth_code": auth_code, "code_verifier": code_verifier},
        )

    def refresh_auth_session(self, *, refresh_token: str) -> BackendResponse:
        return self._supabase_auth_request(
            "/token?grant_type=refresh_token",
            payload={"refresh_token": refresh_token},
        )

    def sign_out(self, *, access_token: str) -> BackendResponse:
        if not access_token:
            return BackendResponse(ok=True, status_code=204, body={})
        return self._supabase_auth_request("/logout", payload={}, access_token=access_token)

    def post_snapshot(self, payload: dict[str, Any], *, connection_key: str | None = None) -> BackendResponse:
        return self._request(
            "POST",
            self.config.backend_sync_path,
            payload=self._payload_without_connection_key(payload),
            connection_key=connection_key or payload_connection_key(payload) or None,
        )

    def post_journal(self, payload: dict[str, Any], *, connection_key: str | None = None) -> BackendResponse:
        return self._request(
            "POST",
            self.config.backend_journal_path,
            payload=self._payload_without_connection_key(payload),
            connection_key=connection_key or payload_connection_key(payload) or None,
        )

    def get_policy(self, *, login: str, connection_key: str) -> BackendResponse:
        return self._request(
            "GET",
            self.config.backend_policy_path,
            query={"login": login},
            connection_key=connection_key,
        )

    def healthcheck(self) -> BackendResponse:
        return self._request("GET", self.config.backend_health_path)

    def get_pending_accounts(self) -> BackendResponse:
        return self._request("GET", "/accounts/pending")

    def get_accounts_registry(self) -> BackendResponse:
        return self._request("GET", "/accounts")

    def link_account(
        self,
        *,
        user_id: str = "",
        label: str = "",
        account_id: str = "",
        connection_key: str | None = None,
    ) -> BackendResponse:
        payload: dict[str, Any] = {"user_id": user_id, "label": label}
        if account_id:
            payload["account_id"] = account_id
        return self._request(
            "POST",
            "/api/accounts/link",
            payload=payload,
            connection_key=connection_key,
        )

    def regenerate_account_key(self, *, account_id: str) -> BackendResponse:
        normalized_account_id = str(account_id or "").strip()
        if not normalized_account_id:
            return BackendResponse(ok=False, status_code=400, body={"reason": "missing_account_id"})
        return self._request(
            "POST",
            f"/api/accounts/{urllib.parse.quote(normalized_account_id, safe='')}/regenerate-key",
            payload={},
            connection_key="",
        )

    def get_account_key(self, *, account_id: str) -> BackendResponse:
        normalized_account_id = str(account_id or "").strip()
        if not normalized_account_id:
            return BackendResponse(ok=False, status_code=400, body={"reason": "missing_account_id"})
        return self._request(
            "GET",
            f"/api/accounts/{urllib.parse.quote(normalized_account_id, safe='')}/connection-key",
            connection_key="",
        )

    def restore_account_key(self, *, account_id: str, connection_key: str) -> BackendResponse:
        normalized_account_id = str(account_id or "").strip()
        normalized_key = str(connection_key or "").strip()
        if not normalized_account_id:
            return BackendResponse(ok=False, status_code=400, body={"reason": "missing_account_id"})
        if not normalized_key:
            return BackendResponse(ok=False, status_code=400, body={"reason": "missing_connection_key"})
        return self._request(
            "POST",
            f"/api/accounts/{urllib.parse.quote(normalized_account_id, safe='')}/restore-key",
            payload={"connection_key": normalized_key},
            connection_key=normalized_key,
        )
