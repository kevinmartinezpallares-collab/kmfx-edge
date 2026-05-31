import type { Metadata } from "next";
import { AnalyticsRiskReferenceSection } from "@/components/trading/analytics";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Insights de riesgo / KMFX Edge",
  description: "Consulta lectura de riesgo, drawdown y exposición operativa.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsRiskPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AnalyticsRiskReferenceSection workspace={workspace} />;
}
