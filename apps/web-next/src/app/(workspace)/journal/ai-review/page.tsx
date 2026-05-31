import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Review IA / KMFX Edge",
  description: "Ruta preparada para revision asistida con limites de confianza.",
};

export default function JournalAiReviewPage() {
  return <UpcomingSection {...upcomingRoutes.journalAiReview} />;
}
