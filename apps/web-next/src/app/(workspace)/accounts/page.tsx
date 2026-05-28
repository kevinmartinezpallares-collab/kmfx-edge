import { AccountsReferenceSection } from "@/components/trading/accounts";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function AccountsPage() {
  const workspace = await getWorkspaceState();

  return <AccountsReferenceSection workspace={workspace} />;
}
