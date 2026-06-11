import type { Metadata } from "next";
import { AnalyticsHourlyWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Insights horarios / KMFX Edge",
  description: "Explora rendimiento por hora y ventanas de operativa en KMFX Edge.",
};

export default function AnalyticsHourlyPage() {
  return <AnalyticsHourlyWorkspaceRoute />;
}
