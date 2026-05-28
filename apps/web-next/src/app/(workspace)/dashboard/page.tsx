import { MesaDashboard } from "@/components/trading/mesa-dashboard";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function DashboardPage() {
  const workspace = await getWorkspaceState();

  return <MesaDashboard workspace={workspace} />;
}
