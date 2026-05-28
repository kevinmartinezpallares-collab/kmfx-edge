#!/usr/bin/env python3
"""Estimate Render build/pipeline minutes month-to-date (MTD) via Render Public API.

This script avoids third-party deps so it can run in GitHub Actions or a minimal
automation environment.

It sums deploy wall-clock duration (finishedAt - startedAt) for deploys created
since the first day of the current UTC month. This is an approximation of build
pipeline minutes (includes build + deploy time as Render reports it).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Iterable


API_BASE = "https://api.render.com/v1"


@dataclass(frozen=True)
class RenderResponse:
    status: int
    body: bytes
    url: str


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_z(value: dt.datetime) -> str:
    value = value.astimezone(dt.timezone.utc)
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def month_start_utc(now: dt.datetime) -> dt.datetime:
    now = now.astimezone(dt.timezone.utc)
    return dt.datetime(now.year, now.month, 1, tzinfo=dt.timezone.utc)


def http_request(*, token: str, method: str, url: str) -> RenderResponse:
    req = urllib.request.Request(
        url,
        method=method,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "KMFX-Render-Pipeline-Monitor/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return RenderResponse(status=resp.status, body=resp.read(), url=resp.geturl())
    except urllib.error.HTTPError as exc:
        return RenderResponse(status=exc.code, body=exc.read(), url=url)
    except urllib.error.URLError as exc:
        return RenderResponse(status=0, body=str(exc).encode("utf-8", errors="replace"), url=url)


def parse_json(response: RenderResponse) -> Any:
    if response.status != 200:
        detail = response.body.decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Render API request failed status={response.status} url={response.url} detail={detail}")
    return json.loads(response.body.decode("utf-8"))


def get_env_token() -> str:
    return (
        os.environ.get("RENDER_API_KEY")
        or os.environ.get("RENDER_API_TOKEN")
        or os.environ.get("RENDER_TOKEN")
        or ""
    ).strip()


def paginate(
    *,
    token: str,
    path: str,
    query: dict[str, str],
    limit: int = 100,
) -> Iterable[dict[str, Any]]:
    cursor: str | None = None
    while True:
        q = dict(query)
        q["limit"] = str(limit)
        if cursor:
            q["cursor"] = cursor
        url = f"{API_BASE}{path}?{urllib.parse.urlencode(q)}"
        data = parse_json(http_request(token=token, method="GET", url=url))
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected Render API payload for {path}: expected list")
        if not data:
            return
        for item in data:
            yield item
        cursor_obj = data[-1].get("cursor") if isinstance(data[-1], dict) else None
        cursor = cursor_obj.get("next") if isinstance(cursor_obj, dict) else None
        if not cursor:
            return


def parse_dt(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.datetime.fromisoformat(value)
    except ValueError:
        return None


def safe_minutes(started: str | None, finished: str | None) -> float | None:
    start_dt = parse_dt(started)
    finish_dt = parse_dt(finished)
    if not start_dt or not finish_dt:
        return None
    seconds = (finish_dt - start_dt).total_seconds()
    if seconds < 0:
        return None
    return seconds / 60.0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Estimate Render deploy (pipeline) minutes month-to-date")
    parser.add_argument("--name-contains", default=os.environ.get("RENDER_SERVICE_NAME_CONTAINS", "kmfx"))
    parser.add_argument("--include-all-services", action="store_true")
    args = parser.parse_args(argv)

    token = get_env_token()
    if not token:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "missing_render_api_key",
                    "hint": "Set RENDER_API_KEY (read-only) in the automation environment.",
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 2

    now = utc_now()
    period_start = month_start_utc(now)
    services: list[dict[str, Any]] = []
    for item in paginate(token=token, path="/services", query={"includePreviews": "false"}):
        service = item.get("service") if isinstance(item, dict) else None
        if not isinstance(service, dict):
            continue
        name = str(service.get("name") or "")
        if args.include_all_services or (args.name_contains and args.name_contains.lower() in name.lower()):
            services.append(service)

    results: dict[str, Any] = {
        "ok": True,
        "period_start_utc": iso_z(period_start),
        "period_end_utc": iso_z(now),
        "service_count": len(services),
        "services": [],
        "totals": {
            "deploy_count": 0,
            "deploy_minutes_sum": 0.0,
            "deploy_minutes_incomplete": 0,
            "triggers": {},
        },
    }

    for service in sorted(services, key=lambda s: str(s.get("name") or "")):
        service_id = str(service.get("id") or "")
        service_name = str(service.get("name") or "")
        service_type = str(service.get("type") or "")
        if not service_id:
            continue
        deploy_minutes = 0.0
        deploy_count = 0
        incomplete = 0
        triggers: dict[str, int] = {}
        for item in paginate(
            token=token,
            path=f"/services/{urllib.parse.quote(service_id)}/deploys",
            query={"createdAfter": iso_z(period_start)},
        ):
            deploy = item.get("deploy") if isinstance(item, dict) else None
            if not isinstance(deploy, dict):
                continue
            deploy_count += 1
            minutes = safe_minutes(deploy.get("startedAt"), deploy.get("finishedAt"))
            if minutes is None:
                incomplete += 1
            else:
                deploy_minutes += minutes
            trigger = str(deploy.get("trigger") or "unknown")
            triggers[trigger] = triggers.get(trigger, 0) + 1

        results["services"].append(
            {
                "id": service_id,
                "name": service_name,
                "type": service_type,
                "deploy_count": deploy_count,
                "deploy_minutes_sum": round(deploy_minutes, 2),
                "deploy_minutes_incomplete": incomplete,
                "triggers": dict(sorted(triggers.items(), key=lambda kv: (-kv[1], kv[0]))),
            }
        )
        results["totals"]["deploy_count"] += deploy_count
        results["totals"]["deploy_minutes_sum"] += deploy_minutes
        results["totals"]["deploy_minutes_incomplete"] += incomplete
        for trigger, count in triggers.items():
            results["totals"]["triggers"][trigger] = results["totals"]["triggers"].get(trigger, 0) + count

    results["totals"]["deploy_minutes_sum"] = round(float(results["totals"]["deploy_minutes_sum"]), 2)
    results["totals"]["triggers"] = dict(sorted(results["totals"]["triggers"].items(), key=lambda kv: (-kv[1], kv[0])))

    print(json.dumps(results, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

