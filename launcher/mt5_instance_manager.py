from __future__ import annotations

import platform
import re
import shutil
from pathlib import Path

from .config import LauncherConfig
from .connector_installer import install_connector
from .mt5_detector import MT5Installation, detect_mt5_installations


APP_SUPPORT = Path.home() / "Library" / "Application Support"
MAC_MAIN_APP = Path("/Applications/MetaTrader 5.app")
MAC_DEFAULT_PREFIX = APP_SUPPORT / "net.metaquotes.wine.metatrader5"
MAC_SHORTCUT_DIR = Path.home() / "Applications" / "KMFX MT5 Instances"


def is_supported_mt5_instance_creation_platform() -> bool:
    return platform.system().lower() == "darwin"


def normalize_instance_name(name: str) -> str:
    raw = re.sub(r"[^A-Za-z0-9._ -]+", " ", str(name or "")).strip()
    raw = re.sub(r"\s+", "-", raw)
    raw = raw.replace("_", "-")
    raw = re.sub(r"-+", "-", raw).strip(".- ")
    if not raw:
        raise ValueError("instance_name_required")
    if not raw.lower().startswith("mt5-"):
        raw = f"MT5-{raw}"
    return raw[:64]


def _wine_prefix_from_data_path(data_path: str) -> Path | None:
    path = Path(str(data_path or "")).expanduser()
    parts = path.parts
    if "drive_c" not in parts:
        return None
    index = parts.index("drive_c")
    if index <= 0:
        return None
    return Path(*parts[:index])


def _locate_program_dir(prefix: Path) -> Path:
    program_files = prefix / "drive_c" / "Program Files"
    matches = sorted(program_files.glob("MetaTrader 5*"))
    for candidate in matches:
        if (candidate / "terminal64.exe").exists():
            return candidate
    raise RuntimeError(f"No se encontro terminal64.exe dentro de {prefix}")


def _source_prefix_from_installations() -> Path | None:
    for installation in detect_mt5_installations():
        prefix = _wine_prefix_from_data_path(installation.data_path)
        if prefix and prefix.exists():
            try:
                _locate_program_dir(prefix)
            except RuntimeError:
                continue
            return prefix
    return None


def resolve_mac_source_prefix() -> Path:
    if MAC_DEFAULT_PREFIX.exists():
        try:
            _locate_program_dir(MAC_DEFAULT_PREFIX)
            return MAC_DEFAULT_PREFIX
        except RuntimeError:
            pass
    source = _source_prefix_from_installations()
    if source:
        return source
    raise RuntimeError("mt5_source_not_found")


def _remove_path(path: Path) -> None:
    if not path.exists() and not path.is_symlink():
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path, ignore_errors=False)
    else:
        path.unlink()


def _ensure_clean_file_tree(program_dir: Path) -> None:
    # Keep the normal MT5 layout/profile where possible, but remove account/session
    # state and every KMFX key artifact so the new instance starts clean.
    for relative in (
        "logs",
        "Logs",
        "temp",
        "MQL5/Logs",
        "MQL5/logs",
        "MQL5/Files/kmfx_connection.conf",
        "MQL5/Files/KMFX_READ_ONLY_NOTICE.txt",
        "MQL5/Experts/KMFXConnector.ex5",
        "MQL5/Experts/KMFXConnector.mq5",
        "MQL5/Experts/Advisors/KMFXConnector.ex5",
        "MQL5/Experts/Advisors/KMFXConnector.mq5",
    ):
        _remove_path(program_dir / relative)

    for file_name in (
        "accounts.dat",
        "terminal.lic",
        "experts.dat",
        "common.ini",
    ):
        for config_root in (program_dir / "Config", program_dir / "config", program_dir / "MQL5"):
            _remove_path(config_root / file_name)

    for directory in (
        program_dir / "MQL5" / "Files",
        program_dir / "MQL5" / "Experts",
        program_dir / "Profiles" / "Presets",
    ):
        directory.mkdir(parents=True, exist_ok=True)


