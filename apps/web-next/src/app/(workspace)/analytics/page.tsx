import { AnalyticsOverviewSection } from "@/components/trading/analytics";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsOverviewSection workspace={workspace} />
    </div>
  );
}
