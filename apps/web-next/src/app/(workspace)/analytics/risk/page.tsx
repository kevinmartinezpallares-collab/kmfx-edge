import type { Metadata } from "next";
import { AnalyticsRiskWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Insights de riesgo / KMFX Edge",
  description: "Consulta lectura de riesgo, drawdown y exposición operativa.",
};

export default function AnalyticsRiskPage() {
  return <AnalyticsRiskWorkspaceRoute />;
}
