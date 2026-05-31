import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Ejecución / KMFX Edge",
  description: "Ruta preparada para métricas de ejecución, timing y disciplina operativa.",
};

export default function ExecutionPage() {
  return <UpcomingSection {...upcomingRoutes.execution} />;
}
