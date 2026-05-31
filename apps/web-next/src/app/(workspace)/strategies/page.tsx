import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Playbooks / KMFX Edge",
  description: "Ruta preparada para patrones, estrategias y mejora operativa.",
};

export default function StrategiesPage() {
  return <UpcomingSection {...upcomingRoutes.strategies} />;
}
