import type { Metadata } from "next";
import { AnalyticsRiskWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Insights de riesgo / KMFX Edge",
  description: "Consulta lectura de riesgo, drawdown y exposición operativa.",
};

type AnalyticsRiskPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsRiskPage({ searchParams }: AnalyticsRiskPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AnalyticsRiskWorkspaceRoute workspace={workspace} />;
}
