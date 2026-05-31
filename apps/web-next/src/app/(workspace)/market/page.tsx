import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Mercado / KMFX Edge",
  description: "Ruta preparada para contexto externo y lectura macro de mercado.",
};

export default function MarketPage() {
  return <UpcomingSection {...upcomingRoutes.market} />;
}
