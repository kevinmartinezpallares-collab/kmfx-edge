import type { Metadata } from "next";
import { AccountsReferenceSection } from "@/components/trading/accounts";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Cuentas / KMFX Edge",
  description: "Gestiona cuentas conectadas, snapshots MT5 y estado operativo en KMFX Edge.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AccountsPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AccountsReferenceSection workspace={workspace} />;
}
