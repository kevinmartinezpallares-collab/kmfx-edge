import type { Metadata } from "next";
import { TradesReferenceSection } from "@/components/trading/trades";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Trades / KMFX Edge",
  description: "Revisa operaciones cerradas, resultados y datos de ejecucion.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function TradesPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <TradesReferenceSection workspace={workspace} />;
}
