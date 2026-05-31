import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Review cola / KMFX Edge",
  description: "Ruta preparada para priorizar operaciones pendientes de revision.",
};

export default function JournalReviewQueuePage() {
  return <UpcomingSection {...upcomingRoutes.journalReviewQueue} />;
}
