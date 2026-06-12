import type { Metadata } from "next";
import { StudyWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Biblioteca / KMFX Edge",
  description: "Consulta recursos, estudio y material operativo en KMFX Edge.",
};

type StudyPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function StudyPage({ searchParams }: StudyPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <StudyWorkspaceRoute workspace={workspace} />;
}
