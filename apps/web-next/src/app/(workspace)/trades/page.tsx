import type { Metadata } from "next";
import { TradesWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Trades / KMFX Edge",
  description: "Revisa operaciones cerradas, resultados y datos de ejecucion.",
};

type TradesPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <TradesWorkspaceRoute workspace={workspace} />;
}
