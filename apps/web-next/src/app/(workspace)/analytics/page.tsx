import type { Metadata } from "next";
import { AnalyticsOverviewSection } from "@/components/trading/analytics";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Insights / KMFX Edge",
  description: "Analiza rendimiento, periodos y lectura operativa agregada en KMFX Edge.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function AnalyticsPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsOverviewSection workspace={workspace} />
    </div>
  );
}
