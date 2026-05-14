#!/usr/bin/env python3
"""Verify that the packaged KMFX EA binary matches the current source release."""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "KMFXConnector.mq5"
BINARY = ROOT / "KMFXConnector.ex5"
CHECKSUM = ROOT / "KMFXConnector.ex5.sha256"


def read_connector_version() -> str:
    body = SOURCE.read_text(encoding="utf-8", errors="ignore")

    define_match = re.search(r'#define\s+KMFX_CONNECTOR_VERSION\s+"([^"]+)"', body)
    if define_match:
        return define_match.group(1)

    property_match = re.search(r'#property\s+version\s+"([^"]+)"', body)
    if property_match:
        return property_match.group(1)

    raise RuntimeError("Unable to determine KMFX connector version from source.")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fail(message: str) -> int:
    print(f"[KMFX][EA][ERROR] {message}", file=sys.stderr)
    return 1


def main() -> int:
    if not SOURCE.is_file():
        return fail(f"Missing EA source: {SOURCE}")
    if not BINARY.is_file():
        return fail(f"Missing packaged EA binary: {BINARY}")
    if not CHECKSUM.is_file():
        return fail(f"Missing checksum file: {CHECKSUM}")

    source_version = read_connector_version()
    source_mtime = SOURCE.stat().st_mtime
    binary_mtime = BINARY.stat().st_mtime
    if binary_mtime + 1 < source_mtime:
        return fail(
            "KMFXConnector.ex5 is older than KMFXConnector.mq5. "
            "Compile the EA again before packaging or shipping."
        )

    actual_hash = sha256(BINARY)
    checksum_line = CHECKSUM.read_text(encoding="utf-8", errors="ignore").strip()
    checksum_match = re.match(r"^([0-9a-fA-F]{64})\s+\*?KMFXConnector\.ex5$", checksum_line)
    if not checksum_match:
        return fail("KMFXConnector.ex5.sha256 is malformed or references the wrong artifact.")
    declared_hash = checksum_match.group(1).lower()
    if declared_hash != actual_hash:
        return fail(
            "KMFXConnector.ex5.sha256 does not match the packaged binary. "
            f"expected={declared_hash} actual={actual_hash}"
        )

    print(
        f"[KMFX][EA] release OK version={source_version} "
        f"binary_sha256={actual_hash} source={SOURCE.name} binary={BINARY.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
