export type BillingPlanKey = "core" | "pro" | "unlimited";

function normalizeBillingPlanKey(value: unknown): BillingPlanKey | null {
  if (value === "core" || value === "pro" || value === "unlimited") {
    return value;
  }

  return null;
}

export function billingPlanKeyFromPayload(payload: unknown): BillingPlanKey | null {
  if (!payload || typeof payload !== "object") return null;

  const billing = (payload as { billing?: unknown }).billing;
  if (!billing || typeof billing !== "object") return null;

  const data = billing as {
    effectivePlan?: unknown;
    plan?: unknown;
  };

  return normalizeBillingPlanKey(data.effectivePlan) ?? normalizeBillingPlanKey(data.plan);
}
