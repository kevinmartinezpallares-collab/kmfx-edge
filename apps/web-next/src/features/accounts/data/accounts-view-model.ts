import { getWorkspaceState } from "@/lib/data/workspace-source";
import { getAccountsOverview } from "@/lib/domain/accounts-selectors";

export async function getAccountsViewModel() {
  const workspace = await getWorkspaceState();
  return getAccountsOverview(workspace);
}
