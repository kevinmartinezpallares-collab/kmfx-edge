import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Noticias macro / KMFX Edge",
  description: "Ruta preparada para calendario economico y eventos de mercado.",
};

export default function EconomicCalendarPage() {
  return <UpcomingSection {...upcomingRoutes.marketEconomicCalendar} />;
}
