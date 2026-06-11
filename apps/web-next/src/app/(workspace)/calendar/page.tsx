import type { Metadata } from "next";
import { CalendarWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Calendario / KMFX Edge",
  description: "Consulta sesiones, eventos y contexto temporal para la operativa.",
};

export default function CalendarPage() {
  return <CalendarWorkspaceRoute />;
}
