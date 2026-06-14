import os
from datetime import datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import patch

import kmfx_connector_api as api


class BetaInviteAccessTests(TestCase):
    def billing_payload(self, created_at: str):
        context = {
            "app_metadata": {"plan": "free"},
            "created_at": created_at,
            "email": "student@example.com",
            "is_admin": False,
            "user_id": "user-beta-1",
            "user_metadata": {"kmfx_beta_invite_code": " Discord-Beta "},
        }
        with patch.object(api, "backfill_billing_subscription_for_context", return_value={}):
            return api.billing_status_payload_for_context(context)

    def test_invite_code_grants_unlimited_beta_trial_without_stripe(self):
        now = datetime.now(timezone.utc)
        with patch.dict(
            os.environ,
            {
                "KMFX_INVITE_CODES": "discord-beta",
                "KMFX_INVITE_TRIAL_DAYS": "7",
                "KMFX_INVITE_TRIAL_PLAN": "unlimited",
            },
            clear=False,
        ):
            payload = self.billing_payload(now.isoformat())

        self.assertEqual(payload["billing"]["status"], "trialing")
        self.assertEqual(payload["billing"]["plan"], "unlimited")
        self.assertEqual(payload["billing"]["effectivePlan"], "unlimited")
        self.assertEqual(payload["billing"]["access"], "active")
        self.assertEqual(payload["limits"]["connectionKeyLimit"], "custom")
        self.assertEqual(payload["source"], "beta_invite")
        self.assertTrue(payload["betaAccess"]["active"])

    def test_expired_invite_keeps_plan_visible_but_restricts_access(self):
        old_signup = datetime.now(timezone.utc) - timedelta(days=9)
        with patch.dict(
            os.environ,
            {
                "KMFX_INVITE_CODES": "discord-beta",
                "KMFX_INVITE_TRIAL_DAYS": "7",
                "KMFX_INVITE_TRIAL_PLAN": "unlimited",
            },
            clear=False,
        ):
            payload = self.billing_payload(old_signup.isoformat())

        self.assertEqual(payload["billing"]["status"], "paused")
        self.assertEqual(payload["billing"]["plan"], "unlimited")
        self.assertEqual(payload["billing"]["effectivePlan"], "free")
        self.assertEqual(payload["billing"]["access"], "restricted")
        self.assertEqual(payload["limits"]["connectionKeyLimit"], 0)
        self.assertEqual(payload["source"], "beta_invite_expired")
        self.assertFalse(payload["betaAccess"]["active"])
