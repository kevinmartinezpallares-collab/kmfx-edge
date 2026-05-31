import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Prop Firms procesos / KMFX Edge",
  description: "Ruta preparada para seguimiento de challenges y cuentas funded.",
};

export default function FundingJourneysPage() {
  return <UpcomingSection {...upcomingRoutes.fundingJourneys} />;
}
