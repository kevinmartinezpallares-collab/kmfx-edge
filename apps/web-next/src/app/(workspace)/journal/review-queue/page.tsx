import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export default function JournalReviewQueuePage() {
  return <UpcomingSection {...upcomingRoutes.journalReviewQueue} />;
}
