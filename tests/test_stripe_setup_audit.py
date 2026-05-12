import importlib.util
import os
import pathlib
import sys
import unittest
from unittest.mock import patch


SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "stripe_kmfx_setup_audit.py"
SPEC = importlib.util.spec_from_file_location("stripe_kmfx_setup_audit", SCRIPT_PATH)
stripe_audit = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = stripe_audit
SPEC.loader.exec_module(stripe_audit)


class StripeSetupAuditTests(unittest.TestCase):
    def test_expected_price_id_ignores_lookup_key_env_values(self) -> None:
        expected = stripe_audit.EXPECTED_PRICES[0]
        with patch.dict(os.environ, {expected.env_name: expected.lookup_key}, clear=False):
            self.assertEqual(expected.price_id, stripe_audit.expected_price_id(expected))

    def test_expected_price_id_accepts_price_id_env_override(self) -> None:
        expected = stripe_audit.EXPECTED_PRICES[0]
        with patch.dict(os.environ, {expected.env_name: "price_custom"}, clear=False):
            self.assertEqual("price_custom", stripe_audit.expected_price_id(expected))


if __name__ == "__main__":
    unittest.main()
