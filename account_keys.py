from __future__ import annotations

import hashlib
import hmac


CONNECTION_KEY_HASH_PREFIX = "sha256:v1:"


def normalize_connection_key(value: object) -> str:
    return str(value or "").strip()


def hash_connection_key(value: object) -> str:
    normalized = normalize_connection_key(value)
    if not normalized:
        return ""
    digest = hashlib.sha256(f"kmfx:connection-key:v1:{normalized}".encode("utf-8")).hexdigest()
    return f"{CONNECTION_KEY_HASH_PREFIX}{digest}"


def mask_connection_key(value: object) -> str:
    normalized = normalize_connection_key(value)
    if not normalized:
        return ""
    if len(normalized) <= 10:
        return "[masked]"
    return f"{normalized[:6]}...{normalized[-4:]}"


def connection_key_matches_hash(value: object, stored_hash: object) -> bool:
    normalized_hash = str(stored_hash or "").strip()
    if not normalized_hash:
        return False
    candidate_hash = hash_connection_key(value)
    return bool(candidate_hash) and hmac.compare_digest(candidate_hash, normalized_hash)


def connection_key_matches_any_hash(value: object, stored_hashes: object) -> bool:
    if not isinstance(stored_hashes, list):
        return False
    return any(connection_key_matches_hash(value, stored_hash) for stored_hash in stored_hashes)
