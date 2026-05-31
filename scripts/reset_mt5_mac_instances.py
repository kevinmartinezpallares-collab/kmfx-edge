#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from launcher.config import LauncherConfig
from launcher.connector_installer import install_connector
from launcher.mt5_detector import MT5Installation, detect_mt5_installations


APP_SUPPORT = Path.home() / "Library" / "Application Support"
MAIN_APP = Path("/Applications/MetaTrader 5.app")
SOURCE_PREFIX = APP_SUPPORT / "net.metaquotes.wine.metatrader5"
INSTANCE_NAMES = [
    "MT5-Darwinex",
    "MT5-FTMO",
    "MT5-Orion",
    "MT5-Demo",
    "MT5-Icmarkets",
    "MT5-BOT",
]


def _run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def stop_mt5_processes() -> None:
    patterns = [
        "terminal64.exe",
        "MetaTrader 5.app",
        "MetaEditor64.exe",
        "metatester64.exe",
    ]
    for pattern in patterns:
        subprocess.run(["pkill", "-f", pattern], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def remove_old_mt5_prefixes() -> None:
    candidates = sorted(
        [
            path
            for path in APP_SUPPORT.iterdir()
            if path.is_dir()
            and (
                path.name.startswith("KMFX_MT5")
                or path.name.startswith("MT5-")
                or path.name == "net.metaquotes.wine.metatrader5"
            )
        ],
        key=lambda item: item.name.lower(),
    )
    for path in candidates:
        shutil.rmtree(path, ignore_errors=False)


def remove_old_mt5_backups() -> None:
    for path in sorted(Path("/Applications").glob("MetaTrader 5.app.kmfx-backup-*")):
        if not path.is_dir():
            continue
        try:
            shutil.rmtree(path, ignore_errors=False)
        except PermissionError:
            print(f"[WARN] No pude borrar {path} por permisos. Lo dejo intacto.", file=sys.stderr)


def copy_source_prefix(source_prefix: Path, target_prefix: Path) -> None:
    shutil.copytree(source_prefix, target_prefix, symlinks=True)


def locate_program_dir(prefix: Path) -> Path:
    matches = sorted((prefix / "drive_c" / "Program Files").glob("MetaTrader 5*"))
    if not matches:
        raise RuntimeError(f"No encontré la carpeta de programa MT5 dentro de {prefix}")
    for candidate in matches:
        if (candidate / "terminal64.exe").exists():
            return candidate
    raise RuntimeError(f"No encontré terminal64.exe dentro de {prefix}")


def reset_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=False)
    path.mkdir(parents=True, exist_ok=True)


def reset_file(path: Path) -> None:
    if path.exists():
        path.unlink()


def sanitize_program_dir(program_dir: Path) -> None:
    reset_directory(program_dir / "Bases")
    (program_dir / "Bases" / "Default").mkdir(parents=True, exist_ok=True)
    (program_dir / "Bases" / "Custom").mkdir(parents=True, exist_ok=True)
    (program_dir / "Bases" / "signals").mkdir(parents=True, exist_ok=True)

    reset_directory(program_dir / "Config")
    reset_directory(program_dir / "logs")
    reset_directory(program_dir / "temp")
    reset_directory(program_dir / "Tester")
    reset_directory(program_dir / "Profiles")
    reset_directory(program_dir / "profiles")

    for relative in (
        "MQL5/Files",
        "MQL5/Logs",
        "MQL5/logs",
    ):
        reset_directory(program_dir / relative)

    experts_dir = program_dir / "MQL5" / "Experts"
    experts_dir.mkdir(parents=True, exist_ok=True)
    for entry in experts_dir.iterdir():
        if entry.name.lower().startswith("examples"):
            continue
        if entry.is_dir():
            shutil.rmtree(entry, ignore_errors=False)
        else:
            entry.unlink()

    for file_name in (
        "common.ini",
        "hotkeys.ini",
        "settings.ini",
        "terminal.ini",
        "terminal.lic",
        "accounts.dat",
        "agents.dat",
        "dnsperf.dat",
        "servers.dat",
        "experts.dat",
    ):
        for config_root in (program_dir / "Config", program_dir / "config", program_dir / "MQL5"):
            reset_file(config_root / file_name)

    for dat_file in (program_dir / "Bases").glob("*.dat"):
        dat_file.unlink()

    for ini_file in (program_dir / "Profiles").rglob("*.ini"):
        ini_file.unlink()

    for ini_file in (program_dir / "profiles").rglob("*.ini"):
        ini_file.unlink()


