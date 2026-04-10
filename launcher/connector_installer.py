from __future__ import annotations

import shutil
from pathlib import Path

from .config import LauncherConfig
from .mt5_detector import MT5Installation


ROOT = Path(__file__).resolve().parent.parent


def connector_sources() -> list[Path]:
    candidates = [
        ROOT / "KMFXConnector.ex5",
        ROOT / "KMFXConnector.mq5",
    ]
    return [path for path in candidates if path.exists()]


def preset_contents(config: LauncherConfig) -> str:
    return "\n".join(
        [
            "KMFXMode=0||0||0||1||N",
            f"KMFXBackendBaseUrl={config.local_host and f'http://{config.local_host}:{config.local_port}'}||0||0||0||N",
            "KMFXSyncPath=/mt5/sync||0||0||0||N",
            "KMFXJournalPath=/mt5/journal||0||0||0||N",
            "KMFXPolicyPath=/mt5/policy||0||0||0||N",
            f"KMFXApiKey={config.connection_key}||0||0||0||N",
            f"connection_key={config.connection_key}||0||0||0||N",
            "KMFXTimerMs=2000||0||0||0||N",
            "KMFXPolicyPollSeconds=12||0||0||0||N",
            "KMFXStatePushSeconds=5||0||0||0||N",
            "KMFXWebTimeoutMs=5000||0||0||0||N",
            "KMFXVerboseLog=true||0||0||0||N",
            "KMFXEnableEnforce=true||0||0||0||N",
            "KMFXSendClosedDeals=true||0||0||0||N",
            "KMFXUseBrokerTime=true||0||0||0||N",
            "",
        ]
    )


def install_connector(installation: MT5Installation, config: LauncherConfig) -> dict[str, str]:
    experts_path = Path(installation.experts_path)
    presets_path = Path(installation.presets_path)
    experts_path.mkdir(parents=True, exist_ok=True)
    presets_path.mkdir(parents=True, exist_ok=True)

    copied_files: list[str] = []
    for source in connector_sources():
        target = experts_path / source.name
        shutil.copy2(source, target)
        copied_files.append(str(target))

    preset_path = presets_path / "KMFXConnector_Launcher.set"
    preset_path.write_text(preset_contents(config), encoding="utf-8")
    return {
        "experts_path": str(experts_path),
        "preset_path": str(preset_path),
        "copied_files": "\n".join(copied_files),
    }


def connector_installed(installation: MT5Installation) -> bool:
    experts_path = Path(installation.experts_path)
    return (experts_path / "KMFXConnector.ex5").exists() or (experts_path / "KMFXConnector.mq5").exists()
