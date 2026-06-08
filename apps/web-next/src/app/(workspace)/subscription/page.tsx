import type { Metadata } from "next";
import { SubscriptionReferenceSection } from "@/components/trading/settings";
import {
  requestBillingStatusSummary,
  type BillingAccessNotice,
} from "@/lib/api/billing-status";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Suscripción / KMFX Edge",
  description: "Gestiona acceso, plan y estado de suscripcion de KMFX Edge.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

function firstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function billingAccessNoticeFromSearchParams(
  searchParams: WorkspaceSearchParams | undefined,
): BillingAccessNotice | null {
  const access = firstSearchParamValue(searchParams?.access);

  if (access === "billing-attention") return "billing_attention";
  if (access === "billing-paused") return "billing_paused";
  if (access === "plan-limit") return "plan_limit";
  if (access === "plan-required") return "plan_required";
  if (access === "trial-expired") return "trial_expired";

  return null;
}

export default async function SubscriptionPage({ searchParams }: WorkspacePageProps) {
  const resolvedSearchParams = await searchParams;
  const [workspace, billingStatus] = await Promise.all([
    getWorkspaceStateForSearchParams(resolvedSearchParams),
    requestBillingStatusSummary(),
  ]);
  const welcome = firstSearchParamValue(resolvedSearchParams?.welcome) === "1";
  const accessNotice =
    billingStatus.accessNotice ??
    billingAccessNoticeFromSearchParams(resolvedSearchParams);
  const accessNoticeDate =
    billingStatus.trialEndsAt || billingStatus.currentPeriodEndsAt;

  return (
    <SubscriptionReferenceSection
      accessNotice={accessNotice}
      accessNoticeDate={accessNoticeDate}
      initialBillingPlanKey={billingStatus.planKey}
      welcome={welcome || Boolean(accessNotice)}
      workspace={workspace}
    />
  );
}
