import { SubscriptionReferenceSection } from "@/components/trading/settings";
import { requestBillingStatusSummary } from "@/lib/api/billing-status";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function SettingsSubscriptionPage({ searchParams }: WorkspacePageProps) {
  const [workspace, billingStatus] = await Promise.all([
    getWorkspaceStateForSearchParams(searchParams),
    requestBillingStatusSummary(),
  ]);

  return (
    <SubscriptionReferenceSection
      accessNotice={billingStatus.accessNotice}
      accessNoticeDate={billingStatus.trialEndsAt || billingStatus.currentPeriodEndsAt}
      initialBillingPlanKey={billingStatus.planKey}
      workspace={workspace}
    />
  );
}
