import { AnalyticsHourlyReferenceSection } from "@/components/trading/analytics";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function AnalyticsHourlyPage() {
  const workspace = await getWorkspaceState();

  return <AnalyticsHourlyReferenceSection workspace={workspace} />;
}
