from __future__ import annotations

import json
import platform
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen
import webbrowser

try:
    import webview
except ImportError as exc:  # pragma: no cover - depends on local runtime setup
    raise SystemExit(
        "pywebview is required to run KMFX Launcher. Install dependencies with: "
        "pip install -r requirements.txt"
    ) from exc

from .config import LauncherConfig, load_config, mask_connection_key, save_bridge_config, save_config
from .backend_client import BackendClient, BackendResponse
from .connector_installer import connector_installed, install_connector
from .log_utils import configure_logging, read_recent_logs
from .mt5_detector import MT5Installation, detect_mt5_installations
from .platform_mac import open_mt5 as open_mt5_mac
from .platform_windows import open_mt5 as open_mt5_windows
from .resources import app_root, is_packaged, resource_path


ROOT = app_root()
UI_PATH = resource_path("launcher", "ui", "index.html")
LAUNCHER_VERSION = "1.0.0"
DEFAULT_CONNECTOR_VERSION = "2.75"
APP_ICON_PATH = resource_path("assets", "logos", "kmfx-edge-icon-1024.png")
STATUS_CACHE_TTL_SECONDS = 18
DASHBOARD_RECOVERY_URL = "https://dashboard.kmfxedge.com?auth=recovery"


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
        self.installations: list[MT5Installation] = []
        self.service_process: subprocess.Popen[str] | None = None
        self.service_thread: threading.Thread | None = None
        self._lock = threading.RLock()
        self._last_service_status: dict[str, Any] = {}
        self._last_service_seen_at = 0.0
        self._service_failure_count = 0
        self._stable_service_on = False
        self._last_sync: dict[str, Any] = {}
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
                "status_code": service_status.get("backend_status_code", 0),
            }

    def get_session(self) -> dict[str, Any]:
        self.config = load_config().ensure_runtime_values()
        self.backend.config = self.config
        authenticated = bool(self.config.auth_access_token and self.config.auth_email)
        return {
            "authenticated": authenticated,
            "user": {
                "id": self.config.auth_user_id,
                "email": self.config.auth_email,
                "name": self.config.auth_name or self._name_from_email(self.config.auth_email),
            },
        }

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

    def ensure_session(self) -> dict[str, Any]:
        if self.config.auth_access_token:
            self.config.backend_token = self.config.auth_access_token
        expires_at = int(self.config.auth_expires_at or 0)
        if self.config.auth_refresh_token and expires_at and expires_at <= int(time.time()) + 90:
            response = self.backend.refresh_auth_session(refresh_token=self.config.auth_refresh_token)
            if response.ok:
                self._store_auth_response(response.body)
            else:
                self.logger.warning("[KMFX][AUTH] refresh failed; keeping launcher session until logout")
        return self.get_session()

    def ensure_remote_account_link(self) -> dict[str, Any]:
        if (
            self.config.connection_key
            and self.config.connection_key_user_id
            and self.config.connection_key_user_id == self.config.auth_user_id
        ):
            save_bridge_config(self.config, user_id=self.config.auth_user_id)
            self.fetch_json("/bridge/reload-config")
            return {"ok": bool(self.config.connection_key), "connection_key": mask_connection_key(self.config.connection_key)}
        if not self.config.auth_user_id:
            return {"ok": False, "message": "Sesión no iniciada."}
        response = self.backend.link_account(user_id=self.config.auth_user_id, label="KMFX Connector MT5")
        if not response.ok:
            self.logger.warning("[KMFX][AUTH][LINK] account link failed status=%s", response.status_code)
            return {"ok": False, "message": "No se pudo preparar la vinculación de cuenta."}

        body = response.body or {}
        connection_key = str(body.get("connection_key") or body.get("launcher_config", {}).get("connection_key") or "").strip()
        if not connection_key:
            return {"ok": False, "message": "El backend no devolvió connection key."}
        self.config.connection_key = connection_key
        self.config.connection_key_user_id = self.config.auth_user_id
        save_config(self.config)
        save_bridge_config(self.config, user_id=self.config.auth_user_id)
        self.fetch_json("/bridge/reload-config")
        self.logger.info("[KMFX][AUTH][LINK] connection_key ready key=%s", mask_connection_key(connection_key))
        return {"ok": True, "connection_key": mask_connection_key(connection_key)}

    def get_installations(self) -> list[dict[str, Any]]:
        return [self.serialize_installation(installation) for installation in self.installations]

    def install_connector(self, selected_installation: str | None = None) -> dict[str, Any]:
        with self._lock:
            if not self.get_session().get("authenticated"):
                return {"ok": False, "message": "Inicia sesión para instalar el connector."}
            self.ensure_remote_account_link()
            installation = self.selected_installation(selected_installation)
            if installation is None:
                return {"ok": False, "message": "No se ha detectado una instalación de MetaTrader 5."}

            self.config.selected_mt5_terminal_path = installation.terminal_path
            self.config.selected_mt5_data_path = installation.data_path
            self.config.selected_mt5_experts_path = installation.experts_path
            save_config(self.config)
            if self.config.connection_key:
                save_bridge_config(self.config, user_id=self.config.auth_user_id)
                self.fetch_json("/bridge/reload-config")

            result = install_connector(installation, self.config)
            self.logger.info("[KMFX][LAUNCHER][INSTALL] connector installed target=%s", installation.label)
            self.refresh_installations()
            return {
                "ok": True,
                "message": "Connector instalado correctamente.",
                "result": result,
                "status": self.get_status(),
                "installations": self.get_installations(),
            }

    def repair_connector(self, selected_installation: str | None = None) -> dict[str, Any]:
        return self.install_connector(selected_installation)

    def open_mt5(self, selected_installation: str | None = None) -> dict[str, Any]:
        with self._lock:
            installation = self.selected_installation(selected_installation)
            terminal_path = installation.terminal_path if installation else self.config.selected_mt5_terminal_path
            if not terminal_path:
                return {"ok": False, "message": "No hay terminal MT5 detectada para abrir."}
            opener = open_mt5_mac if platform.system().lower() == "darwin" else open_mt5_windows
            opened = opener(terminal_path)
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

    def serialize_installation(self, installation: MT5Installation) -> dict[str, Any]:
        return {
            "label": installation.label,
            "terminal_path": installation.terminal_path,
            "data_path": installation.data_path,
            "experts_path": installation.experts_path,
            "presets_path": installation.presets_path,
            "platform_name": installation.platform_name,
            "connector_installed": connector_installed(installation),
        }

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
        if response.status_code == 0:
            return "No se pudo conectar con el servidor"
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
