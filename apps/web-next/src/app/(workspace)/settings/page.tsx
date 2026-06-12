import { SettingsWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

type SettingsPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <SettingsWorkspaceRoute workspace={workspace} />;
}
