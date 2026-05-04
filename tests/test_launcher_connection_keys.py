from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from launcher.backend_client import BackendClient, BackendResponse
from launcher.connection_keys import clean_connection_key, payload_connection_key, resolve_effective_connection_key
from launcher.config import LauncherConfig
from launcher.state_store import LauncherStateStore


class RecordingBackendClient(BackendClient):
    def __init__(self) -> None:
        super().__init__(LauncherConfig())
        self.calls: list[dict[str, object]] = []

    def _request(self, method, path, payload=None, query=None, connection_key=None):  # type: ignore[override]
        self.calls.append(
            {
                "method": method,
                "path": path,
                "payload": payload,
                "query": query,
                "connection_key": connection_key,
            }
        )
        return BackendResponse(ok=True, status_code=200, body={})


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

    def test_policy_request_sends_key_as_header_argument_not_query(self) -> None:
        client = RecordingBackendClient()
        client.get_policy(login="123456", connection_key="abcdef1234567890")

        self.assertEqual(
            {
                "method": "GET",
                "path": "/api/mt5/policy",
                "payload": None,
                "query": {"login": "123456"},
                "connection_key": "abcdef1234567890",
            },
            client.calls[0],
        )

    def test_snapshot_request_strips_connection_key_from_body(self) -> None:
        client = RecordingBackendClient()
        client.post_snapshot({"connection_key": "abcdef1234567890", "login": "123456"})

        self.assertEqual({"login": "123456"}, client.calls[0]["payload"])
        self.assertEqual("abcdef1234567890", client.calls[0]["connection_key"])

    def test_safe_url_masks_legacy_connection_key_query(self) -> None:
        client = BackendClient(LauncherConfig())
        safe_url = client._safe_url("https://api.example.test/api/mt5/policy?login=123&connection_key=abcdef1234567890")
        self.assertNotIn("abcdef1234567890", safe_url)
        self.assertIn("connection_key=abcdef...7890", safe_url)

    def test_launcher_state_store_keeps_local_account_connection_keys_by_account(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"KMFX_LAUNCHER_HOME": temp_dir}):
                store = LauncherStateStore()
                store.save_account_connection(
                    {
                        "account_id": "account-1",
                        "label": "Orion MT5",
                        "connection_key": "first-local-key",
                    }
                )
                store.save_account_connection(
                    {
                        "account_id": "account-1",
                        "label": "Orion MT5",
                        "connection_key": "rotated-local-key",
                    }
                )

                connections = store.list_account_connections()

        self.assertEqual(1, len(connections))
        self.assertEqual("account-1", connections[0]["account_id"])
        self.assertEqual("rotated-local-key", connections[0]["connection_key"])


if __name__ == "__main__":
    unittest.main()
