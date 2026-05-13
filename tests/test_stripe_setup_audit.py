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

    def test_audit_product_requires_kmfx_subscription_metadata(self) -> None:
        with patch.object(
            stripe_audit,
            "stripe_request",
            return_value={
                "id": "prod_123",
                "active": True,
                "metadata": {"app": "kmfx_edge", "billing_model": "subscription"},
            },
        ):
            self.assertEqual([], stripe_audit.audit_product("prod_123"))

        with patch.object(
            stripe_audit,
            "stripe_request",
            return_value={"id": "prod_123", "active": False, "metadata": {}},
        ):
            self.assertEqual(
                [
                    "product:not_active:prod_123",
                    "product_mismatch:prod_123:metadata.app",
                    "product_mismatch:prod_123:metadata.billing_model",
                ],
                stripe_audit.audit_product("prod_123"),
            )

    def test_customer_portal_requires_subscription_features_and_kmfx_prices(self) -> None:
        expected_ids = sorted(stripe_audit.expected_price_ids())
        config = {
            "active": True,
            "features": {
                "invoice_history": {"enabled": True},
                "payment_method_update": {"enabled": True},
                "subscription_cancel": {"enabled": True},
                "subscription_update": {
                    "enabled": True,
                    "products": [{"product": "prod_123", "prices": expected_ids}],
                },
            },
        }
        with patch.object(stripe_audit, "list_all", return_value=[config]):
            self.assertEqual([], stripe_audit.audit_customer_portal("prod_123"))

    def test_customer_portal_flags_external_products_and_missing_prices(self) -> None:
        expected_ids = sorted(stripe_audit.expected_price_ids())
        config = {
            "active": True,
            "features": {
                "invoice_history": {"enabled": True},
                "payment_method_update": {"enabled": True},
                "subscription_cancel": {"enabled": True},
                "subscription_update": {
                    "enabled": True,
                    "products": [
                        {"product": "prod_123", "prices": expected_ids[:1]},
                        {"product": "prod_external", "prices": ["price_other"]},
                    ],
                },
            },
        }
        with patch.object(stripe_audit, "list_all", return_value=[config]):
            issues = stripe_audit.audit_customer_portal("prod_123")

        self.assertIn("customer_portal:subscription_update:external_product:prod_external", issues)
        self.assertIn(f"customer_portal:subscription_update:missing_price:{expected_ids[1]}", issues)

    def test_customer_portal_flags_missing_active_configuration(self) -> None:
        with patch.object(stripe_audit, "list_all", return_value=[]):
            self.assertEqual(
                ["customer_portal:no_active_configuration"],
                stripe_audit.audit_customer_portal("prod_123"),
            )


if __name__ == "__main__":
    unittest.main()
