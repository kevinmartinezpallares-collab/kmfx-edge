import { AnalyticsRiskReferenceSection } from "@/components/trading/analytics";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function AnalyticsRiskPage() {
  const workspace = await getWorkspaceState();

  return <AnalyticsRiskReferenceSection workspace={workspace} />;
}
