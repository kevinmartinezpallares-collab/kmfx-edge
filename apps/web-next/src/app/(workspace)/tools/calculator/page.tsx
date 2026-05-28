import { CalculatorReferenceSection } from "@/components/trading/system";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function ToolsCalculatorPage() {
  const workspace = await getWorkspaceState();

  return <CalculatorReferenceSection workspace={workspace} />;
}
