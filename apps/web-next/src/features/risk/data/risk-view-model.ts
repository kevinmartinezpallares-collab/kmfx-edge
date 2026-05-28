import { getWorkspaceState } from "@/lib/data/workspace-source";

export async function getRiskViewModel() {
  const workspace = await getWorkspaceState();
  return workspace.risk;
}
