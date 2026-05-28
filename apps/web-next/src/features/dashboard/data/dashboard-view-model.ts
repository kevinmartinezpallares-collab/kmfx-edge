import { getWorkspaceState } from "@/lib/data/workspace-source";

export async function getDashboardViewModel() {
  const workspace = await getWorkspaceState();
  return workspace.dashboard;
}
