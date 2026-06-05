#!/usr/bin/env python3
from __future__ import annotations

import argparse
import filecmp
import shutil
from datetime import datetime
from pathlib import Path


APP_SUPPORT = Path.home() / "Library" / "Application Support"
MAIN_APP = Path("/Applications/MetaTrader 5.app")
SOURCE_PREFIX = APP_SUPPORT / "net.metaquotes.wine.metatrader5"
SHORTCUT_DIR = Path.home() / "Applications" / "KMFX MT5 Instances"


def _locate_program_dir(prefix: Path) -> Path | None:
    program_files = prefix / "drive_c" / "Program Files"
    for candidate in sorted(program_files.glob("MetaTrader 5*")):
        if (candidate / "terminal64.exe").exists():
            return candidate
    return None


def _iter_prefixes() -> list[Path]:
    prefixes: list[Path] = []
    for path in sorted(APP_SUPPORT.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_dir():
            continue
        if not (path.name.startswith("MT5-") or path.name.startswith("KMFX_MT5") or path == SOURCE_PREFIX):
            continue
        if _locate_program_dir(path):
            prefixes.append(path)
    return prefixes


def _same_tree(left: Path, right: Path) -> bool:
    if not left.exists() or not right.exists():
        return False
    comparison = filecmp.dircmp(left, right)
    if comparison.left_only or comparison.right_only or comparison.diff_files or comparison.funny_files:
        return False
    return all(_same_tree(left / name, right / name) for name in comparison.common_dirs)


def _listed_charts(default_dir: Path) -> list[str]:
    order_file = default_dir / "order.wnd"
    if not order_file.exists():
        return []
    data = order_file.read_bytes()
    for encoding in ("utf-16", "utf-8", "latin-1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        return []
    return [line.strip() for line in text.splitlines() if line.strip().lower().endswith(".chr")]


def _default_profile_is_healthy(default_dir: Path) -> bool:
    if not default_dir.is_dir():
        return False
    if not (default_dir / "chart01.chr").is_file():
        return False
    listed = _listed_charts(default_dir)
    if not listed:
        return (default_dir / "order.wnd").is_file()
    return all((default_dir / chart).is_file() for chart in listed)


def _backup_path(path: Path, stamp: str) -> Path:
    candidate = path.with_name(f"{path.name}.kmfx-backup-{stamp}")
    index = 2
    while candidate.exists():
        candidate = path.with_name(f"{path.name}.kmfx-backup-{stamp}-{index}")
        index += 1
    return candidate


def _copy_profiles(source_program: Path, target_program: Path, stamp: str) -> list[str]:
    actions: list[str] = []
    source_profiles = source_program / "MQL5" / "Profiles"
    target_profiles = target_program / "MQL5" / "Profiles"
    source_default = source_profiles / "Charts" / "Default"
    target_default = target_profiles / "Charts" / "Default"

    if not source_default.is_dir() or not (source_default / "chart01.chr").is_file():
        raise RuntimeError(f"source_default_profile_unhealthy:{source_default}")

    target_profiles.mkdir(parents=True, exist_ok=True)

    if target_default.exists() and not _same_tree(target_default, source_default):
        backup = _backup_path(target_default, stamp)
        shutil.move(str(target_default), str(backup))
        actions.append(f"backup_default={backup.name}")

    if not target_default.exists() or not _default_profile_is_healthy(target_default):
        target_default.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source_default, target_default, dirs_exist_ok=True)
        actions.append("restored_default_chart_profile")

    for folder_name in ("Charts", "SymbolSets", "Templates", "Tester"):
        source_folder = source_profiles / folder_name
        target_folder = target_profiles / folder_name
        if source_folder.exists():
            shutil.copytree(source_folder, target_folder, dirs_exist_ok=True)
            actions.append(f"merged_{folder_name}")

    return actions


def _write_command_shortcut(prefix: Path, program_dir: Path) -> Path:
    name = prefix.name
    SHORTCUT_DIR.mkdir(parents=True, exist_ok=True)
    script = SHORTCUT_DIR / f"{name}.command"
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
                f"exec \"$WINE_BIN\" '{program_dir / 'terminal64.exe'}' /portable >/dev/null 2>&1 &",
                "",
            ]
        ),
        encoding="utf-8",
    )
    script.chmod(0o755)
    return script


