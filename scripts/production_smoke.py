#!/usr/bin/env python3
"""Production smoke checks for KMFX Edge.

This runner intentionally uses only the Python standard library so it can run
from GitHub Actions, a local terminal, or a temporary production checklist
without installing dependencies.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Response:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str


class Smoke:
    def __init__(self, *, frontend_url: str, backend_url: str, mt5_api_url: str, timeout: float) -> None:
        self.frontend_url = normalize_base_url(frontend_url)
        self.backend_url = normalize_base_url(backend_url)
        self.mt5_api_url = normalize_base_url(mt5_api_url)
        self.timeout = timeout
        self.results: list[dict[str, Any]] = []

    def check(self, name: str, ok: bool, detail: str = "") -> None:
        self.results.append({"name": name, "ok": bool(ok), "detail": detail})

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        data: bytes | None = None,
    ) -> Response:
        request_headers = {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "KMFX-Production-Smoke/1.0",
            **(headers or {}),
        }
        request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return Response(
                    status=response.status,
                    headers=normalize_headers(response.headers),
                    body=response.read(),
                    url=response.geturl(),
                )
        except urllib.error.HTTPError as exc:
            return Response(
                status=exc.code,
                headers=normalize_headers(exc.headers),
                body=exc.read(),
                url=url,
            )
        except urllib.error.URLError as exc:
            return Response(status=0, headers={}, body=str(exc).encode("utf-8", errors="replace"), url=url)

    def run(self) -> int:
        self.check_frontend_headers()
        self.check_spa_routes()
        self.check_downloads()
        self.check_backend()
        self.check_mt5_api()
        failed = [result for result in self.results if not result["ok"]]
        print(json.dumps({"ok": not failed, "checks": self.results}, indent=2, sort_keys=True))
        return 1 if failed else 0

    def check_frontend_headers(self) -> None:
        response = self.request("HEAD", self.frontend_url + "/")
        headers = response.headers
        self.check("frontend_root_200", response.status == 200, f"status={response.status}")
        self.check("frontend_csp_present", bool(headers.get("content-security-policy")), "CSP header")
        self.check(
            "frontend_hsts_present",
            "max-age=" in headers.get("strict-transport-security", "").lower(),
            headers.get("strict-transport-security", ""),
        )
        self.check(
            "frontend_frame_denied",
            headers.get("x-frame-options", "").lower() == "deny",
            headers.get("x-frame-options", ""),
        )
        self.check(
            "frontend_nosniff",
            headers.get("x-content-type-options", "").lower() == "nosniff",
            headers.get("x-content-type-options", ""),
        )
        cors = headers.get("access-control-allow-origin", "")
        self.check("frontend_no_wildcard_cors", cors != "*", cors)
        self.check("frontend_cors_origin", cors == "https://kmfxedge.com", cors)

    def check_spa_routes(self) -> None:
        for path in ("/dashboard", "/cuentas", "/ejecucion", "/journal", "/estudio", "/ajustes"):
            response = self.request("HEAD", self.frontend_url + path)
            self.check(f"spa_route_{path.strip('/')}_200", response.status == 200, f"status={response.status}")

    def check_downloads(self) -> None:
        downloads = [
            ("/downloads/KMFX-Launcher-macOS.zip", "downloads/KMFX-Launcher-macOS.zip", 1_000_000, True),
            ("/downloads/KMFX-Launcher-Windows.exe", "downloads/KMFX-Launcher-Windows.exe", 1_000_000, True),
            ("/KMFXConnector.ex5", "KMFXConnector.ex5", 50_000, False),
        ]
        for remote_path, local_path, min_size, require_attachment in downloads:
            filename = Path(local_path).name
            response = self.request("HEAD", self.frontend_url + remote_path)
            content_length = parse_int(response.headers.get("content-length"))
            self.check(f"download_{filename}_200", response.status == 200, f"status={response.status}")
            self.check(
                f"download_{filename}_size",
                content_length >= min_size,
                f"content-length={content_length}",
            )
            if require_attachment:
                disposition = response.headers.get("content-disposition", "")
                self.check(
                    f"download_{filename}_attachment",
                    "attachment" in disposition.lower() and filename in disposition,
                    disposition,
                )

        self.check_remote_checksum(
            remote_path="/downloads/KMFX-Launcher-macOS.zip.sha256",
            local_sha_path=ROOT / "downloads/KMFX-Launcher-macOS.zip.sha256",
        )
        self.check_remote_checksum(
            remote_path="/downloads/KMFX-Launcher-Windows.exe.sha256",
            local_sha_path=ROOT / "downloads/KMFX-Launcher-Windows.exe.sha256",
        )
        self.check_remote_file_hash(remote_path="/KMFXConnector.ex5", local_path=ROOT / "KMFXConnector.ex5")

    def check_remote_checksum(self, *, remote_path: str, local_sha_path: Path) -> None:
        filename = local_sha_path.name
        response = self.request("GET", self.frontend_url + remote_path)
        expected = local_sha_path.read_text(encoding="utf-8").strip() if local_sha_path.exists() else ""
        actual = response.body.decode("utf-8", errors="replace").strip()
        self.check(f"checksum_{filename}_200", response.status == 200, f"status={response.status}")
        self.check(f"checksum_{filename}_matches_repo", bool(expected) and actual == expected, actual[:120])

    def check_remote_file_hash(self, *, remote_path: str, local_path: Path) -> None:
        filename = local_path.name
        response = self.request("GET", self.frontend_url + remote_path)
        expected = sha256_file(local_path) if local_path.exists() else ""
        actual = hashlib.sha256(response.body).hexdigest() if response.status == 200 else ""
        self.check(f"hash_{filename}_matches_repo", bool(expected) and actual == expected, actual)

    def check_backend(self) -> None:
        health = self.request("GET", self.backend_url + "/health")
        self.check("backend_health_200", health.status == 200, f"status={health.status}")
        self.check("backend_health_ok", json_field(health.body, "ok") is True, body_preview(health.body))

        status = self.request("GET", self.backend_url + "/api/billing/status")
        self.check("billing_status_public_contract", status.status == 200, f"status={status.status}")

        for endpoint in ("/api/billing/checkout", "/api/billing/portal"):
            response = self.request(
                "POST",
                self.backend_url + endpoint,
                headers={"Content-Type": "application/json"},
                data=b"{}",
            )
            self.check(
                f"billing_{endpoint.rsplit('/', 1)[-1]}_requires_auth",
                response.status == 401 and b"auth_required" in response.body,
                f"status={response.status} body={body_preview(response.body)}",
            )

        webhook = self.request(
            "POST",
            self.backend_url + "/api/billing/webhook",
            headers={"Content-Type": "application/json"},
            data=b"{}",
        )
        self.check(
            "billing_webhook_requires_signature",
            webhook.status == 400 and b"invalid_signature" in webhook.body,
            f"status={webhook.status} body={body_preview(webhook.body)}",
        )

    def check_mt5_api(self) -> None:
        health = self.request("GET", self.mt5_api_url + "/health")
        self.check("mt5_api_health_200", health.status == 200, f"status={health.status}")
        self.check("mt5_api_health_ok", json_field(health.body, "ok") is True, body_preview(health.body))
        self.check(
            "mt5_api_proxy_header",
            health.headers.get("x-kmfx-proxy") == "kmfx-mt5-api-proxy",
            health.headers.get("x-kmfx-proxy", ""),
        )

        allowed = self.request(
            "OPTIONS",
            self.mt5_api_url + "/api/mt5/sync",
            headers={
                "Origin": "https://kmfxedge.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-kmfx-connection-key",
            },
        )
        allow_headers = allowed.headers.get("access-control-allow-headers", "")
        self.check("mt5_api_cors_allowed_origin", allowed.headers.get("access-control-allow-origin") == "https://kmfxedge.com", str(allowed.headers))
        self.check("mt5_api_cors_allows_connection_key", "X-KMFX-Connection-Key" in allow_headers, allow_headers)
        self.check("mt5_api_cors_blocks_user_headers", "X-KMFX-User-Email" not in allow_headers, allow_headers)
        self.check("mt5_api_cors_no_wildcard", allowed.headers.get("access-control-allow-origin") != "*", str(allowed.headers))

        denied = self.request(
            "OPTIONS",
            self.mt5_api_url + "/api/mt5/sync",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
        self.check("mt5_api_cors_denies_unknown_origin", denied.status == 403, f"status={denied.status}")

        write = self.request(
            "POST",
            self.mt5_api_url + "/api/mt5/sync",
            headers={"Content-Type": "application/json"},
            data=b'{"login":"000000","broker":"Smoke Test"}',
        )
        self.check(
            "mt5_api_rejects_no_key_sync",
            write.status == 401 and b"missing_connection_key" in write.body,
            f"status={write.status} body={body_preview(write.body)}",
        )

        query_key = self.request(
            "POST",
            self.mt5_api_url + "/api/mt5/sync?connection_key=kmfx_smoke_query_key",
            headers={"Content-Type": "application/json"},
            data=b'{"login":"000000","broker":"Smoke Test"}',
        )
        self.check(
            "mt5_api_query_key_not_accepted",
            query_key.status >= 400 and b'"ok":true' not in query_key.body,
            f"status={query_key.status} body={body_preview(query_key.body)}",
        )


def normalize_base_url(value: str) -> str:
    normalized = str(value or "").strip().rstrip("/")
    if not normalized:
        raise ValueError("base URL is required")
    return normalized


def normalize_headers(headers: Any) -> dict[str, str]:
    return {str(key).lower(): str(value) for key, value in headers.items()}


def parse_int(value: str | None) -> int:
    try:
        return int(str(value or "").strip())
    except ValueError:
        return 0


def body_preview(body: bytes, limit: int = 240) -> str:
    return body.decode("utf-8", errors="replace")[:limit].replace("\n", " ")


def json_field(body: bytes, field: str) -> Any:
    try:
        payload = json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return payload.get(field) if isinstance(payload, dict) else None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run KMFX production smoke checks.")
    parser.add_argument("--frontend-url", default="https://kmfxedge.com")
    parser.add_argument("--backend-url", default="https://kmfx-edge-api.onrender.com")
    parser.add_argument("--mt5-api-url", default="https://mt5-api.kmfxedge.com")
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args()
    return Smoke(
        frontend_url=args.frontend_url,
        backend_url=args.backend_url,
        mt5_api_url=args.mt5_api_url,
        timeout=args.timeout,
    ).run()


if __name__ == "__main__":
    raise SystemExit(main())
