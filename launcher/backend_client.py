from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from .config import LauncherConfig


@dataclass
class BackendResponse:
    ok: bool
    status_code: int
    body: dict[str, Any]
    error: str = ""


class BackendClient:
    def __init__(self, config: LauncherConfig) -> None:
        self.config = config

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None, query: dict[str, Any] | None = None) -> BackendResponse:
        url = self.config.backend_base_url.rstrip("/") + path
        if query:
            encoded_query = urllib.parse.urlencode({key: value for key, value in query.items() if value is not None and value != ""})
            if encoded_query:
                url += "?" + encoded_query

        data = None
        headers = {"Content-Type": "application/json", "Connection": "close"}
        if self.config.connection_key:
            headers["X-KMFX-Connection-Key"] = self.config.connection_key
        if self.config.backend_token:
            headers["Authorization"] = f"Bearer {self.config.backend_token}"
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.config.backend_timeout_seconds) as response:
                body = response.read().decode("utf-8", errors="ignore")
                return BackendResponse(
                    ok=200 <= response.status < 300,
                    status_code=response.status,
                    body=json.loads(body) if body else {},
                )
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(body) if body else {}
            except json.JSONDecodeError:
                parsed = {"raw": body}
            return BackendResponse(ok=False, status_code=exc.code, body=parsed, error=str(exc))
        except Exception as exc:
            return BackendResponse(ok=False, status_code=0, body={}, error=str(exc))

    def post_snapshot(self, payload: dict[str, Any]) -> BackendResponse:
        return self._request("POST", self.config.backend_sync_path, payload=payload)

    def post_journal(self, payload: dict[str, Any]) -> BackendResponse:
        return self._request("POST", self.config.backend_journal_path, payload=payload)

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
