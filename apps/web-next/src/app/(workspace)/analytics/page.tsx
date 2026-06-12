import type { Metadata } from "next";
import { AnalyticsWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Insights / KMFX Edge",
  description: "Analiza rendimiento, periodos y lectura operativa agregada en KMFX Edge.",
};

type AnalyticsPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AnalyticsWorkspaceRoute workspace={workspace} />;
}
