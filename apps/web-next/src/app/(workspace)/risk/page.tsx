import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "RiskGuard / KMFX Edge",
  description: "Ruta preparada para reglas, limites y politica de riesgo.",
};

export default function RiskPage() {
  return <UpcomingSection {...upcomingRoutes.risk} />;
}
