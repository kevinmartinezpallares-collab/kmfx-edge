from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets


CONNECTION_KEY_HASH_PREFIX = "sha256:v1:"
CONNECTION_KEY_SEAL_PREFIX = "sealed:v1:"


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


def _connection_key_secret() -> bytes:
    raw_secret = ""
    for name in (
        "KMFX_CONNECTION_KEY_SECRET",
        "KMFX_CONNECTION_KEY_ENCRYPTION_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "JWT_SECRET",
    ):
        raw_secret = str(os.getenv(name) or "").strip()
        if raw_secret:
            break
    if not raw_secret:
        return b""
    return hashlib.sha256(f"kmfx:connection-key-seal:v1:{raw_secret}".encode("utf-8")).digest()


def _connection_key_stream(secret: bytes, nonce: bytes, length: int) -> bytes:
    blocks: list[bytes] = []
    counter = 0
    while sum(len(block) for block in blocks) < length:
        blocks.append(
            hmac.new(
                secret,
                b"kmfx:connection-key-stream:v1:" + nonce + counter.to_bytes(4, "big"),
                hashlib.sha256,
            ).digest()
        )
        counter += 1
    return b"".join(blocks)[:length]


def seal_connection_key(value: object) -> str:
    normalized = normalize_connection_key(value)
    secret = _connection_key_secret()
    if not normalized or not secret:
        return ""
    nonce = secrets.token_bytes(16)
    plaintext = normalized.encode("utf-8")
    stream = _connection_key_stream(secret, nonce, len(plaintext))
    ciphertext = bytes(left ^ right for left, right in zip(plaintext, stream, strict=True))
    tag = hmac.new(
        secret,
        b"kmfx:connection-key-seal:v1:" + nonce + ciphertext,
        hashlib.sha256,
    ).digest()
    token = base64.urlsafe_b64encode(nonce + ciphertext + tag).decode("ascii").rstrip("=")
    return f"{CONNECTION_KEY_SEAL_PREFIX}{token}"


def unseal_connection_key(value: object) -> str:
    sealed = str(value or "").strip()
    secret = _connection_key_secret()
    if not sealed or not secret or not sealed.startswith(CONNECTION_KEY_SEAL_PREFIX):
        return ""
    encoded = sealed[len(CONNECTION_KEY_SEAL_PREFIX) :]
    try:
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    except Exception:
        return ""
    if len(raw) <= 48:
        return ""
    nonce = raw[:16]
    tag = raw[-32:]
    ciphertext = raw[16:-32]
    expected_tag = hmac.new(
        secret,
        b"kmfx:connection-key-seal:v1:" + nonce + ciphertext,
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(tag, expected_tag):
        return ""
    stream = _connection_key_stream(secret, nonce, len(ciphertext))
    plaintext = bytes(left ^ right for left, right in zip(ciphertext, stream, strict=True))
    try:
        return normalize_connection_key(plaintext.decode("utf-8"))
    except UnicodeDecodeError:
        return ""
