import type { Metadata } from "next";
import { StudyReferenceSection } from "@/components/trading/system";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Biblioteca / KMFX Edge",
  description: "Consulta recursos, estudio y material operativo en KMFX Edge.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function StudyPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <StudyReferenceSection workspace={workspace} />;
}
