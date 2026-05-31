import type { Metadata } from "next";

import { NotesReferenceSection } from "@/components/trading/notes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Apuntes / KMFX Edge",
  description: "Toma notas sobre operaciones, estrategia y aprendizaje operativo.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function NotesPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <NotesReferenceSection workspace={workspace} />;
}
