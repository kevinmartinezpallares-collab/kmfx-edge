from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from .connection_keys import payload_connection_key
from .config import LauncherConfig

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

    def _summarize_body(self, body: dict[str, Any] | None) -> str:
        if not body:
            return ""
        try:
            raw = json.dumps(body, ensure_ascii=True, sort_keys=True)
        except Exception:
            raw = str(body)
        return raw[:280]

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

        request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
        self.logger.info("[KMFX][HTTP] %s %s dispatch", method, url)
        try:
            with urllib.request.urlopen(request, timeout=self.config.backend_timeout_seconds) as response:
                body = response.read().decode("utf-8", errors="ignore")
                parsed_body = json.loads(body) if body else {}
                self.logger.info("[KMFX][HTTP] %s %s %s", method, url, response.status)
                return BackendResponse(
                    ok=200 <= response.status < 300,
                    status_code=response.status,
                    body=parsed_body,
                    method=method,
                    request_url=url,
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
                url,
                exc.code,
                self._summarize_body(parsed),
            )
            return BackendResponse(
                ok=False,
                status_code=exc.code,
                body=parsed,
                error=str(exc),
                method=method,
                request_url=url,
                request_attempted=True,
            )
        except Exception as exc:
            self.logger.error("[KMFX][HTTP][EXCEPTION] %s %s error=%s", method, url, exc)
            return BackendResponse(
                ok=False,
                status_code=0,
                body={},
                error=str(exc),
                method=method,
                request_url=url,
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
            with urllib.request.urlopen(request, timeout=self.config.backend_timeout_seconds) as response:
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

    def sign_in_with_password(self, *, email: str, password: str) -> BackendResponse:
        return self._supabase_auth_request(
            "/token?grant_type=password",
            payload={"email": email, "password": password},
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

    def post_snapshot(self, payload: dict[str, Any]) -> BackendResponse:
        return self._request(
            "POST",
            self.config.backend_sync_path,
            payload=payload,
            connection_key=payload_connection_key(payload) or None,
        )

    def post_journal(self, payload: dict[str, Any]) -> BackendResponse:
        return self._request(
            "POST",
            self.config.backend_journal_path,
            payload=payload,
            connection_key=payload_connection_key(payload) or None,
        )

    def get_policy(self, *, login: str, connection_key: str) -> BackendResponse:
        return self._request(
            "GET",
            self.config.backend_policy_path,
            query={"login": login, "connection_key": connection_key},
        )

    def healthcheck(self) -> BackendResponse:
        return self._request("GET", self.config.backend_health_path)

    def get_pending_accounts(self) -> BackendResponse:
        return self._request("GET", "/accounts/pending")

    def get_accounts_registry(self) -> BackendResponse:
        return self._request("GET", "/accounts")

    def link_account(self, *, user_id: str = "", label: str = "", connection_key: str | None = None) -> BackendResponse:
        return self._request(
            "POST",
            "/api/accounts/link",
            payload={"user_id": user_id, "label": label},
            connection_key=connection_key,
        )
