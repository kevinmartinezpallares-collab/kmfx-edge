import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Prop Firms reglas / KMFX Edge",
  description: "Ruta preparada para reglas oficiales, manuales y recomendaciones.",
};

export default function FundingRulesPage() {
  return <UpcomingSection {...upcomingRoutes.fundingRules} />;
}
