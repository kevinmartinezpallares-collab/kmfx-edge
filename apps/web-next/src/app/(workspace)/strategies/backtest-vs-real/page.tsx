import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Backtest vs real / KMFX Edge",
  description: "Ruta preparada para comparar backtest y resultados reales.",
};

export default function StrategiesBacktestVsRealPage() {
  return <UpcomingSection {...upcomingRoutes.strategiesBacktestVsReal} />;
}
