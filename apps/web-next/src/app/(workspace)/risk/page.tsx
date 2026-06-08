import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { RiskGuardBetaMonitorSection } from "@/components/trading/risk";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Mesa de Riesgo / KMFX Edge",
  description: "Ruta reservada para reglas, límites y política de riesgo.",
};

type RiskPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function RiskPage({ searchParams }: RiskPageProps) {
  if (process.env.KMFX_ENABLE_RISKGUARD_PREVIEW === "1") {
    const workspace = await getWorkspaceStateForSearchParams(searchParams);

    return <RiskGuardBetaMonitorSection workspace={workspace} />;
  }

  return <UpcomingSection {...upcomingRoutes.risk} />;
}
