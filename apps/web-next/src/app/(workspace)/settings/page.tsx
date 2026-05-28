import { SettingsReferenceSection } from "@/components/trading/settings";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function SettingsPage() {
  const workspace = await getWorkspaceState();

  return <SettingsReferenceSection workspace={workspace} />;
}
