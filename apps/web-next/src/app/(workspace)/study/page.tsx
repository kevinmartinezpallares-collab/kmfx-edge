import type { Metadata } from "next";
import { StudyWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Biblioteca / KMFX Edge",
  description: "Consulta recursos, estudio y material operativo en KMFX Edge.",
};

export default function StudyPage() {
  return <StudyWorkspaceRoute />;
}