def _build_installation(prefix: Path, label: str) -> MT5Installation:
    program_dir = _locate_program_dir(prefix)
    return MT5Installation(
        label=f"mac · {label} · {program_dir.name}",
        terminal_path=str(program_dir / "terminal64.exe"),
        data_path=str(program_dir),
        experts_path=str(program_dir / "MQL5" / "Experts"),
        presets_path=str(program_dir / "Profiles" / "Presets"),
        platform_name="mac",
    )


def _write_command_shortcut(prefix: Path, installation: MT5Installation, name: str) -> Path:
    MAC_SHORTCUT_DIR.mkdir(parents=True, exist_ok=True)
    script = MAC_SHORTCUT_DIR / f"{name}.command"
    script.write_text(
        "\n".join(
            [
                "#!/bin/bash",
                "set -euo pipefail",
                f"export WINEPREFIX='{prefix}'",
                "export WINEARCH='win64'",
                "export WINEDEBUG='-all'",
                "export WINEDLLOVERRIDES='mscoree,mshtml='",
                "WINE_ROOT='/Applications/MetaTrader 5.app/Contents/SharedSupport/wine'",
                "export PATH=\"$WINE_ROOT/bin:$PATH\"",
                "export DYLD_FALLBACK_LIBRARY_PATH=\"$WINE_ROOT/lib:$WINE_ROOT/lib/external:${DYLD_FALLBACK_LIBRARY_PATH:-}\"",
                "WINE_BIN=\"$WINE_ROOT/bin/wine\"",
                "if [ ! -x \"$WINE_BIN\" ]; then",
                "  WINE_BIN=\"$WINE_ROOT/bin/wine64\"",
                "fi",
                "if [ ! -x \"$WINE_BIN\" ]; then",
                "  osascript -e 'display alert \"No se encontro Wine dentro de MetaTrader 5.app\"'",
                "  exit 1",
                "fi",
                f"exec \"$WINE_BIN\" '{installation.terminal_path}' /portable >/dev/null 2>&1 &",
                "",
            ]
        ),
        encoding="utf-8",
    )
    script.chmod(0o755)
    return script


def _write_app_shortcut(command_path: Path, name: str) -> Path:
    app_path = Path.home() / "Desktop" / f"{name}.app"
    if app_path.exists():
        shutil.rmtree(app_path, ignore_errors=False)
    macos_dir = app_path / "Contents" / "MacOS"
    macos_dir.mkdir(parents=True, exist_ok=True)
    executable = macos_dir / name
    executable.write_text(f"#!/bin/bash\nexec {str(command_path)!r}\n", encoding="utf-8")
    executable.chmod(0o755)
    (app_path / "Contents" / "Info.plist").write_text(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>{name}</string>
  <key>CFBundleIdentifier</key>
  <string>com.kmfx.mt5.{name.lower()}</string>
  <key>CFBundleName</key>
  <string>{name}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
""",
        encoding="utf-8",
    )
    return app_path


def create_mac_mt5_instance(name: str, config: LauncherConfig, *, install_kmfx_connector: bool = True) -> dict[str, str]:
    if not is_supported_mt5_instance_creation_platform():
        raise RuntimeError("unsupported_platform")
    if not MAC_MAIN_APP.exists():
        raise RuntimeError("mt5_app_not_found")

    normalized_name = normalize_instance_name(name)
    target_prefix = APP_SUPPORT / normalized_name
    if target_prefix.exists():
        raise FileExistsError(normalized_name)

    source_prefix = resolve_mac_source_prefix()
    shutil.copytree(source_prefix, target_prefix, symlinks=True)

    try:
        program_dir = _locate_program_dir(target_prefix)
        _ensure_clean_file_tree(program_dir)
        installation = _build_installation(target_prefix, normalized_name)
        if install_kmfx_connector:
            install_connector(installation, config)
        command_path = _write_command_shortcut(target_prefix, installation, normalized_name)
        app_path = _write_app_shortcut(command_path, normalized_name)
    except Exception:
        shutil.rmtree(target_prefix, ignore_errors=True)
        raise

    return {
        "name": normalized_name,
        "prefix_path": str(target_prefix),
        "terminal_path": installation.terminal_path,
        "data_path": installation.data_path,
        "experts_path": installation.experts_path,
        "app_path": str(app_path),
        "command_path": str(command_path),
    }
