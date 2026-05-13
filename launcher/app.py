from __future__ import annotations

import json
import platform
import re
import subprocess
import sys
import threading
import time
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen
import webbrowser
import os

try:
    import webview
except ImportError as exc:  # pragma: no cover - depends on local runtime setup
    raise SystemExit(
        "pywebview is required to run KMFX Launcher. Install dependencies with: "
        "pip install -r requirements.txt"
    ) from exc

from .config import LauncherConfig, load_config, mask_connection_key, save_bridge_config, save_config
from .backend_client import BackendClient, BackendResponse
from .connector_installer import (
    ConnectorInstallError,
    MT5_CLOUD_BASE_URL,
    MT5_CLOUD_POLICY_PATH,
    MT5_CLOUD_SYNC_PATH,
    connector_installed,
    install_connector,
)
from .log_utils import configure_logging, read_recent_logs
from .mt5_detector import MT5Installation, detect_mt5_installations
from .platform_mac import open_mt5 as open_mt5_mac
from .platform_windows import open_mt5 as open_mt5_windows, register_launcher_url_protocol
from .resources import app_root, is_packaged, resource_path
from .state_store import LauncherStateStore


ROOT = app_root()
UI_PATH = resource_path("launcher", "ui", "index.html")
LAUNCHER_VERSION = "1.0.0"
DEFAULT_CONNECTOR_VERSION = "2.80"
APP_ICON_PATH = resource_path("assets", "logos", "kmfx-edge-glass-mark-1024.png")
STATUS_CACHE_TTL_SECONDS = 18
INSTALLED_LINK_SYNC_TTL_SECONDS = 45
DASHBOARD_RECOVERY_URL = os.getenv("KMFX_DASHBOARD_RECOVERY_URL", "https://kmfxedge.com?auth=recovery")
UNUSABLE_CONNECTION_KEY_REASONS = {
    "connection_key_already_linked",
    "connection_key_not_available",
    "connection_revoked",
    "revoked_connection_key",
    "unknown_connection_key",
}


