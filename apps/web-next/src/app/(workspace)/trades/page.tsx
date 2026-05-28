import { TradesReferenceSection } from "@/components/trading/trades";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function TradesPage() {
  const workspace = await getWorkspaceState();

  return <TradesReferenceSection workspace={workspace} />;
}
