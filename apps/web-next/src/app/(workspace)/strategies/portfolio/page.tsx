import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Playbooks portfolios / KMFX Edge",
  description: "Ruta preparada para portfolios de estrategias y riesgo asociado.",
};

export default function StrategiesPortfolioPage() {
  return <UpcomingSection {...upcomingRoutes.strategiesPortfolio} />;
}
