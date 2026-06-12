import type { Metadata } from "next";
import { AnalyticsHourlyWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Insights horarios / KMFX Edge",
  description: "Explora rendimiento por hora y ventanas de operativa en KMFX Edge.",
};

type AnalyticsHourlyPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsHourlyPage({ searchParams }: AnalyticsHourlyPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AnalyticsHourlyWorkspaceRoute workspace={workspace} />;
}
