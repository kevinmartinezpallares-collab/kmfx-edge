import type { BillingPlanKey } from "@/lib/billing/billing-plan-key";

export type BillingAccessNotice =
  | "billing_paused"
  | "billing_attention"
  | "plan_limit"
  | "plan_required"
  | "trial_expired";

export type BillingBetaOffer = {
  active: boolean;
  discountPercent: number;
  expiresAt: string;
  id: string;
  interval: "monthly" | "yearly";
  plan: BillingPlanKey;
  reason: string;
};

export type BillingStatusSummary = {
  accessNotice: BillingAccessNotice | null;
  betaOffer: BillingBetaOffer | null;
  currentPeriodEndsAt: string;
  planKey: BillingPlanKey | null;
  status: string;
  trialEndsAt: string;
};
