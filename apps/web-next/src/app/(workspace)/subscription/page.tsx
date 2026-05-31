import type { Metadata } from "next";
import { SubscriptionReferenceSection } from "@/components/trading/settings";
import { requestBillingPlanKey } from "@/lib/api/billing-status";
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

export default async function SubscriptionPage({ searchParams }: WorkspacePageProps) {
  const resolvedSearchParams = await searchParams;
  const [workspace, billingPlanKey] = await Promise.all([
    getWorkspaceStateForSearchParams(resolvedSearchParams),
    requestBillingPlanKey(),
  ]);
  const welcome = firstSearchParamValue(resolvedSearchParams?.welcome) === "1";

  return (
    <SubscriptionReferenceSection
      initialBillingPlanKey={billingPlanKey}
      welcome={welcome}
      workspace={workspace}
    />
  );
}
