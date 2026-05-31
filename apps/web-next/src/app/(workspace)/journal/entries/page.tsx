import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Review entradas / KMFX Edge",
  description: "Ruta preparada para captura y edicion de entradas de diario.",
};

export default function JournalEntriesPage() {
  return <UpcomingSection {...upcomingRoutes.journalEntries} />;
}
