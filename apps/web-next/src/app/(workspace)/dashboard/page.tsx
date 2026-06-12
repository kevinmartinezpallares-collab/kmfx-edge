import { DashboardWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

type DashboardPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <DashboardWorkspaceRoute workspace={workspace} />;
}
