import type { Metadata } from "next";
import { AnalyticsHourlyReferenceSection } from "@/components/trading/analytics";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Insights horarios / KMFX Edge",
  description: "Explora rendimiento por hora y ventanas de operativa en KMFX Edge.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsHourlyPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <AnalyticsHourlyReferenceSection workspace={workspace} />;
}
