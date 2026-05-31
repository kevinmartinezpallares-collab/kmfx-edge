import type { Metadata } from "next";
import { CalendarReferenceSection } from "@/components/trading/calendar";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Calendario / KMFX Edge",
  description: "Consulta sesiones, eventos y contexto temporal para la operativa.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function CalendarPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <CalendarReferenceSection workspace={workspace} />;
}