def build_installation(prefix: Path, label: str) -> MT5Installation:
    program_dir = locate_program_dir(prefix)
    return MT5Installation(
        label=f"mac · {label} · {program_dir.name}",
        terminal_path=str(program_dir / "terminal64.exe"),
        data_path=str(program_dir),
        experts_path=str(program_dir / "MQL5" / "Experts"),
        presets_path=str(program_dir / "Profiles" / "Presets"),
        platform_name="mac",
    )


def create_instance(name: str, source_prefix: Path) -> MT5Installation:
    target_prefix = APP_SUPPORT / name
    copy_source_prefix(source_prefix, target_prefix)
    program_dir = locate_program_dir(target_prefix)
    sanitize_program_dir(program_dir)
    installation = build_installation(target_prefix, name)
    install_connector(installation, LauncherConfig().ensure_runtime_values())
    launcher_dir = Path.home() / "Applications" / "KMFX MT5 Instances"
    launcher_dir.mkdir(parents=True, exist_ok=True)
    launch_script = launcher_dir / f"{name}.command"
    launch_script.write_text(
        "\n".join(
            [
                "#!/bin/bash",
                "set -euo pipefail",
                f"export WINEPREFIX='{target_prefix}'",
                "export WINEARCH='win64'",
                "export WINEDEBUG='-all'",
                "export WINEDLLOVERRIDES='mscoree,mshtml='",
                "WINE_ROOT='/Applications/MetaTrader 5.app/Contents/SharedSupport/wine'",
                "export PATH=\"$WINE_ROOT/bin:$PATH\"",
                "export DYLD_FALLBACK_LIBRARY_PATH=\"$WINE_ROOT/lib:$WINE_ROOT/lib/external:${DYLD_FALLBACK_LIBRARY_PATH:-}\"",
                "WINE_BIN=\"$WINE_ROOT/bin/wine\"",
                "if [ ! -x \"$WINE_BIN\" ]; then",
                "  echo \"No se encontro el binario wine en $WINE_ROOT/bin\"",
                "  exit 1",
                "fi",
                f"exec \"$WINE_BIN\" '{installation.terminal_path}' /portable >/dev/null 2>&1 &",
                "",
            ]
        ),
        encoding="utf-8",
    )
    launch_script.chmod(0o755)
    return installation


def verify_expected_instances() -> list[MT5Installation]:
    found = detect_mt5_installations()
    filtered = [item for item in found if Path(item.data_path).parts[-4] in INSTANCE_NAMES or Path(item.data_path).parts[-3] in INSTANCE_NAMES]
    if len(filtered) < len(INSTANCE_NAMES):
        raise RuntimeError(
            f"Esperaba {len(INSTANCE_NAMES)} instancias nuevas y solo detecté {len(filtered)}. Detectadas: {[item.label for item in filtered]}"
        )
    return filtered


def main() -> None:
    if not MAIN_APP.exists():
        raise RuntimeError("No encuentro /Applications/MetaTrader 5.app")
    if not SOURCE_PREFIX.exists():
        raise RuntimeError(f"No encuentro el prefijo base {SOURCE_PREFIX}")

    template_prefix = Path("/tmp/kmfx_mt5_clean_template")
    if template_prefix.exists():
        shutil.rmtree(template_prefix, ignore_errors=False)
    shutil.copytree(SOURCE_PREFIX, template_prefix, symlinks=True)

    try:
        stop_mt5_processes()
        remove_old_mt5_prefixes()
        remove_old_mt5_backups()

        recreated: list[MT5Installation] = []
        for name in INSTANCE_NAMES:
            recreated.append(create_instance(name, template_prefix))

        detected = verify_expected_instances()
    finally:
        if template_prefix.exists():
            shutil.rmtree(template_prefix, ignore_errors=False)
    print("Instancias recreadas:")
    for item in recreated:
        print(f"- {item.label}")
        print(f"  terminal: {item.terminal_path}")
        print(f"  experts:  {item.experts_path}")
    print("")
    print("Deteccion launcher:")
    for item in detected:
        print(f"- {item.label}")


if __name__ == "__main__":
    main()
