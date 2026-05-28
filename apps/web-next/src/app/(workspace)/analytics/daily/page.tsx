import { AnalyticsDailyReferenceSection } from "@/components/trading/analytics";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function AnalyticsDailyPage() {
  const workspace = await getWorkspaceState();

  return <AnalyticsDailyReferenceSection workspace={workspace} />;
}
