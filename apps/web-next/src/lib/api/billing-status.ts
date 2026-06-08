import "server-only";

import { requestAuthenticatedBackendJson } from "@/lib/api/authenticated-backend";
import {
  billingPlanKeyFromPayload,
  type BillingPlanKey,
} from "@/lib/billing/billing-plan-key";

export type BillingAccessNotice =
  | "billing_attention"
  | "billing_paused"
  | "plan_limit"
  | "plan_required"
  | "trial_expired";

export async function requestBillingPlanKey(): Promise<BillingPlanKey | null> {
  try {
    const result = await requestAuthenticatedBackendJson("/api/billing/status");

    return result.ok ? billingPlanKeyFromPayload(result.payload) : null;
  } catch {
    return null;
  }
}
