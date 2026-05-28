import { CapitalReferenceSection } from "@/components/trading/capital";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function CapitalPage() {
  const workspace = await getWorkspaceState();

  return <CapitalReferenceSection workspace={workspace} />;
}