def _safe_str(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _backend_response_reason(response: BackendResponse) -> str:
    body = response.body if isinstance(response.body, dict) else {}
    return _safe_str(body.get("reason") or body.get("error")).lower()


def _connection_key_is_unusable(response: BackendResponse) -> bool:
    return _backend_response_reason(response) in UNUSABLE_CONNECTION_KEY_REASONS


def _connection_key_preview(account: dict[str, Any]) -> str:
    return _safe_str(
        account.get("server_connection_key_masked")
        or account.get("connection_key_preview")
        or account.get("connectionKeyPreview")
        or account.get("connection_key_masked")
        or account.get("api_key_preview")
    )


def _connection_key_matches_preview(connection_key: str, preview: str) -> bool:
    normalized_key = _safe_str(connection_key)
    normalized_preview = _safe_str(preview)
    return bool(normalized_key and (not normalized_preview or mask_connection_key(normalized_key) == normalized_preview))


def _sanitize_account_label(value: str, fallback: str = "Cuenta MT5") -> str:
    cleaned = re.sub(r"[^\w\s.\-·]", " ", str(value or ""), flags=re.UNICODE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return (cleaned or fallback)[:80]


def _identity_text(*values: Any) -> str:
    return " ".join(str(value or "") for value in values if str(value or "").strip()).replace("_", " ")


def _identity_norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _identity_contains(haystack: Any, needle: Any) -> bool:
    normalized_haystack = f" {_identity_norm(haystack)} "
    normalized_needle = _identity_norm(needle)
    return bool(normalized_needle and f" {normalized_needle} " in normalized_haystack)


def _identity_has_any_marker(value: Any, markers: tuple[str, ...]) -> bool:
    return any(_identity_contains(value, marker) for marker in markers)


def _generic_mt5_label(value: Any) -> bool:
    cleaned = re.sub(r"\s+", " ", str(value or "").replace("_", " ")).strip().lower()
    if not cleaned:
        return True
    if cleaned in {"mt5", "metatrader 5", "kmfx connector mt5", "launcher local"}:
        return True
    if re.fullmatch(r"cuenta mt5(?: \d+)?", cleaned):
        return True
    if re.fullmatch(r"[a-f0-9]{6,}(?:-[a-f0-9]{4,}){2,}", cleaned):
        return True
    technical_markers = (
        "net.metaquotes",
        ".wine.",
        "wine.metatrader",
        "program files",
        "drive c",
        "com.xmuk.",
        "com.metaquotes.",
    )
    return any(marker in cleaned for marker in technical_markers)


def _friendly_mt5_identity_label(*, broker: str = "", server: str = "", login: str = "", fallback: str = "MetaTrader 5") -> str:
    identity = _identity_text(broker, server)
    if _identity_has_any_marker(identity, ("orion", "ogminternational", "ogm international", "ogm")):
        return "Orion OGM MT5"
    if _identity_has_any_marker(identity, ("darwinex", "tradeslide")):
        return "Darwinex MT5"
    if _identity_has_any_marker(identity, ("icmarkets", "ic markets")):
        return "IC Markets MT5"
    if _identity_has_any_marker(identity, ("xmuk", "xm uk")):
        return "XM UK MT5"
    if _identity_has_any_marker(identity, ("ftmo",)):
        return "FTMO MT5"

    broker_label = _sanitize_account_label(broker, "")
    if broker_label and not _generic_mt5_label(broker_label):
        return broker_label

    server_label = _sanitize_account_label(server, "")
    if server_label and not _generic_mt5_label(server_label):
        return server_label

    if login:
        return _sanitize_account_label(f"MT5 {login}", fallback)
    return fallback


def _friendly_installation_label_from_text(value: str, fallback: str = "MetaTrader 5") -> str:
    identity = _identity_text(value)
    if _identity_has_any_marker(identity, ("orion", "ogminternational", "ogm international", "ogm")):
        return "Orion OGM MT5"
    if _identity_has_any_marker(identity, ("darwinex", "tradeslide")):
        return "Darwinex MT5"
    if _identity_has_any_marker(identity, ("icmarkets", "ic markets")):
        return "IC Markets MT5"
    if _identity_has_any_marker(identity, ("xmuk", "xm uk")):
        return "XM UK MT5"
    if _identity_has_any_marker(identity, ("ftmo",)):
        return "FTMO MT5"
    parts = [part.strip() for part in identity.split("·") if part.strip()]
    candidate = parts[-1] if parts else identity
    if _generic_mt5_label(candidate):
        return fallback
    return _sanitize_account_label(candidate, fallback)


def _decode_mt5_log_bytes(raw: bytes) -> str:
    if not raw:
        return ""
    if raw.count(b"\x00") > max(8, len(raw) // 12):
        decoded = raw.decode("utf-16le", errors="ignore")
    else:
        decoded = raw.decode("utf-8", errors="ignore")
    return decoded.replace("\x00", "")


def _recent_mt5_log_text(data_path: str, *, max_files: int = 3, max_bytes: int = 96_000) -> str:
    logs_dir = Path(data_path) / "logs"
    if not logs_dir.exists():
        logs_dir = Path(data_path) / "Logs"
    if not logs_dir.exists():
        return ""
    try:
        log_files = sorted(
            [path for path in logs_dir.glob("*.log") if path.is_file()],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        return ""
    chunks: list[str] = []
    for log_file in log_files[:max_files]:
        try:
            raw = log_file.read_bytes()
        except OSError:
            continue
        chunks.append(_decode_mt5_log_bytes(raw[-max_bytes:]))
    return "\n".join(chunks)


def _infer_mt5_identity_from_logs(data_path: str) -> dict[str, str]:
    text = _recent_mt5_log_text(data_path)
    if not text:
        return {}
    login = ""
    server = ""
    broker = ""
    for match in re.finditer(r"'(?P<login>\d+)':\s+authorized on\s+(?P<server>.+?)\s+through", text, flags=re.IGNORECASE):
        login = match.group("login").strip()
        server = match.group("server").strip()
    for match in re.finditer(r"'(?P<login>\d+)':\s+terminal synchronized with\s+(?P<broker>.+?):", text, flags=re.IGNORECASE):
        login = match.group("login").strip() or login
        broker = match.group("broker").strip()
    return {
        "broker": _sanitize_account_label(broker, ""),
        "server": _sanitize_account_label(server, ""),
        "login": login,
    }


def _read_connector_version() -> str:
    source = resource_path("KMFXConnector.mq5")
    if not source.exists():
        return DEFAULT_CONNECTOR_VERSION
    try:
        body = source.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return DEFAULT_CONNECTOR_VERSION

    define_match = re.search(r'#define\s+KMFX_CONNECTOR_VERSION\s+"([^"]+)"', body)
    if define_match:
        return define_match.group(1)

    property_match = re.search(r'#property\s+version\s+"([^"]+)"', body)
    if property_match:
        return property_match.group(1)

    return DEFAULT_CONNECTOR_VERSION


def _parse_iso(value: str) -> datetime | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    try:
        return datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError:
        return None


def _humanize_last_sync(last_sync: dict[str, Any]) -> str:
    if not last_sync:
        return "Sin sincronización reciente"
    raw_time = (
        last_sync.get("delivered_at")
        or last_sync.get("updated_at")
        or last_sync.get("received_at")
        or last_sync.get("timestamp")
        or last_sync.get("time")
        or ""
    )
    parsed = _parse_iso(str(raw_time))
    if not parsed:
        return "Sin sincronización reciente"

    now = datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    seconds = max(0, int((now - parsed.astimezone(timezone.utc)).total_seconds()))
    if seconds < 5:
        return "Último sync hace 0s"
    if seconds < 60:
        return f"Último sync hace {seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"Último sync hace {minutes}min"
    hours = minutes // 60
    return f"Último sync hace {hours}h"


class KMFXApi:
    def __init__(self) -> None:
        self.config: LauncherConfig = load_config().ensure_runtime_values()
        self.logger = configure_logging(self.config.debug)
        self.backend = BackendClient(self.config)
        self.store = LauncherStateStore()
        self.installations: list[MT5Installation] = []
        self.service_process: subprocess.Popen[str] | None = None
        self.service_thread: threading.Thread | None = None
        self._lock = threading.RLock()
        self._last_service_status: dict[str, Any] = {}
        self._last_service_seen_at = 0.0
        self._service_failure_count = 0
        self._stable_service_on = False
        self._last_sync: dict[str, Any] = {}
        self._last_account_connections: list[dict[str, Any]] = []
        self._last_installed_link_sync_at = 0.0
        self.refresh_installations()
        self.ensure_session()

    def startup(self) -> dict[str, Any]:
        self.ensure_service_started()
        return self.refresh()

    def refresh(self) -> dict[str, Any]:
        with self._lock:
            self.refresh_installations()
            return {
                "status": self.get_status(),
                "installations": self.get_installations(),
                "account_connections": self.get_account_connections(),
                "app_info": self.get_app_info(),
                "session": self.get_session(),
            }

    def refresh_installations(self) -> list[dict[str, Any]]:
        with self._lock:
            self.installations = detect_mt5_installations()
            return self.get_installations()

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            service_status = self.fetch_json("/status") or {}
            fetched_service_status = bool(service_status)
            now = time.time()
            if fetched_service_status:
                self._service_failure_count = 0
                self._last_service_status = service_status
                self._last_service_seen_at = now
                if isinstance(service_status.get("last_sync"), dict) and service_status.get("last_sync"):
                    self._last_sync = service_status.get("last_sync", {})
            else:
                self._service_failure_count += 1
                if self._last_service_status and now - self._last_service_seen_at <= STATUS_CACHE_TTL_SECONDS:
                    service_status = self._last_service_status

            installation = self.selected_installation()
            is_installed = connector_installed(installation) if installation else False
            raw_service_on = bool(service_status.get("ok")) if fetched_service_status else (
                bool(self._last_service_status.get("ok")) and self._service_failure_count < 3
            )
            if raw_service_on:
                self._stable_service_on = True
            elif self._service_failure_count >= 3:
                self._stable_service_on = False
            service_on = self._stable_service_on
            last_sync = service_status.get("last_sync") if isinstance(service_status.get("last_sync"), dict) else self._last_sync

            return {
                "service_on": service_on,
                "backend_reachable": bool(service_status.get("backend_reachable")) if service_on else False,
                "connector_installed": is_installed,
                "repair_recommended": False,
                "last_sync_ago": _humanize_last_sync(last_sync or {}),
                "has_recent_sync": self._sync_is_recent(last_sync or {}),
                "mt5_count": len(self.installations),
                "selected_installation": installation.label if installation else "",
                "backend_base_url": service_status.get("backend_base_url") or self.config.backend_base_url,
                "service_url": self.service_url(""),
                "connection_key": self.config.connection_key,
                "connection_key_masked": mask_connection_key(self.config.connection_key),
                "status_code": service_status.get("backend_status_code", 0),
            }

    def _session_payload(self) -> dict[str, Any]:
        authenticated = bool(self.config.auth_access_token and self.config.auth_email)
        return {
            "authenticated": authenticated,
            "user": {
                "id": self.config.auth_user_id,
                "email": self.config.auth_email,
                "name": self.config.auth_name or self._name_from_email(self.config.auth_email),
            },
        }

    def _session_requires_refresh(self) -> bool:
        expires_at = int(self.config.auth_expires_at or 0)
        return bool(
            self.config.auth_access_token
            and self.config.auth_refresh_token
            and expires_at
            and expires_at <= int(time.time()) + 90
        )

    def _session_is_expired_without_refresh(self) -> bool:
        expires_at = int(self.config.auth_expires_at or 0)
        return bool(
            self.config.auth_access_token
            and not self.config.auth_refresh_token
            and expires_at
            and expires_at <= int(time.time())
        )

    def get_session(self) -> dict[str, Any]:
        self.config = load_config().ensure_runtime_values()
        self.backend.config = self.config
        if self._session_requires_refresh():
            return self.ensure_session()
        if self._session_is_expired_without_refresh():
            self.logger.warning("[KMFX][AUTH] launcher session expired without refresh token; clearing session")
            self._clear_expired_auth_session()
        return self._session_payload()

    def login(self, email: str, password: str) -> dict[str, Any]:
        normalized_email = str(email or "").strip().lower()
        if not normalized_email or not password:
            return {"ok": False, "message": "Introduce tu email y contraseña de KMFX Edge."}
        response = self.backend.sign_in_with_password(email=normalized_email, password=password)
        if not response.ok:
            return {"ok": False, "message": self._auth_error_message(response)}
        self._store_auth_response(response.body)
        self.ensure_remote_account_link()
        return {"ok": True, "message": "Sesión iniciada.", "session": self.get_session(), "status": self.get_status()}

    def login_with_google(self) -> dict[str, Any]:
        self.ensure_service_started()
        result = None
        for _ in range(20):
            result = self.fetch_json("/auth/google/start")
            if result:
                break
            time.sleep(0.15)
        if not result or not result.get("ok") or not result.get("auth_url"):
            return {"ok": False, "message": "No se pudo preparar el login con Google."}
        self.logger.info(
            "[KMFX][AUTH][GOOGLE] opening system browser redirect_to=%s",
            result.get("redirect_to", ""),
        )
        try:
            if not webbrowser.open(str(result.get("auth_url") or "")):
                return {"ok": False, "message": "No se pudo abrir el navegador para Google."}
        except Exception as exc:
            self.logger.warning("[KMFX][AUTH][GOOGLE] browser open failed error=%s", exc)
            return {"ok": False, "message": "No se pudo abrir el navegador para Google."}
        return {"ok": True, "pending": True, "message": "Completa el acceso con Google en tu navegador."}

    def get_oauth_status(self) -> dict[str, Any]:
        status = self.fetch_json("/auth/status") or {"status": "idle", "session": self.get_session()}
        session = status.get("session") if isinstance(status.get("session"), dict) else {}
        if session.get("authenticated"):
            self.config = load_config().ensure_runtime_values()
            self.backend.config = self.config
        return status

    def open_password_reset(self) -> dict[str, Any]:
        try:
            opened = webbrowser.open(DASHBOARD_RECOVERY_URL)
        except Exception as exc:
            self.logger.warning("[KMFX][AUTH][RECOVERY] open failed error=%s", exc)
            opened = False
        return {
            "ok": bool(opened),
            "message": "Hemos abierto la recuperación de contraseña en tu navegador."
            if opened
            else "No se pudo abrir la recuperación de contraseña.",
        }

    def logout(self) -> dict[str, Any]:
        access_token = self.config.auth_access_token
        if access_token:
            self.backend.sign_out(access_token=access_token)
        self.config.auth_access_token = ""
        self.config.auth_refresh_token = ""
        self.config.auth_expires_at = 0
        self.config.auth_user_id = ""
        self.config.auth_email = ""
        self.config.auth_name = ""
        self.config.backend_token = ""
        self.config.connection_key = ""
        self.config.connection_key_user_id = ""
        save_config(self.config)
        save_bridge_config(self.config, user_id="")
        self.fetch_json("/bridge/reload-config")
        return {"ok": True, "message": "Sesión cerrada.", "session": self.get_session()}

    def _clear_expired_auth_session(self) -> None:
        self.config.auth_access_token = ""
        self.config.auth_refresh_token = ""
        self.config.auth_expires_at = 0
        self.config.auth_user_id = ""
        self.config.auth_email = ""
        self.config.auth_name = ""
        self.config.backend_token = ""
        save_config(self.config)
        self.backend.config = self.config

    def ensure_session(self) -> dict[str, Any]:
        self.config = load_config().ensure_runtime_values()
        self.backend.config = self.config
        if self.config.auth_access_token:
            self.config.backend_token = self.config.auth_access_token
        expires_at = int(self.config.auth_expires_at or 0)
        if self.config.auth_refresh_token and expires_at and expires_at <= int(time.time()) + 90:
            response = self.backend.refresh_auth_session(refresh_token=self.config.auth_refresh_token)
            if response.ok:
                self._store_auth_response(response.body)
            elif response.status_code in {400, 401, 403}:
                self.logger.warning("[KMFX][AUTH] refresh rejected; clearing expired launcher session")
                self._clear_expired_auth_session()
            else:
                self.logger.warning("[KMFX][AUTH] refresh failed; keeping launcher session until logout")
        return self._session_payload()

    def _force_refresh_session(self, reason: str) -> bool:
        if not self.config.auth_refresh_token:
            return False
        self.logger.info("[KMFX][AUTH] force refresh start reason=%s", reason)
        response = self.backend.refresh_auth_session(refresh_token=self.config.auth_refresh_token)
        if response.ok:
            self._store_auth_response(response.body)
            self.logger.info("[KMFX][AUTH] force refresh ok reason=%s", reason)
            return True
        if response.status_code in {400, 401, 403}:
            self.logger.warning("[KMFX][AUTH] force refresh rejected; clearing launcher session")
            self._clear_expired_auth_session()
        else:
            self.logger.warning("[KMFX][AUTH] force refresh failed status=%s", response.status_code)
        return False

    def link_account_with_session(
        self,
        *,
        user_id: str = "",
        label: str = "",
        account_id: str = "",
        connection_key: str | None = None,
    ) -> BackendResponse:
        self.ensure_session()
        response = self.backend.link_account(
            user_id=user_id,
            label=label,
            account_id=account_id,
            connection_key=connection_key,
        )
        if response.status_code == 401 and self._force_refresh_session("link_account_401"):
            response = self.backend.link_account(
                user_id=user_id,
                label=label,
                account_id=account_id,
                connection_key=connection_key,
            )
        return response

    def regenerate_account_key_with_session(self, account_id: str) -> BackendResponse:
        self.ensure_session()
        response = self.backend.regenerate_account_key(account_id=account_id)
        if response.status_code == 401 and self._force_refresh_session("regenerate_account_key_401"):
            response = self.backend.regenerate_account_key(account_id=account_id)
        return response

    def get_account_key_with_session(self, account_id: str) -> BackendResponse:
        self.ensure_session()
        response = self.backend.get_account_key(account_id=account_id)
        if response.status_code == 401 and self._force_refresh_session("get_account_key_401"):
            response = self.backend.get_account_key(account_id=account_id)
        return response

    def ensure_remote_account_link(self) -> dict[str, Any]:
        if not self.config.auth_user_id:
            return {"ok": False, "message": "Sesión no iniciada."}
        if self.config.connection_key or self.config.connection_key_user_id:
            self.logger.info(
                "[KMFX][AUTH][LINK] clearing legacy launcher-level key key=%s",
                mask_connection_key(self.config.connection_key),
            )
            self.config.connection_key = ""
            self.config.connection_key_user_id = ""
            self.config.backend_token = self.config.auth_access_token or self.config.backend_token
            save_config(self.config)
        save_config(self.config)
        save_bridge_config(self.config, user_id=self.config.auth_user_id)
        self.fetch_json("/bridge/reload-config")
        self.logger.info("[KMFX][AUTH][LINK] launcher session ready; dashboard owns MT5 keys")
        return {
            "ok": True,
            "message": "Sesión lista. Copia la KMFXKey desde Cuentas.",
        }

    def cache_linked_account_connection(self, body: dict[str, Any] | None, *, label: str = "") -> dict[str, Any]:
        if not isinstance(body, dict):
            return {}
        launcher_config = body.get("launcher_config") if isinstance(body.get("launcher_config"), dict) else {}
        connection_key = _safe_str(body.get("connection_key") or launcher_config.get("connection_key"))
        account_id = _safe_str(body.get("account_id"))
        if not account_id or not connection_key:
            return {}
        cached = {
            "account_id": account_id,
            "label": _sanitize_account_label(label or body.get("alias") or body.get("display_name") or "Cuenta MT5"),
            "platform": "mt5",
            "connection_key": connection_key,
            "connection_key_masked": mask_connection_key(connection_key),
            "status": _safe_str(body.get("status") or body.get("lifecycle_status"), "pending_link"),
            "last_sync_at": _safe_str(body.get("last_sync_at")),
        }
        self.store.save_account_connection(cached)
        return cached

    def link_account_error_message(self, response: BackendResponse) -> str:
        body = response.body if isinstance(response.body, dict) else {}
        reason = _safe_str(body.get("reason") or body.get("error"))
        details = body.get("details") if isinstance(body.get("details"), dict) else {}
        if reason in {"connection_limit_exceeded", "plan_limit_reached"}:
            limit = details.get("connection_limit")
            current = details.get("current_connections")
            if limit is not None and current is not None:
                return f"Límite de conexiones alcanzado: tu plan permite {limit} cuenta MT5 y ya tienes {current}."
            return "Límite de conexiones alcanzado. Libera una cuenta o amplía el límite en KMFX Edge."
        if reason in {"connection_keys_not_allowed", "entitlement_required"}:
            return "Tu plan no tiene conexiones MT5 activas. Revisa el acceso de tu cuenta en KMFX Edge."
        if reason == "billing_required":
            return "Activa tu suscripción para crear conexiones MT5."
        if reason == "billing_past_due":
            return "Actualiza el pago de tu suscripción para crear conexiones MT5."
        if reason == "auth_required":
            return "Inicia sesión de nuevo para crear una conexión MT5."
        if reason in UNUSABLE_CONNECTION_KEY_REASONS:
            return (
                "La KMFXKey de esa cuenta no está disponible para reinstalar desde el Launcher. "
                "Abre Cuentas > Detalles, copia la KMFXKey y pégala en el EA. "
                "Crea otra cuenta solo si vas a conectar otro MT5."
            )
        if reason == "connection_key_already_linked":
            return "Esta clave ya está vinculada a otra cuenta."
        if response.status_code == 0:
            return "No se pudo conectar con el servidor de KMFX."
        return "No se pudo crear la conexión MT5."

    def get_account_connections(self) -> list[dict[str, Any]]:
        with self._lock:
            if not self.get_session().get("authenticated"):
                return []
            cached_connections = self.store.list_account_connections()
            cached_by_id = {
                _safe_str(account.get("account_id")): account
                for account in cached_connections
                if _safe_str(account.get("account_id")) and _safe_str(account.get("connection_key"))
            }
            response = self.backend.get_accounts_registry()
            if not response.ok:
                connections = list(self._last_account_connections)
                if not connections:
                    connections = [
                        self.serialize_account_connection(account)
                        for account in cached_connections
                        if _safe_str(account.get("connection_key"))
                    ]
                if not connections and self.config.connection_key:
                    connections = [self.serialize_local_connection_fallback()]
                return connections

            accounts = response.body.get("accounts") if isinstance(response.body, dict) else []
            if not isinstance(accounts, list):
                accounts = []
            hydrated_accounts: list[dict[str, Any]] = []
            for account in accounts:
                if not isinstance(account, dict):
                    continue
                hydrated = dict(account)
                cached = cached_by_id.get(_safe_str(hydrated.get("account_id")))
                backend_marks_key_revoked = bool(
                    hydrated.get("connection_key_revoked")
                    or _safe_str(hydrated.get("connection_key_revoked_at"))
                )
                server_preview = _connection_key_preview(hydrated)
                cached_key = _safe_str(cached.get("connection_key")) if cached else ""
                if cached_key and not _safe_str(hydrated.get("connection_key")) and not backend_marks_key_revoked:
                    if _connection_key_matches_preview(cached_key, server_preview):
                        hydrated["connection_key"] = cached_key
                        hydrated["connection_key_masked"] = mask_connection_key(cached_key)
                        hydrated["local_connection_key_masked"] = mask_connection_key(cached_key)
                    else:
                        hydrated["connection_key_mismatch"] = True
                        hydrated["needs_key_reinstall"] = True
                        hydrated["local_connection_key_masked"] = mask_connection_key(cached_key)
                        if server_preview:
                            hydrated["connection_key_masked"] = server_preview
                hydrated_accounts.append(hydrated)
            connections = [
                self.serialize_account_connection(account)
                for account in hydrated_accounts
                if self.account_has_connection_key(account)
                and self.should_show_account_connection(account)
            ]
            present_ids = {_safe_str(connection.get("account_id")) for connection in connections}
            self.store.retain_account_connections(present_ids)
            connections.sort(key=lambda item: (item["status_order"], item["label"].lower(), item["login"]))
            self._last_account_connections = connections
            return list(connections)

    def create_account_connection(self, label: str = "") -> dict[str, Any]:
        with self._lock:
            if not self.get_session().get("authenticated"):
                return {"ok": False, "message": "Inicia sesión para crear una conexión MT5."}
            existing_count = len(self.get_account_connections())
            resolved_label = _sanitize_account_label(label, f"Cuenta MT5 {existing_count + 1}")
            response = self.link_account_with_session(
                user_id=self.config.auth_user_id,
                label=resolved_label,
                connection_key="",
            )
            if not response.ok:
                return {"ok": False, "message": self.link_account_error_message(response)}
            self.cache_linked_account_connection(response.body, label=resolved_label)
            return {
                "ok": True,
                "message": "Conexión MT5 creada.",
                "account_connections": self.get_account_connections(),
            }

    def ensure_installed_account_links(self, force: bool = False) -> None:
        if not self.config.auth_user_id:
            return
        now = time.time()
        if not force and now - self._last_installed_link_sync_at < INSTALLED_LINK_SYNC_TTL_SECONDS:
            return
        self._last_installed_link_sync_at = now

        remote_connections = self.remote_account_connections()
        seen_keys: set[str] = set()
        for installation in self.installations:
            connection_key = self.installed_connection_key(installation)
            if not connection_key or connection_key in seen_keys:
                continue
            seen_keys.add(connection_key)
            remote_connection = self.remote_connection_for_key(connection_key, remote_connections)
            if not remote_connection:
                self.logger.info(
                    "[KMFX][LAUNCHER][LINK] installed MT5 key not linked automatically target=%s key=%s",
                    installation.label,
                    mask_connection_key(connection_key),
                )
                continue

            cached = dict(remote_connection)
            cached["connection_key"] = connection_key
            cached["connection_key_masked"] = mask_connection_key(connection_key)
            self.store.save_account_connection(cached)
            self.logger.info(
                "[KMFX][LAUNCHER][LINK] installed MT5 key matched existing account target=%s account_id=%s key=%s",
                installation.label,
                cached.get("account_id", ""),
                mask_connection_key(connection_key),
            )

    def installed_key_occurrences(self) -> dict[str, int]:
        occurrences: dict[str, int] = {}
        for installation in self.installations:
            connection_key = self.installed_connection_key(installation)
            if connection_key:
                occurrences[connection_key] = occurrences.get(connection_key, 0) + 1
        return occurrences

    def installation_has_shared_connection_key(self, installation: MT5Installation) -> bool:
        connection_key = self.installed_connection_key(installation)
        return bool(connection_key and self.installed_key_occurrences().get(connection_key, 0) > 1)

    def account_connection_by_id(self, account_id: str) -> dict[str, Any] | None:
        normalized = _safe_str(account_id)
        if not normalized:
            return None
        connection = next((connection for connection in self.get_account_connections() if connection.get("account_id") == normalized), None)
        if connection:
            return connection
        return next(
            (connection for connection in self.remote_account_connections() if connection.get("account_id") == normalized),
            None,
        )

    def remote_account_connections(self) -> list[dict[str, Any]]:
        if not hasattr(self.backend, "get_accounts_registry"):
            return []
        response = self.backend.get_accounts_registry()
        if not response.ok:
            return []
        accounts = response.body.get("accounts") if isinstance(response.body, dict) else []
        if not isinstance(accounts, list):
            return []
        return [
            self.serialize_account_connection(account)
            for account in accounts
            if isinstance(account, dict) and self.account_has_connection_key(account) and self.should_show_account_connection(account)
        ]

    def remote_connection_for_key(
        self,
        connection_key: str,
        connections: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        normalized = _safe_str(connection_key)
        if not normalized:
            return {}
        candidates = connections if connections is not None else self.remote_account_connections()
        masked = mask_connection_key(normalized)
        return next(
            (
                item
                for item in candidates
                if _safe_str(item.get("connection_key")) == normalized
                or _safe_str(item.get("connection_key_masked")) == masked
                or _safe_str(item.get("server_connection_key_masked")) == masked
            ),
            {},
        )

    def remote_connection_for_installation(self, installation: MT5Installation) -> dict[str, Any]:
        candidates = self.remote_account_connections()
        scored = [
            (self.installation_identity_score(installation, candidate), candidate)
            for candidate in candidates
        ]
        scored.sort(key=lambda item: item[0], reverse=True)
        if scored and scored[0][0] >= 100:
            return scored[0][1]
        return {}

    def installation_identity_score(self, installation: MT5Installation, connection: dict[str, Any]) -> int:
        connection_key = _safe_str(connection.get("connection_key"))
        installed_key = self.installed_connection_key(installation)
        if connection_key and installed_key == connection_key:
            return 1000

        inferred_identity = _infer_mt5_identity_from_logs(installation.data_path)
        installation_text = _identity_text(
            installation.label,
            installation.data_path,
            inferred_identity.get("broker"),
            inferred_identity.get("server"),
            inferred_identity.get("login"),
            self.installed_connection_label(installation),
        )
        score = 0
        login = _safe_str(connection.get("login"))
        server = _safe_str(connection.get("server"))
        broker = _safe_str(connection.get("broker"))
        label = _safe_str(connection.get("label") or connection.get("display_label"))

        if login and login == _safe_str(inferred_identity.get("login")):
            score += 160
        if server and _identity_contains(installation_text, server):
            score += 110
        if broker and _identity_contains(installation_text, broker):
            score += 90

        marker_sets = (
            ("darwinex", "tradeslide"),
            ("orion", "ogm", "ogminternational"),
            ("icmarkets", "ic markets", "raw trading"),
            ("xmuk", "xm uk"),
            ("ftmo",),
        )
        connection_text = _identity_text(label, broker, server)
        for markers in marker_sets:
            connection_has_marker = _identity_has_any_marker(connection_text, markers)
            installation_has_marker = _identity_has_any_marker(installation_text, markers)
            if connection_has_marker and installation_has_marker:
                score += 80
                break

        friendly_label = _friendly_mt5_identity_label(broker=broker, server=server, login=login, fallback="")
        if friendly_label and _identity_contains(installation_text, friendly_label):
            score += 40

        return score

    def installation_for_connection(
        self,
        connection: dict[str, Any],
        selected_installation: str | None = None,
    ) -> MT5Installation | None:
        if not self.installations:
            return None

        scored = [
            (self.installation_identity_score(installation, connection), installation)
            for installation in self.installations
        ]
        scored.sort(key=lambda item: item[0], reverse=True)
        best_score, best_installation = scored[0]
        if best_score >= 100:
            selected = self.selected_installation(selected_installation)
            if selected and selected.label != best_installation.label:
                self.logger.info(
                    "[KMFX][LAUNCHER][INSTALL] account identity selected MT5 target=%s over selected=%s score=%s account_id=%s",
                    best_installation.label,
                    selected.label,
                    best_score,
                    connection.get("account_id", ""),
                )
            return best_installation

        return self.selected_installation(selected_installation)

    def get_installations(self) -> list[dict[str, Any]]:
        serialized = [self.serialize_installation(installation) for installation in self.installations]
        return sorted(
            serialized,
            key=lambda item: (
                int(item.get("sort_order", 50)),
                str(item.get("display_label") or item.get("label") or "").lower(),
            ),
        )

    def install_connector(self, selected_installation: str | None = None) -> dict[str, Any]:
        with self._lock:
            if not self.get_session().get("authenticated"):
                return {"ok": False, "message": "Inicia sesión para instalar el conector."}
            installation = self.selected_installation(selected_installation)
            if installation is None:
                return {"ok": False, "message": "No se ha detectado una instalación de MetaTrader 5."}

            self.config.selected_mt5_terminal_path = installation.terminal_path
            self.config.selected_mt5_data_path = installation.data_path
            self.config.selected_mt5_experts_path = installation.experts_path
            save_config(self.config)

            connection_key = self.installed_connection_key(installation)
            label = self.installed_connection_label(installation)
            if connection_key and not self.installation_has_shared_connection_key(installation):
                existing_connection = self.remote_connection_for_key(connection_key) or self.account_connection_for_key(connection_key)
                if existing_connection.get("account_id"):
                    return self.install_connector_for_connection(existing_connection["account_id"], installation.label)

                identity_connection = self.remote_connection_for_installation(installation)
                if identity_connection.get("account_id"):
                    self.logger.info(
                        "[KMFX][LAUNCHER][INSTALL] replacing stale local key with dashboard account key target=%s account_id=%s old_key=%s",
                        installation.label,
                        identity_connection.get("account_id", ""),
                        mask_connection_key(connection_key),
                    )
                    return self.install_connector_for_connection(identity_connection["account_id"], installation.label)

                self.logger.info(
                    "[KMFX][LAUNCHER][INSTALL] installed key is unknown to dashboard; refusing silent account creation target=%s old_key=%s",
                    installation.label,
                    mask_connection_key(connection_key),
                )
                return {
                    "ok": False,
                    "message": (
                        "Esta instalación MT5 tiene una KMFXKey que no existe en tu dashboard. "
                        "Abre Cuentas > Ver detalles, copia la KMFXKey correcta y vuelve a instalar el conector desde esa cuenta."
                    ),
                }

            identity_connection = self.remote_connection_for_installation(installation)
            if identity_connection.get("account_id"):
                return self.install_connector_for_connection(identity_connection["account_id"], installation.label)

            available_connections = [
                connection
                for connection in self.get_account_connections()
                if _safe_str(connection.get("account_id"))
                and _safe_str(connection.get("connection_key"))
                and not connection.get("connection_key_revoked")
                and not connection.get("connection_key_mismatch")
            ]
            pending_connections = [
                connection
                for connection in available_connections
                if _safe_str(connection.get("status")).lower() in {"pending_link", "pending_setup", "waiting_sync", "draft", "linked"}
                and not _safe_str(connection.get("login"))
            ]
            if len(pending_connections) == 1:
                return self.install_connector_for_connection(pending_connections[0]["account_id"], installation.label)

            self.logger.info(
                "[KMFX][LAUNCHER][INSTALL] install requires dashboard account selection target=%s candidates=%s",
                installation.label,
                len(available_connections),
            )
            return {
                "ok": False,
                "message": (
                    "Crea la cuenta en el dashboard y pulsa Reinstalar en esa cuenta. "
                    "El Launcher no genera KMFXKeys nuevas."
                ),
            }

    def install_connector_for_connection(self, account_id: str, selected_installation: str | None = None) -> dict[str, Any]:
        with self._lock:
            if not self.get_session().get("authenticated"):
                return {"ok": False, "message": "Inicia sesión para instalar el conector."}
            connection = self.account_connection_by_id(account_id)
            if not connection:
                return {"ok": False, "message": "No encuentro esa cuenta MT5 en el launcher."}
            connection_key = _safe_str(connection.get("connection_key"))
            label = _sanitize_account_label(connection.get("label") or connection.get("display_label") or "Cuenta MT5")
            normalized_account_id = _safe_str(connection.get("account_id"))
            key_mismatch = bool(
                connection.get("connection_key_mismatch")
                or connection.get("needs_key_reinstall")
            )
            key_revoked = bool(
                connection.get("connection_key_revoked")
                or _safe_str(connection.get("connection_key_revoked_at"))
            )
            installation = self.installation_for_connection(connection, selected_installation)
            if installation is None:
                return {"ok": False, "message": "No se ha detectado una instalación de MetaTrader 5."}

            server_preview = _connection_key_preview(connection)
            installed_key = self.installed_connection_key(installation)
            if not connection_key and server_preview and _connection_key_matches_preview(installed_key, server_preview):
                connection_key = installed_key
                connection["connection_key"] = installed_key
                connection["connection_key_masked"] = mask_connection_key(installed_key)

            if (not connection_key or key_revoked or key_mismatch) and normalized_account_id:
                key_response = self.get_account_key_with_session(normalized_account_id)
                if key_response.ok:
                    current_connection_key = _safe_str(key_response.body.get("connection_key"))
                    if current_connection_key:
                        connection_key = current_connection_key
                        key_revoked = False
                        key_mismatch = False
                        connection["connection_key"] = connection_key
                        connection["connection_key_masked"] = mask_connection_key(connection_key)
                elif _backend_response_reason(key_response) == "connection_key_revoked":
                    key_revoked = True

            if key_revoked:
                self.logger.info(
                    "[KMFX][LAUNCHER][INSTALL] account key revoked account_id=%s",
                    normalized_account_id,
                )
                return {
                    "ok": False,
                    "message": (
                        "La KMFXKey de esta cuenta ya no está activa. "
                        "Abre Cuentas > Ver detalles y usa la KMFXKey actual de esa cuenta. "
                        "Crea otra cuenta solo si realmente vas a conectar otro MT5."
                    ),
                }
            if not connection_key:
                self.logger.info(
                    "[KMFX][LAUNCHER][INSTALL] account has no recoverable raw key account_id=%s",
                    normalized_account_id,
                )
                return {
                    "ok": False,
                    "message": (
                        "No pude recuperar la KMFXKey de esa cuenta desde KMFX. "
                        "Abre Cuentas > Detalles y vuelve a intentarlo."
                    ),
                }

            self.config.selected_mt5_terminal_path = installation.terminal_path
            self.config.selected_mt5_data_path = installation.data_path
            self.config.selected_mt5_experts_path = installation.experts_path
            save_config(self.config)

            install_config = replace(self.config)
            install_config.connection_key = connection_key
            try:
                result = install_connector(installation, install_config)
            except ConnectorInstallError as exc:
                self.logger.error("[KMFX][LAUNCHER][INSTALL] connector resource missing: %s", exc)
                return {"ok": False, "message": str(exc)}
            self.logger.info(
                "[KMFX][LAUNCHER][INSTALL] connector installed target=%s account_id=%s key=%s",
                installation.label,
                connection.get("account_id", ""),
                mask_connection_key(connection_key),
            )
            self.refresh_installations()
            self.ensure_installed_account_links(force=True)
            return {
                "ok": True,
                "message": f"Conector instalado para {connection.get('label') or 'Cuenta MT5'}.",
                "result": result,
                "status": self.get_status(),
                "installations": self.get_installations(),
                "account_connections": self.get_account_connections(),
            }

    def repair_connector(self, selected_installation: str | None = None) -> dict[str, Any]:
        with self._lock:
            installation = self.selected_installation(selected_installation)
            if installation is None:
                return self.install_connector(selected_installation)

            installed_key = self.installed_connection_key(installation)
            connection = self.account_connection_for_key(installed_key)
            if not connection:
                candidates = self.remote_account_connections()
                scored = [
                    (self.installation_identity_score(installation, candidate), candidate)
                    for candidate in candidates
                ]
                scored.sort(key=lambda item: item[0], reverse=True)
                if scored and scored[0][0] >= 100:
                    connection = scored[0][1]

            account_id = _safe_str(connection.get("account_id")) if connection else ""
            if account_id:
                self.logger.info(
                    "[KMFX][LAUNCHER][INSTALL] repair resolved account target=%s account_id=%s key=%s",
                    installation.label,
                    account_id,
                    mask_connection_key(installed_key),
                )
                return self.install_connector_for_connection(account_id, installation.label)

            return self.install_connector(selected_installation)

    def open_mt5(self, selected_installation: str | None = None) -> dict[str, Any]:
        with self._lock:
            installation = self.selected_installation(selected_installation)
            terminal_path = installation.terminal_path if installation else self.config.selected_mt5_terminal_path
            if not terminal_path:
                return {"ok": False, "message": "No hay terminal MT5 detectada para abrir."}
            opener = open_mt5_mac if platform.system().lower() == "darwin" else open_mt5_windows
            opened = opener(terminal_path, self.mt5_display_name(installation))
            return {
                "ok": opened,
                "message": "MetaTrader abierto." if opened else "No se pudo abrir MetaTrader automáticamente.",
            }

    def open_mt5_folder(self, selected_installation: str | None = None) -> dict[str, Any]:
        with self._lock:
            installation = self.selected_installation(selected_installation)
            raw_folder = installation.data_path if installation else self.config.selected_mt5_data_path
            if not raw_folder:
                return {"ok": False, "message": "No hay carpeta MT5 detectada."}
            folder = Path(raw_folder)
            if not folder.exists():
                return {"ok": False, "message": "La carpeta MT5 detectada ya no existe."}
            try:
                if platform.system().lower() == "darwin":
                    subprocess.Popen(["open", str(folder)])
                elif platform.system().lower() == "windows":
                    subprocess.Popen(["explorer", str(folder)])
                else:
                    subprocess.Popen(["xdg-open", str(folder)])
            except Exception as exc:
                return {"ok": False, "message": f"No se pudo abrir la carpeta: {exc}"}
            return {"ok": True, "message": "Carpeta MT5 abierta."}

    def get_app_info(self) -> dict[str, str]:
        return {
            "launcher_version": LAUNCHER_VERSION,
            "connector_version": _read_connector_version(),
            "backend_url": self.config.backend_base_url,
            "service_url": self.service_url(""),
            "app_icon_path": str(APP_ICON_PATH),
        }

    def get_diagnostics(self) -> dict[str, Any]:
        with self._lock:
            status = self._last_service_status or self.fetch_json("/status") or {}
            bridge_key = str(status.get("connection_key") or self.config.connection_key or "")
            return {
                "connection_key": mask_connection_key(bridge_key),
                "backend_reachable": bool(status.get("backend_reachable")) if status else False,
                "backend_status_code": status.get("backend_status_code", 0) if status else 0,
                "backend_url": status.get("backend_base_url") or self.config.backend_base_url,
                "service_url": self.service_url(""),
                "installations_count": len(self.installations),
                "selected_terminal_path": self.config.selected_mt5_terminal_path,
                "selected_data_path": self.config.selected_mt5_data_path,
                "selected_experts_path": self.config.selected_mt5_experts_path,
                "last_sync": status.get("last_sync", {}) if status else {},
                "logs": read_recent_logs(80),
            }

    def shutdown(self) -> None:
        self.stop_service()

    def selected_installation(self, selected_installation: str | None = None) -> MT5Installation | None:
        if not self.installations:
            return None
        selected = str(selected_installation or "").strip()
        if selected:
            match = next((item for item in self.installations if item.label == selected), None)
            if match:
                return match
        preferred = next(
            (item for item in self.installations if item.experts_path == self.config.selected_mt5_experts_path),
            None,
        )
        return preferred or self.installations[0]

    def installed_connection_key(self, installation: MT5Installation) -> str:
        config_path = Path(installation.data_path) / "MQL5" / "Files" / "kmfx_connection.conf"
        if not config_path.exists():
            return ""
        try:
            lines = config_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            return ""
        for line in lines:
            if line.startswith("connection_key="):
                return _safe_str(line.split("=", 1)[1])
        return ""

    def installed_connection_label(self, installation: MT5Installation) -> str:
        raw_label = _identity_text(installation.label, installation.data_path)
        return _friendly_installation_label_from_text(raw_label, "Cuenta MT5")

    def mt5_display_name(self, installation: MT5Installation | None) -> str:
        if installation is None:
            return "KMFX MT5"
        key = self.installed_connection_key(installation)
        connections = self._last_account_connections
        if key and not connections:
            connections = self.get_account_connections()
        matching_connection = next(
            (item for item in connections if key and _safe_str(item.get("connection_key")) == key),
            {},
        )
        identity = _identity_text(
            installation.label,
            installation.data_path,
            matching_connection.get("label"),
            matching_connection.get("broker"),
            matching_connection.get("server"),
        )
        inferred_identity = _infer_mt5_identity_from_logs(installation.data_path)
        if inferred_identity:
            identity = _identity_text(
                identity,
                inferred_identity.get("broker"),
                inferred_identity.get("server"),
            )
        if _identity_has_any_marker(identity, ("orion", "ogminternational", "ogm international", "ogm")):
            return "KMFX MT5 Orion"
        if _identity_has_any_marker(identity, ("darwinex", "tradeslide")):
            return "KMFX MT5 Darwinex"
        if _identity_has_any_marker(identity, ("icmarkets", "ic markets")):
            return "KMFX MT5 IC Markets"
        login = _safe_str(matching_connection.get("login"))
        if login:
            return _sanitize_account_label(f"KMFX MT5 {login}", "KMFX MT5")
        return _sanitize_account_label(f"KMFX MT5 {self.installed_connection_label(installation)}", "KMFX MT5")

    def account_connection_for_key(self, connection_key: str) -> dict[str, Any]:
        normalized = _safe_str(connection_key)
        if not normalized:
            return {}
        connections = getattr(self, "_last_account_connections", [])
        if not connections:
            connections = self.get_account_connections()
        matched = next(
            (item for item in connections if _safe_str(item.get("connection_key")) == normalized),
            {},
        )
        if matched:
            return matched
        masked = mask_connection_key(normalized)
        return next(
            (
                item
                for item in self.remote_account_connections()
                if masked and _safe_str(item.get("connection_key_masked")) == masked
            ),
            {},
        )

    def installation_display_label(self, installation: MT5Installation, connection: dict[str, Any] | None = None) -> str:
        connection = connection or {}
        login = _safe_str(connection.get("login"))
        broker = _safe_str(connection.get("broker"))
        server = _safe_str(connection.get("server"))
        if not (broker or server or login):
            inferred_identity = _infer_mt5_identity_from_logs(installation.data_path)
            broker = _safe_str(inferred_identity.get("broker"))
            server = _safe_str(inferred_identity.get("server"))
            login = _safe_str(inferred_identity.get("login"))
        if broker or server or login:
            label = _friendly_mt5_identity_label(broker=broker, server=server, login=login)
            if login:
                return _sanitize_account_label(f"{label} · {login}", label)
            return label
        return _friendly_installation_label_from_text(
            _identity_text(installation.label, installation.data_path),
            "MetaTrader 5",
        )

    def installation_sort_order(self, installation: MT5Installation, connection: dict[str, Any], connector_ready: bool) -> int:
        identity = " ".join([installation.label, installation.data_path]).lower()
        if "backup" in identity or "broken" in identity:
            return 80
        if connection:
            return 0 if _safe_str(connection.get("status")).lower() == "active" else 10
        if self.installed_connection_key(installation):
            return 20
        if connector_ready:
            return 30
        return 50

    def serialize_installation(self, installation: MT5Installation) -> dict[str, Any]:
        connection_key = self.installed_connection_key(installation)
        connection = self.account_connection_for_key(connection_key)
        connector_ready = connector_installed(installation)
        return {
            "label": installation.label,
            "display_label": self.installation_display_label(installation, connection),
            "terminal_path": installation.terminal_path,
            "data_path": installation.data_path,
            "experts_path": installation.experts_path,
            "presets_path": installation.presets_path,
            "platform_name": installation.platform_name,
            "connector_installed": connector_ready,
            "connection_key": connection_key,
            "connection_key_masked": mask_connection_key(connection_key),
            "linked_account_id": _safe_str(connection.get("account_id")),
            "sort_order": self.installation_sort_order(installation, connection, connector_ready),
        }

    def serialize_account_connection(self, account: dict[str, Any]) -> dict[str, Any]:
        connection_key = _safe_str(account.get("connection_key"))
        server_connection_key_masked = _connection_key_preview(account)
        connection_key_masked = _safe_str(server_connection_key_masked or mask_connection_key(connection_key))
        local_connection_key_masked = _safe_str(account.get("local_connection_key_masked"))
        key_mismatch = bool(account.get("connection_key_mismatch") or account.get("needs_key_reinstall"))
        key_revoked_at = _safe_str(account.get("connection_key_revoked_at"))
        key_revoked = bool(account.get("connection_key_revoked") or key_revoked_at)
        broker = _safe_str(account.get("broker"))
        login = _safe_str(account.get("login") or account.get("mt5_login"))
        server = _safe_str(account.get("server"))
        status = _safe_str(account.get("status") or account.get("lifecycle_status"), "pending_link")
        raw_display_name = _safe_str(
            account.get("display_name")
            or account.get("alias")
            or account.get("nickname")
            or (f"{broker} {login}".strip() if broker or login else ""),
            "Cuenta MT5",
        )
        broker_display_name = _friendly_mt5_identity_label(broker=broker, server=server, login=login, fallback="")
        display_name = broker_display_name if broker_display_name and _generic_mt5_label(raw_display_name) else raw_display_name
        display_name = _sanitize_account_label(display_name, "Cuenta MT5")
        status_order = 0 if status == "active" else 1 if status.startswith("pending") or status in {"draft", "waiting_sync"} else 2
        last_sync_at = _safe_str(account.get("last_sync_at"))
        last_sync_label = _humanize_last_sync({"timestamp": last_sync_at}) if last_sync_at else "Pendiente de primer sync"
        base_url = MT5_CLOUD_BASE_URL
        return {
            "account_id": _safe_str(account.get("account_id")),
            "label": display_name,
            "display_label": display_name,
            "broker": broker,
            "login": login,
            "server": server,
            "status": status,
            "status_label": self.connection_status_label(status),
            "status_kind": self.connection_status_kind(status),
            "status_order": status_order,
            "connection_key": connection_key,
            "connection_key_masked": connection_key_masked,
            "server_connection_key_masked": server_connection_key_masked or connection_key_masked,
            "local_connection_key_masked": local_connection_key_masked,
            "connection_key_mismatch": key_mismatch,
            "connection_key_revoked": key_revoked,
            "connection_key_revoked_at": key_revoked_at,
            "needs_key_reinstall": key_mismatch,
            "can_copy_connection_key": bool(connection_key and not key_mismatch),
            "endpoint_base": base_url,
            "sync_url": f"{base_url}{MT5_CLOUD_SYNC_PATH}",
            "policy_url": f"{base_url}{MT5_CLOUD_POLICY_PATH}",
            "last_sync_label": last_sync_label,
        }

    def account_has_connection_key(self, account: dict[str, Any]) -> bool:
        return bool(
            _safe_str(account.get("connection_key"))
            or _connection_key_preview(account)
            or account.get("has_connection_key")
        )

    def should_show_account_connection(self, account: dict[str, Any]) -> bool:
        connection_key = _safe_str(account.get("connection_key"))
        if connection_key == _safe_str(self.config.connection_key):
            return True
        status = _safe_str(account.get("status") or account.get("lifecycle_status")).lower()
        label = _safe_str(account.get("display_name") or account.get("alias") or account.get("nickname"))
        has_identity = bool(_safe_str(account.get("broker")) or _safe_str(account.get("login") or account.get("mt5_login")) or _safe_str(account.get("server")))
        if status in {"pending_link", "pending_setup", "waiting_sync", "draft", "linked"} and label == "KMFX Connector MT5" and not has_identity:
            return False
        return True

    def serialize_local_connection_fallback(self) -> dict[str, Any]:
        last_sync = self._last_sync if isinstance(self._last_sync, dict) else {}
        return self.serialize_account_connection(
            {
                "account_id": "local-launcher",
                "display_name": "Launcher local",
                "platform": "mt5",
                "connection_key": self.config.connection_key,
                "status": "linked" if not last_sync else "active",
                "last_sync_at": last_sync.get("timestamp") or last_sync.get("delivered_at") or "",
            }
        )

    def _connection_key_present(self, connections: list[dict[str, Any]], connection_key: str) -> bool:
        normalized = _safe_str(connection_key)
        return any(_safe_str(item.get("connection_key")) == normalized for item in connections)

    def connection_status_label(self, status: str) -> str:
        normalized = _safe_str(status).lower()
        if normalized == "active":
            return "Activa"
        if normalized in {"pending_link", "pending_setup", "waiting_sync", "draft", "linked"}:
            return "Esperando primer sync"
        if normalized == "archived":
            return "Archivada"
        return normalized.replace("_", " ").capitalize() if normalized else "Pendiente"

    def connection_status_kind(self, status: str) -> str:
        normalized = _safe_str(status).lower()
        if normalized == "active":
            return "success"
        if normalized in {"pending_link", "pending_setup", "waiting_sync", "draft", "linked"}:
            return "warning"
        return "neutral"

    def ensure_service_started(self) -> None:
        if self.fetch_json("/health"):
            self.logger.info("[KMFX][LAUNCHER] local bridge already running on %s", self.service_url(""))
            return
        self.start_service()

    def start_service(self) -> None:
        if self.service_process and self.service_process.poll() is None:
            return
        save_config(self.config)
        if is_packaged():
            if self.service_thread and self.service_thread.is_alive():
                return
            from . import service as launcher_service

            self.service_thread = threading.Thread(
                target=launcher_service.main,
                name="KMFXLauncherService",
                daemon=True,
            )
            self.service_thread.start()
            self.logger.info("[KMFX][LAUNCHER] service thread started packaged=true")
            return

        self.service_process = subprocess.Popen(
            [sys.executable, "-m", "launcher.service"],
            cwd=str(ROOT),
            text=True,
        )
        self.logger.info(
            "[KMFX][LAUNCHER] service process started pid=%s",
            self.service_process.pid if self.service_process else "",
        )

    def stop_service(self) -> None:
        if self.service_process and self.service_process.poll() is None:
            self.service_process.terminate()
            self.logger.info("[KMFX][LAUNCHER] service process terminated")
        if self.service_thread and self.service_thread.is_alive():
            self.logger.info("[KMFX][LAUNCHER] packaged service thread will stop with app process")

    def service_url(self, path: str) -> str:
        return f"http://{self.config.local_host}:{self.config.local_port}{path}"

    def fetch_json(self, path: str) -> dict[str, Any] | None:
        try:
            with urlopen(self.service_url(path), timeout=2) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            return None

    def _store_auth_response(self, body: dict[str, Any]) -> None:
        user = body.get("user") if isinstance(body.get("user"), dict) else {}
        metadata = user.get("user_metadata") if isinstance(user.get("user_metadata"), dict) else {}
        email = str(user.get("email") or self.config.auth_email or "").strip().lower()
        name = str(metadata.get("full_name") or metadata.get("name") or self._name_from_email(email)).strip()
        expires_at = int(body.get("expires_at") or (int(time.time()) + int(body.get("expires_in") or 3600)))
        self.config.auth_access_token = str(body.get("access_token") or "")
        self.config.auth_refresh_token = str(body.get("refresh_token") or self.config.auth_refresh_token or "")
        self.config.auth_expires_at = expires_at
        self.config.auth_user_id = str(user.get("id") or self.config.auth_user_id or "")
        self.config.auth_email = email
        self.config.auth_name = name
        self.config.backend_token = self.config.auth_access_token
        save_config(self.config)
        self.backend.config = self.config

    def _auth_error_message(self, response: BackendResponse) -> str:
        body = response.body or {}
        raw = str(body.get("msg") or body.get("message") or body.get("error_description") or body.get("error") or "").strip()
        code = str(body.get("error_code") or body.get("code") or body.get("error") or "").strip().lower()
        normalized_raw = raw.lower()
        if code == "invalid_credentials" or "invalid login credentials" in normalized_raw:
            return "Email o contraseña incorrectos. Si tu cuenta usa Google, entra con Google o crea una contraseña desde recuperación."
        if "captcha" in normalized_raw or "turnstile" in normalized_raw or "anti-bot" in normalized_raw:
            return (
                "La protección anti-bots bloqueó este acceso por email. Entra con Google o crea/restablece "
                "tu contraseña desde kmfxedge.com."
            )
        if response.status_code == 0:
            return "No se pudo conectar con Supabase Auth. Revisa internet, firewall o usa Entrar con Google."
        if response.status_code in {400, 401, 403}:
            return "No se pudo iniciar sesión. Revisa tus credenciales."
        return "No se pudo conectar con el servidor"

    def _name_from_email(self, email: str) -> str:
        local = str(email or "").split("@")[0].replace(".", " ").replace("_", " ").replace("-", " ").strip()
        return " ".join(part.capitalize() for part in local.split()[:2]) or "Usuario KMFX"

    def _sync_is_recent(self, last_sync: dict[str, Any]) -> bool:
        raw_time = (
            last_sync.get("delivered_at")
            or last_sync.get("updated_at")
            or last_sync.get("received_at")
            or last_sync.get("timestamp")
            or last_sync.get("time")
            or ""
        )
        parsed = _parse_iso(str(raw_time))
        if not parsed:
            return False
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds() < 120


def main() -> None:
    api = KMFXApi()
    if platform.system().lower() == "windows" and is_packaged():
        register_launcher_url_protocol()
    api.ensure_service_started()
    window = webview.create_window(
        "KMFX Launcher",
        UI_PATH.as_uri(),
        js_api=api,
        width=980,
        height=680,
        min_size=(860, 600),
        resizable=True,
    )
    window.events.closed += api.shutdown
    webview.start(debug=api.config.debug)


if __name__ == "__main__":
    main()
