import type { Metadata } from "next";
import { AnalyticsDailyWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Insights diarios / KMFX Edge",
  description: "Revisa el rendimiento diario y patrones de consistencia operativa.",
};

type AnalyticsDailyPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsDailyPage({ searchParams }: AnalyticsDailyPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AnalyticsDailyWorkspaceRoute workspace={workspace} />;
}
