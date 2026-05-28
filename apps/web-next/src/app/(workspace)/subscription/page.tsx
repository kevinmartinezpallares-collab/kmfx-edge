import { SubscriptionReferenceSection } from "@/components/trading/settings";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function SubscriptionPage() {
  const workspace = await getWorkspaceState();

  return <SubscriptionReferenceSection workspace={workspace} />;
}
