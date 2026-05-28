import { AnalyticsOverviewSection } from "@/components/trading/analytics";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function AnalyticsPage() {
  const workspace = await getWorkspaceState();

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsOverviewSection workspace={workspace} />
    </div>
  );
}
