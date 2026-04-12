from __future__ import annotations

import json
import platform
import re
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen

try:
    import webview
except ImportError as exc:  # pragma: no cover - depends on local runtime setup
    raise SystemExit(
        "pywebview is required to run KMFX Launcher. Install dependencies with: "
        "pip install -r requirements.txt"
    ) from exc

from .config import LauncherConfig, load_config, mask_connection_key, save_bridge_config, save_config
from .connector_installer import connector_installed, install_connector
from .log_utils import configure_logging, read_recent_logs
from .mt5_detector import MT5Installation, detect_mt5_installations
from .platform_mac import open_mt5 as open_mt5_mac
from .platform_windows import open_mt5 as open_mt5_windows


ROOT = Path(__file__).resolve().parent.parent
UI_PATH = Path(__file__).resolve().parent / "ui" / "index.html"
LAUNCHER_VERSION = "1.0.0"
DEFAULT_CONNECTOR_VERSION = "2.75"


def _read_connector_version() -> str:
    source = ROOT / "KMFXConnector.mq5"
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
        return "Último sync ahora"
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
        self.installations: list[MT5Installation] = []
        self.service_process: subprocess.Popen[str] | None = None
        self._lock = threading.RLock()
        self._last_service_status: dict[str, Any] = {}
        self.refresh_installations()

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
            }

    def refresh_installations(self) -> list[dict[str, Any]]:
        with self._lock:
            self.installations = detect_mt5_installations()
            return self.get_installations()

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            service_status = self.fetch_json("/status") or {}
            self._last_service_status = service_status if service_status else self._last_service_status
            installation = self.selected_installation()
            is_installed = connector_installed(installation) if installation else False
            service_on = bool(service_status.get("ok"))
            last_sync = service_status.get("last_sync") if isinstance(service_status.get("last_sync"), dict) else {}

            return {
                "service_on": service_on,
                "backend_reachable": bool(service_status.get("backend_reachable")) if service_on else False,
                "connector_installed": is_installed,
                "repair_recommended": False,
                "last_sync_ago": _humanize_last_sync(last_sync or {}),
                "mt5_count": len(self.installations),
                "selected_installation": installation.label if installation else "",
                "backend_base_url": service_status.get("backend_base_url") or self.config.backend_base_url,
                "status_code": service_status.get("backend_status_code", 0),
            }

    def get_installations(self) -> list[dict[str, Any]]:
        return [self.serialize_installation(installation) for installation in self.installations]

    def install_connector(self, selected_installation: str | None = None) -> dict[str, Any]:
        with self._lock:
            installation = self.selected_installation(selected_installation)
            if installation is None:
                return {"ok": False, "message": "No se ha detectado una instalación de MetaTrader 5."}

            self.config.selected_mt5_terminal_path = installation.terminal_path
            self.config.selected_mt5_data_path = installation.data_path
            self.config.selected_mt5_experts_path = installation.experts_path
            save_config(self.config)
            if self.config.connection_key:
                save_bridge_config(self.config, user_id="local")

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

    def service_url(self, path: str) -> str:
        return f"http://{self.config.local_host}:{self.config.local_port}{path}"

    def fetch_json(self, path: str) -> dict[str, Any] | None:
        try:
            with urlopen(self.service_url(path), timeout=2) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            return None


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
