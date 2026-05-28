#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


API_BASE = "https://api.render.com/v1"


def env_value(*names: str) -> str:
    for name in names:
        value = str(os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def render_request(token: str, method: str, path: str, body: dict[str, object] | None = None) -> object:
    data = None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        f"{API_BASE}{path}",
        method=method,
        data=data,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")[:500]
        raise SystemExit(f"render_api_http_{exc.code}: {details}") from exc
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def find_service_id(token: str, name_contains: str) -> str:
    cursor = ""
    matches: list[dict[str, object]] = []
    while True:
        query = {"limit": "100"}
        if cursor:
            query["cursor"] = cursor
        payload = render_request(token, "GET", f"/services?{urllib.parse.urlencode(query)}")
        if not isinstance(payload, list):
            raise SystemExit("render_api_unexpected_services_payload")
        for item in payload:
            service = item.get("service") if isinstance(item, dict) else None
            if not isinstance(service, dict):
                continue
            name = str(service.get("name") or "")
            if name_contains.lower() in name.lower():
                matches.append(service)
        next_cursor = ""
        if payload and isinstance(payload[-1], dict):
            next_cursor = str(payload[-1].get("cursor") or "")
        if not next_cursor:
            break
        cursor = next_cursor
    if not matches:
        raise SystemExit(f"render_service_not_found: name_contains={name_contains!r}")
    if len(matches) > 1:
        names = ", ".join(str(item.get("name") or item.get("id")) for item in matches)
        raise SystemExit(f"render_service_ambiguous: {names}")
    return str(matches[0].get("id") or "")


def main() -> int:
    parser = argparse.ArgumentParser(description="Suspend, resume, inspect, or deploy a Render service.")
    parser.add_argument(
        "--action",
        choices=("suspend", "resume", "status", "deploy"),
        default="suspend",
        help="Render service action. Defaults to suspend to preserve the historical script behavior.",
    )
    parser.add_argument("--service-id", default=env_value("RENDER_SERVICE_ID"))
    parser.add_argument("--name-contains", default=env_value("RENDER_SERVICE_NAME_CONTAINS") or "kmfx-edge-api")
    parser.add_argument("--commit-id", default=env_value("RENDER_COMMIT_ID"), help="Optional Git commit SHA for --action deploy.")
    parser.add_argument("--clear-cache", action="store_true", help="Clear Render build cache for --action deploy.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    token = env_value("RENDER_API_KEY", "RENDER_API_TOKEN", "RENDER_TOKEN")
    if not token and not (args.dry_run and args.service_id):
        print("missing_render_api_key: set RENDER_API_KEY, RENDER_API_TOKEN, or RENDER_TOKEN", file=sys.stderr)
        return 2

    service_id = args.service_id or find_service_id(token, args.name_contains)
    if not service_id:
        print("missing_render_service_id", file=sys.stderr)
        return 2
    if args.dry_run:
        print(json.dumps({"ok": True, "dry_run": True, "action": args.action, "service_id": service_id}, indent=2))
        return 0

    if args.action == "status":
        result = render_request(token, "GET", f"/services/{urllib.parse.quote(service_id)}")
    elif args.action == "deploy":
        body: dict[str, object] = {
            "clearCache": "clear" if args.clear_cache else "do_not_clear",
        }
        if args.commit_id:
            body["commitId"] = args.commit_id
        result = render_request(token, "POST", f"/services/{urllib.parse.quote(service_id)}/deploys", body=body)
    else:
        result = render_request(token, "POST", f"/services/{urllib.parse.quote(service_id)}/{args.action}")
    print(json.dumps({"ok": True, "action": args.action, "service_id": service_id, "result": result}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
