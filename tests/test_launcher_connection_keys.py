from __future__ import annotations

import unittest

from launcher.connection_keys import clean_connection_key, payload_connection_key, resolve_effective_connection_key


class LauncherConnectionKeyTests(unittest.TestCase):
    def test_explicit_connection_key_wins_over_bridge_key(self) -> None:
        key, source = resolve_effective_connection_key(
            explicit_key=" explicit-key ",
            bridge_key="bridge-key",
        )

        self.assertEqual("explicit-key", key)
        self.assertEqual("explicit", source)

    def test_bridge_key_is_fallback_when_payload_has_no_key(self) -> None:
        key, source = resolve_effective_connection_key(
            explicit_key="",
            bridge_key=" bridge-key ",
        )

        self.assertEqual("bridge-key", key)
        self.assertEqual("bridge", source)

    def test_empty_keys_return_empty_resolution(self) -> None:
        self.assertEqual(("", ""), resolve_effective_connection_key())

    def test_clean_connection_key_normalizes_missing_values(self) -> None:
        self.assertEqual("", clean_connection_key(None))
        self.assertEqual("abc", clean_connection_key(" abc "))

    def test_payload_connection_key_reads_modern_or_legacy_fields(self) -> None:
        self.assertEqual("modern", payload_connection_key({"connection_key": " modern "}))
        self.assertEqual("legacy", payload_connection_key({"KMFXApiKey": " legacy "}))
        self.assertEqual("", payload_connection_key({"connection_key": ""}))
        self.assertEqual("", payload_connection_key(None))


if __name__ == "__main__":
    unittest.main()
