import { CalculatorWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

type ToolsCalculatorPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function ToolsCalculatorPage({ searchParams }: ToolsCalculatorPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <CalculatorWorkspaceRoute workspace={workspace} />;
}
