import type { Metadata } from "next";
import { AccountsWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Cuentas / KMFX Edge",
  description: "Gestiona cuentas conectadas, snapshots MT5 y estado operativo en KMFX Edge.",
};

type AccountsPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AccountsWorkspaceRoute workspace={workspace} />;
}
