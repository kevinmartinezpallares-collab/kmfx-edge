import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Prop Firms / KMFX Edge",
  description: "Ruta preparada para procesos, reglas y payouts de fondeo.",
};

export default function FundingPage() {
  return <UpcomingSection {...upcomingRoutes.funding} />;
}
