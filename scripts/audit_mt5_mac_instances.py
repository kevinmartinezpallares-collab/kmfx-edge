#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_SUPPORT = Path.home() / "Library" / "Application Support"
DESKTOP = Path.home() / "Desktop"
SHORTCUT_DIR = Path.home() / "Applications" / "KMFX MT5 Instances"


def _locate_program_dir(prefix: Path) -> Path | None:
    for candidate in sorted((prefix / "drive_c" / "Program Files").glob("MetaTrader 5*")):
        if (candidate / "terminal64.exe").exists():
            return candidate
    return None


def _iter_prefixes() -> list[Path]:
    prefixes: list[Path] = []
    for path in sorted(APP_SUPPORT.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_dir():
            continue
        if not (path.name.startswith("MT5-") or path.name.startswith("KMFX_MT5") or path.name == "net.metaquotes.wine.metatrader5"):
            continue
        if _locate_program_dir(path):
            prefixes.append(path)
    return prefixes


def _decode_text(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-16", "utf-16-le", "utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")


def _listed_charts(default_dir: Path) -> list[str]:
    order_file = default_dir / "order.wnd"
    if not order_file.exists():
        return []
    return [line.strip() for line in _decode_text(order_file).splitlines() if line.strip().lower().endswith(".chr")]


def _default_profile_status(program_dir: Path) -> dict[str, Any]:
    default_dir = program_dir / "MQL5" / "Profiles" / "Charts" / "Default"
    listed = _listed_charts(default_dir) if default_dir.exists() else []
    missing = [name for name in listed if not (default_dir / name).is_file()]
    return {
        "path": str(default_dir),
        "exists": default_dir.is_dir(),
        "chart01": (default_dir / "chart01.chr").is_file(),
        "order": (default_dir / "order.wnd").is_file(),
        "listed": listed,
        "missing_listed": missing,
        "healthy": default_dir.is_dir() and (default_dir / "chart01.chr").is_file() and (default_dir / "order.wnd").is_file() and not missing,
    }


def _config_state(program_dir: Path) -> dict[str, Any]:
    config_dir = program_dir / "Config"
    common = config_dir / "common.ini"
    result: dict[str, Any] = {
        "accounts_dat": (config_dir / "accounts.dat").exists(),
        "servers_dat": (config_dir / "servers.dat").exists(),
        "common_ini": common.exists(),
        "login": "",
        "server": "",
    }
    if common.exists():
        for line in _decode_text(common).splitlines():
            if line.startswith("Login="):
                result["login"] = line.split("=", 1)[1].strip()
            elif line.startswith("Server="):
                result["server"] = line.split("=", 1)[1].strip()
    return result


def _recent_log_status(program_dir: Path) -> dict[str, Any]:
    logs = sorted((program_dir / "logs").glob("20*.log"))
    if not logs:
        return {"latest": "", "issues": [], "starts": 0}
    latest = logs[-1]
    text = _decode_text(latest)
    issue_terms = (
        "invalid account",
        "no connection",
        "crash",
        "shutdown",
        "stopped with",
        "error loading chart",
        "failed",
    )
    issues = [line for line in text.splitlines() if any(term in line.lower() for term in issue_terms)]
    return {
        "latest": str(latest),
        "issues": issues[-12:],
        "starts": text.count("MetaTrader 5 x64 build"),
    }


def _process_table() -> str:
    return subprocess.check_output(
        ["ps", "-axo", "pid,ppid,lstart,command"],
        text=True,
        stderr=subprocess.DEVNULL,
    )


def _running_processes(prefix: Path, process_table: str) -> list[str]:
    needle = str(prefix / "drive_c" / "Program Files" / "MetaTrader 5" / "terminal64.exe")
    return [line.strip() for line in process_table.splitlines() if needle in line]


def _app_state(name: str) -> dict[str, Any]:
    app = DESKTOP / f"{name}.app"
    info = app / "Contents" / "Info.plist"
    macos = app / "Contents" / "MacOS"
    resources = app / "Contents" / "Resources"
    executables = [item.name for item in macos.iterdir() if item.is_file()] if macos.exists() else []
    return {
        "path": str(app),
        "exists": app.exists(),
        "info_plist": info.exists(),
        "resources": resources.exists(),
        "icon": (resources / "AppIcon.icns").exists(),
        "executables": executables,
        "single_executable": len([name for name in executables if not ".backup" in name and not "kmfx-" in name]) == 1,
        "command_shortcut": (SHORTCUT_DIR / f"{name}.command").exists(),
    }


def build_report() -> dict[str, Any]:
    process_table = _process_table()
    instances: list[dict[str, Any]] = []
    for prefix in _iter_prefixes():
        program_dir = _locate_program_dir(prefix)
        if program_dir is None:
            continue
        app = _app_state(prefix.name) if prefix.name != "net.metaquotes.wine.metatrader5" else {}
        profile = _default_profile_status(program_dir)
        config = _config_state(program_dir)
        log = _recent_log_status(program_dir)
        running = _running_processes(prefix, process_table)
        blockers: list[str] = []
        warnings: list[str] = []
        if not profile["healthy"]:
            blockers.append("default_chart_profile_broken")
        if prefix.name != "net.metaquotes.wine.metatrader5":
            if not app.get("exists"):
                blockers.append("desktop_app_missing")
            if not app.get("icon"):
                warnings.append("desktop_app_icon_missing")
            if not app.get("single_executable"):
                warnings.append("desktop_app_has_multiple_executables")
            if not app.get("command_shortcut"):
                warnings.append("command_shortcut_missing")
        if len(running) > 1:
            blockers.append("multiple_terminal_processes_for_prefix")
        if log["issues"]:
            warnings.append("recent_log_issues")
        instances.append(
            {
                "name": prefix.name,
                "prefix": str(prefix),
                "program_dir": str(program_dir),
                "running": running,
                "profile": profile,
                "config": config,
                "log": log,
                "app": app,
                "status": "blocked" if blockers else ("warning" if warnings else "ok"),
                "blockers": blockers,
                "warnings": warnings,
            }
        )
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "instances": instances,
        "summary": {
            "total": len(instances),
            "ok": sum(1 for item in instances if item["status"] == "ok"),
            "warning": sum(1 for item in instances if item["status"] == "warning"),
            "blocked": sum(1 for item in instances if item["status"] == "blocked"),
        },
    }


def print_human(report: dict[str, Any]) -> None:
    summary = report["summary"]
    print(f"MT5 macOS health: total={summary['total']} ok={summary['ok']} warning={summary['warning']} blocked={summary['blocked']}")
    for item in report["instances"]:
        print(f"- {item['name']}: {item['status']}")
        if item["running"]:
            print(f"  running={len(item['running'])}")
        profile = item["profile"]
        if not profile["healthy"]:
            print("  profile=broken")
        app = item.get("app") or {}
        if app:
            print(f"  app icon={app['icon']} single_executable={app['single_executable']} command={app['command_shortcut']}")
        config = item["config"]
        if config.get("login") or config.get("server"):
            print(f"  account_cache login={config.get('login')} server={config.get('server')}")
        if item["blockers"]:
            print(f"  blockers={', '.join(item['blockers'])}")
        if item["warnings"]:
            print(f"  warnings={', '.join(item['warnings'])}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit local macOS MT5 Wine instances without changing files.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = build_report()
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_human(report)
    return 1 if report["summary"]["blocked"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
