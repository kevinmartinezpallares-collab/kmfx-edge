import type { Metadata } from "next";
import { CapitalWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Portfolio / KMFX Edge",
  description: "Revisa capital, cuentas fondeadas y asignación operativa en KMFX Edge.",
};

type CapitalPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function CapitalPage({ searchParams }: CapitalPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <CapitalWorkspaceRoute workspace={workspace} />;
}
