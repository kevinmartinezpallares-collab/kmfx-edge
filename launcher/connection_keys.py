from __future__ import annotations


def clean_connection_key(value: object) -> str:
    return str(value or "").strip()


def resolve_effective_connection_key(*, explicit_key: object = "", bridge_key: object = "") -> tuple[str, str]:
    explicit = clean_connection_key(explicit_key)
    if explicit:
        return explicit, "explicit"
    bridge = clean_connection_key(bridge_key)
    if bridge:
        return bridge, "bridge"
    return "", ""
