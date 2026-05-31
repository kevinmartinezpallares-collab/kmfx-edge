import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Review / KMFX Edge",
  description: "Ruta preparada para diario, revision operativa y aprendizaje.",
};

export default function JournalPage() {
  return <UpcomingSection {...upcomingRoutes.journal} />;
}
