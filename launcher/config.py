from __future__ import annotations

import json
import os
import secrets
from dataclasses import asdict, dataclass
from pathlib import Path


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


@dataclass
class LauncherConfig:
    local_host: str = "127.0.0.1"
    local_port: int = 8766
    backend_base_url: str = "http://127.0.0.1:8000"
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
    selected_mt5_terminal_path: str = ""
    selected_mt5_data_path: str = ""
    selected_mt5_experts_path: str = ""

    def ensure_runtime_values(self) -> "LauncherConfig":
        if not self.connection_key:
            self.connection_key = f"kmfx-{secrets.token_hex(8)}"
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
