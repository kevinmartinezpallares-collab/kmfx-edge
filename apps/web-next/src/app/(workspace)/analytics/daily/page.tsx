import type { Metadata } from "next";
import { AnalyticsDailyWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Insights diarios / KMFX Edge",
  description: "Revisa el rendimiento diario y patrones de consistencia operativa.",
};

export default function AnalyticsDailyPage() {
  return <AnalyticsDailyWorkspaceRoute />;
}
