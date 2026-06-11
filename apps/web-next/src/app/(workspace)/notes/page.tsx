import type { Metadata } from "next";

import { NotesWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Apuntes / KMFX Edge",
  description: "Toma notas sobre operaciones, estrategia y aprendizaje operativo.",
};

export default function NotesPage() {
  return <NotesWorkspaceRoute />;
}
