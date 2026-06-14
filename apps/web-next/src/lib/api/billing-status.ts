import "server-only";

import { requestAuthenticatedBackendJson } from "@/lib/api/authenticated-backend";
import {
  billingPlanKeyFromPayload,
  type BillingPlanKey,
} from "@/lib/billing/billing-plan-key";
import type {
  BillingAccessNotice,
  BillingBetaOffer,
  BillingStatusSummary,
} from "@/lib/billing/billing-status-summary";

export type {
  BillingAccessNotice,
  BillingBetaOffer,
  BillingStatusSummary,
} from "@/lib/billing/billing-status-summary";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hasDatePassed(value: string) {
  if (!value) return false;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function betaOfferFromPayload(payload: unknown): BillingBetaOffer | null {
  const data = asRecord(payload);
  const offer = asRecord(data.betaOffer);
  const plan = billingPlanKeyFromPayload({ billing: { plan: offer.plan } });
  const interval = asString(offer.interval);
  const discountPercent =
    typeof offer.discountPercent === "number" ? offer.discountPercent : 0;

  if (
    offer.active !== true ||
    !plan ||
    (interval !== "monthly" && interval !== "yearly") ||
    discountPercent <= 0
  ) {
    return null;
  }

  return {
    active: true,
    discountPercent,
    expiresAt: asString(offer.expiresAt),
    id: asString(offer.id),
    interval,
    plan,
    reason: asString(offer.reason),
  };
}

function accessNoticeFromPayload(payload: unknown): BillingAccessNotice | null {
  const data = asRecord(payload);
  const billing = asRecord(data.billing);
  const entitlements = asRecord(data.entitlements);
  const limits = asRecord(data.limits);
  const access = asString(billing.access);
  const status = asString(billing.status).toLowerCase();
  const currentPeriodEndsAt = asString(billing.currentPeriodEndsAt);
  const trialEndsAt = asString(billing.trialEndsAt);

  if (data.is_admin === true) return null;

  if (access === "billing_attention") return "billing_attention";

  if (access === "restricted") {
    if (
      status === "trialing_paused" ||
      hasDatePassed(trialEndsAt) ||
      hasDatePassed(currentPeriodEndsAt)
    ) {
      return "trial_expired";
    }

    if (status === "paused") return "billing_paused";

    return "plan_required";
  }

  if (entitlements.launcherConnection !== true) return "plan_required";

  const rawConnectionLimit = limits.connectionKeyLimit ?? limits.liveMt5Accounts;
  if (rawConnectionLimit === 0) return "plan_limit";

  return null;
}

export async function requestBillingPlanKey(): Promise<BillingPlanKey | null> {
  try {
    const result = await requestAuthenticatedBackendJson("/api/billing/status");

    return result.ok ? billingPlanKeyFromPayload(result.payload) : null;
  } catch {
    return null;
  }
}

export async function requestBillingStatusSummary(): Promise<BillingStatusSummary> {
  try {
    const result = await requestAuthenticatedBackendJson("/api/billing/status");
    const payload = result.payload;
    const billing = asRecord(asRecord(payload).billing);

    return {
      accessNotice: result.ok ? accessNoticeFromPayload(payload) : null,
      betaOffer: result.ok ? betaOfferFromPayload(payload) : null,
      currentPeriodEndsAt: asString(billing.currentPeriodEndsAt),
      planKey: result.ok ? billingPlanKeyFromPayload(payload) : null,
      status: asString(billing.status),
      trialEndsAt: asString(billing.trialEndsAt),
    };
  } catch {
    return {
      accessNotice: null,
      betaOffer: null,
      currentPeriodEndsAt: "",
      planKey: null,
      status: "",
      trialEndsAt: "",
    };
  }
}
