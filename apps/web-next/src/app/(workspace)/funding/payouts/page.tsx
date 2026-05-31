import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Prop Firms payouts / KMFX Edge",
  description: "Ruta preparada para solicitudes, fechas y ledger de payouts.",
};

export default function FundingPayoutsPage() {
  return <UpcomingSection {...upcomingRoutes.fundingPayouts} />;
}
