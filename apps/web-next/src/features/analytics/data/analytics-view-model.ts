import { getWorkspaceState } from "@/lib/data/workspace-source";

export async function getAnalyticsViewModel() {
  const workspace = await getWorkspaceState();
  return workspace.analytics;
}
