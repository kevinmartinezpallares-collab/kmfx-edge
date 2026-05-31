import type { Metadata } from "next";
import { AnalyticsDailyReferenceSection } from "@/components/trading/analytics";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Insights diarios / KMFX Edge",
  description: "Revisa el rendimiento diario y patrones de consistencia operativa.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsDailyPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AnalyticsDailyReferenceSection workspace={workspace} />;
}
