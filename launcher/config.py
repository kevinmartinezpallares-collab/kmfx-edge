from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

LOCAL_BACKEND_BASE_URL = "http://127.0.0.1:8000"
PRODUCTION_BACKEND_BASE_URL = "https://kmfx-edge-api.onrender.com"


def launcher_home() -> Path:
    custom_home = os.getenv("KMFX_LAUNCHER_HOME", "").strip()
    if custom_home:
        return Path(custom_home).expanduser()
    return Path.home() / ".kmfx_launcher"


def ensure_launcher_home() -> Path:
    root = launcher_home()
    root.mkdir(parents=True, exist_ok=True)
    (root / "logs").mkdir(parents=True, exist_ok=True)
    return root


def config_path() -> Path:
    return ensure_launcher_home() / "config.json"


def platform_data_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "KMFX"
    if os.name == "nt":
        return Path(os.getenv("APPDATA", str(Path.home() / "AppData" / "Roaming"))) / "KMFX"
    return Path(os.getenv("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "KMFX"


def bridge_config_path() -> Path:
    custom_path = os.getenv("KMFX_BRIDGE_CONFIG_PATH", "").strip()
    if custom_path:
        path = Path(custom_path).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    root = platform_data_dir()
    root.mkdir(parents=True, exist_ok=True)
    return root / "kmfx_bridge_config.json"


def mask_connection_key(connection_key: str) -> str:
    normalized = str(connection_key or "").strip()
    if not normalized:
        return ""
    return f"{normalized[:8]}..."


def resolve_backend_base_url(configured_value: str = "") -> str:
    env_override = os.getenv("BACKEND_BASE_URL", "").strip() or os.getenv("KMFX_BACKEND_BASE_URL", "").strip()
    if env_override:
        return env_override.rstrip("/")
    if configured_value and configured_value.strip():
        return configured_value.strip().rstrip("/")
    return LOCAL_BACKEND_BASE_URL


@dataclass
class LauncherConfig:
    local_host: str = "127.0.0.1"
    local_port: int = 8766
    backend_base_url: str = LOCAL_BACKEND_BASE_URL
    backend_token: str = ""
    auth_access_token: str = ""
    auth_refresh_token: str = ""
    auth_expires_at: int = 0
    auth_user_id: str = ""
    auth_email: str = ""
    auth_name: str = ""
    backend_sync_path: str = "/api/mt5/sync"
    backend_journal_path: str = "/api/mt5/journal"
    backend_policy_path: str = "/api/mt5/policy"
    backend_health_path: str = "/"
    backend_timeout_seconds: int = 5
    service_retry_interval_seconds: int = 3
    max_queue_size: int = 100
    max_attempts: int = 8
    debug: bool = True
    connection_key: str = ""
    connection_key_user_id: str = ""
    selected_mt5_terminal_path: str = ""
    selected_mt5_data_path: str = ""
    selected_mt5_experts_path: str = ""

    def ensure_runtime_values(self) -> "LauncherConfig":
        self.backend_base_url = resolve_backend_base_url(self.backend_base_url)
        return self


def load_config() -> LauncherConfig:
    path = config_path()
    if not path.exists():
        config = LauncherConfig().ensure_runtime_values()
        save_config(config)
        return config

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        payload = {}

    config = LauncherConfig(**{key: value for key, value in payload.items() if key in LauncherConfig.__dataclass_fields__})
    config.ensure_runtime_values()
    save_config(config)
    return config


def save_config(config: LauncherConfig) -> None:
    path = config_path()
    path.write_text(json.dumps(asdict(config), ensure_ascii=True, indent=2), encoding="utf-8")


def save_bridge_config(config: LauncherConfig, *, user_id: str = "", linked_at: str = "") -> Path:
    payload = {
        "connection_key": str(config.connection_key or "").strip(),
        "backend_url": str(config.backend_base_url or "").strip(),
        "user_id": str(user_id or "").strip(),
        "linked_at": linked_at or datetime.now(timezone.utc).isoformat(),
    }
    path = bridge_config_path()
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    return path


def load_bridge_config() -> dict[str, str]:
    path = bridge_config_path()
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}
