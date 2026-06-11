import type { Metadata } from "next";
import { AnalyticsWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Insights / KMFX Edge",
  description: "Analiza rendimiento, periodos y lectura operativa agregada en KMFX Edge.",
};

export default function AnalyticsPage() {
  return <AnalyticsWorkspaceRoute />;
}