def _write_app_shortcut(prefix: Path, program_dir: Path, name: str) -> Path:
    app_path = Path.home() / "Desktop" / f"{name}.app"
    if app_path.exists():
        shutil.rmtree(app_path, ignore_errors=False)
    macos_dir = app_path / "Contents" / "MacOS"
    macos_dir.mkdir(parents=True, exist_ok=True)
    executable = macos_dir / name
    executable.write_text(
        "\n".join(
            [
                "#!/bin/bash",
                "set -euo pipefail",
                f"export WINEPREFIX='{prefix}'",
                "export WINEARCH='win64'",
                "export WINEDEBUG='-all'",
                "export WINEDLLOVERRIDES='mmdevapi=d;mscoree,mshtml='",
                "WINE_ROOT='/Applications/MetaTrader 5.app/Contents/SharedSupport/wine'",
                "export PATH=\"$WINE_ROOT/bin:$PATH\"",
                "export DYLD_FALLBACK_LIBRARY_PATH=\"$WINE_ROOT/lib:$WINE_ROOT/lib/external:${DYLD_FALLBACK_LIBRARY_PATH:-}\"",
                "WINE_BIN=\"$WINE_ROOT/bin/wine\"",
                "if [ ! -x \"$WINE_BIN\" ]; then",
                "  WINE_BIN=\"$WINE_ROOT/bin/wine64\"",
                "fi",
                "if [ ! -x \"$WINE_BIN\" ]; then",
                f"  osascript -e 'display alert \"{name}\" message \"No se encontro Wine dentro de MetaTrader 5.app\"'",
                "  exit 1",
                "fi",
                f"TERMINAL='{program_dir / 'terminal64.exe'}'",
                "if [ ! -f \"$TERMINAL\" ]; then",
                f"  osascript -e 'display alert \"{name}\" message \"No se encontro terminal64.exe\"'",
                "  exit 1",
                "fi",
                "LOG_DIR=\"$HOME/Library/Logs/KMFX MT5 Instances\"",
                "mkdir -p \"$LOG_DIR\"",
                f"exec \"$WINE_BIN\" \"$TERMINAL\" /portable >> \"$LOG_DIR/{name}.log\" 2>&1",
                "",
            ]
        ),
        encoding="utf-8",
    )
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


def repair(dry_run: bool = False) -> int:
    if not MAIN_APP.exists():
        raise RuntimeError("mt5_app_not_found")
    source_program = _locate_program_dir(SOURCE_PREFIX)
    if source_program is None:
        raise RuntimeError(f"source_prefix_not_found:{SOURCE_PREFIX}")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    repaired = 0
    for prefix in _iter_prefixes():
        program_dir = _locate_program_dir(prefix)
        if program_dir is None:
            continue
        label = prefix.name
        default_dir = program_dir / "MQL5" / "Profiles" / "Charts" / "Default"
        healthy = _default_profile_is_healthy(default_dir)
        print(f"{label}: default_profile={'ok' if healthy else 'broken'}")
        if prefix == SOURCE_PREFIX:
            print("  source_template=kept")
            continue
        if dry_run:
            continue
        actions = _copy_profiles(source_program, program_dir, stamp)
        shortcut = _write_command_shortcut(prefix, program_dir)
        app = _write_app_shortcut(prefix, program_dir, label)
        print(f"  shortcut={shortcut}")
        print(f"  app={app}")
        for action in actions:
            print(f"  {action}")
        repaired += 1
    return repaired


def main() -> int:
    parser = argparse.ArgumentParser(description="Repair macOS MT5 Wine instances so chart profiles and shortcuts behave like a clean MT5 install.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    count = repair(dry_run=args.dry_run)
    print(f"Instancias procesadas: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
