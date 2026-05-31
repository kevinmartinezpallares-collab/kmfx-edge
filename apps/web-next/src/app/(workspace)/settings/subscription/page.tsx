import { SubscriptionReferenceSection } from "@/components/trading/settings";
import { requestBillingPlanKey } from "@/lib/api/billing-status";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function SettingsSubscriptionPage({ searchParams }: WorkspacePageProps) {
  const [workspace, billingPlanKey] = await Promise.all([
    getWorkspaceStateForSearchParams(searchParams),
    requestBillingPlanKey(),
  ]);

  return (
    <SubscriptionReferenceSection
      initialBillingPlanKey={billingPlanKey}
      workspace={workspace}
    />
  );
}
