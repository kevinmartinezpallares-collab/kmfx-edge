from __future__ import annotations

import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .config import LauncherConfig
from .mt5_detector import MT5Installation
from .resources import resource_path


LOGGER = logging.getLogger("kmfx_launcher")
MT5_CLOUD_BASE_URL = "https://mt5-api.kmfxedge.com"
MT5_CLOUD_SYNC_PATH = "/api/mt5/sync"
MT5_CLOUD_JOURNAL_PATH = "/api/mt5/journal"
MT5_CLOUD_POLICY_PATH = "/api/mt5/policy"
SAFETY_NOTICE_FILE = "KMFX_READ_ONLY_NOTICE.txt"


class ConnectorInstallError(RuntimeError):
    pass


def connector_sources() -> list[Path]:
    candidates = [
        resource_path("KMFXConnector.ex5"),
        resource_path("KMFXConnector.mq5"),
    ]
    return [path for path in candidates if path.exists()]


def required_connector_sources() -> list[Path]:
    sources = connector_sources()
    if not any(path.name == "KMFXConnector.ex5" for path in sources):
        raise ConnectorInstallError(
            "No se encontró KMFXConnector.ex5 dentro del Launcher. Descarga de nuevo KMFX Launcher y vuelve a reinstalar el conector."
        )
    return sources


def resolve_presets_path(installation: MT5Installation) -> Path:
    configured_path = Path(installation.presets_path)
    data_path = Path(installation.data_path)
    candidates = [
        data_path / "profiles" / "Presets",
        configured_path,
        data_path / "Profiles" / "Presets",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return configured_path


def preset_contents(config: LauncherConfig) -> str:
    return "\n".join(
        [
            "KMFXKey=||0||0||0||N",
            "KMFXApiKey=||0||0||0||N",
            "connection_key=||0||0||0||N",
            "KMFXMode=0||0||0||1||N",
            f"KMFXBackendBaseUrl={MT5_CLOUD_BASE_URL}||0||0||0||N",
            f"KMFXSyncPath={MT5_CLOUD_SYNC_PATH}||0||0||0||N",
            f"KMFXJournalPath={MT5_CLOUD_JOURNAL_PATH}||0||0||0||N",
            f"KMFXPolicyPath={MT5_CLOUD_POLICY_PATH}||0||0||0||N",
            "KMFXTimerMs=2000||0||0||0||N",
            "KMFXPolicyPollSeconds=12||0||0||0||N",
            "KMFXStatePushSeconds=5||0||0||0||N",
            "KMFXWebTimeoutMs=5000||0||0||0||N",
            "KMFXClosedDealsLimit=100||0||0||0||N",
            "KMFXHistoryPointsLimit=120||0||0||0||N",
            "KMFXHistoryLookbackDays=365||0||0||0||N",
            "KMFXVerboseLog=false||0||0||0||N",
            "KMFXEnableEnforce=false||0||0||0||N",
            "KMFXSendClosedDeals=true||0||0||0||N",
            "KMFXUseBrokerTime=true||0||0||0||N",
            "",
        ]
    )


def connection_config_contents(config: LauncherConfig) -> str:
    return "\n".join(
        [
            f"backend_url={MT5_CLOUD_BASE_URL}",
            f"sync_path={MT5_CLOUD_SYNC_PATH}",
            f"journal_path={MT5_CLOUD_JOURNAL_PATH}",
            f"policy_path={MT5_CLOUD_POLICY_PATH}",
            f"launcher_url=http://{config.local_host}:{config.local_port}",
            f"written_at={datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}",
            "",
        ]
    )


def safety_notice_contents(config: LauncherConfig, installation: MT5Installation) -> str:
    return "\n".join(
        [
            "KMFX Edge - MT5 safety notice",
            "",
            f"Installation: {installation.label}",
            f"Platform: {installation.platform_name}",
            f"Written at: {datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}",
            "",
            "This public KMFXConnector installation is configured for read-only data sync.",
            "It does not open, modify, block, copy, or close trades on this MT5 account.",
            "It does not send the broker password to KMFX Edge.",
            "Operational control of the account remains in the trader's own MT5 terminal.",
            "",
            "Launcher preset guardrails:",
            f"- KMFXMode=SAFE_MODE ({0})",
            "- KMFXEnableEnforce=false",
            "",
            "If you trade with a prop firm or funded account, verify their current EA policy before use.",
            "Keep this file as local evidence of the connector scope installed by KMFX Launcher.",
            "",
            "Connection key installed: none",
            "Paste the KMFXKey manually in the EA inputs for the specific dashboard user you want to sync.",
            "",
        ]
    )


def install_connector(installation: MT5Installation, config: LauncherConfig) -> dict[str, str]:
    experts_path = Path(installation.experts_path)
    advisors_path = experts_path / "Advisors"
    presets_path = resolve_presets_path(installation)
    files_path = Path(installation.data_path) / "MQL5" / "Files"
    experts_path.mkdir(parents=True, exist_ok=True)
    advisors_path.mkdir(parents=True, exist_ok=True)
    presets_path.mkdir(parents=True, exist_ok=True)
    files_path.mkdir(parents=True, exist_ok=True)

    copied_files: list[str] = []
    for source in required_connector_sources():
        target = advisors_path / source.name
        shutil.copy2(source, target)
        copied_files.append(str(target))

    preset_path = presets_path / "KMFXConnector_Launcher.set"
    preset_path.write_text(preset_contents(config), encoding="utf-8")
    LOGGER.info("[KMFX][INSTALLER][PRESET] path=%s", preset_path)

    connection_config_path = files_path / "kmfx_connection.conf"
    connection_config_path.write_text(connection_config_contents(config), encoding="utf-8")
    LOGGER.info("[KMFX][INSTALLER][KEY_PROPAGATION] path=%s", connection_config_path)

    safety_notice_path = files_path / SAFETY_NOTICE_FILE
    safety_notice_path.write_text(safety_notice_contents(config, installation), encoding="utf-8")
    LOGGER.info("[KMFX][INSTALLER][NOTICE] path=%s", safety_notice_path)

    return {
        "experts_path": str(experts_path),
        "preset_path": str(preset_path),
        "connection_config_path": str(connection_config_path),
        "safety_notice_path": str(safety_notice_path),
        "copied_files": "\n".join(copied_files),
    }


def connector_installed(installation: MT5Installation) -> bool:
    experts_path = Path(installation.experts_path)
    return (experts_path / "KMFXConnector.ex5").exists() or (experts_path / "KMFXConnector.mq5").exists()
