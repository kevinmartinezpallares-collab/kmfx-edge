import type { Metadata } from "next";
import { CalendarWorkspaceRoute } from "@/components/trading/workspace-routes";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Calendario / KMFX Edge",
  description: "Consulta sesiones, eventos y contexto temporal para la operativa.",
};

type CalendarPageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <CalendarWorkspaceRoute workspace={workspace} />;
}
