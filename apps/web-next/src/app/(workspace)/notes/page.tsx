import type { Metadata } from "next";

import { NotesWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Apuntes / KMFX Edge",
  description: "Toma notas sobre operaciones, estrategia y aprendizaje operativo.",
};

type NotesPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <NotesWorkspaceRoute workspace={workspace} />;
}
