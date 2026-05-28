import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export default function ExecutionPage() {
  return <UpcomingSection {...upcomingRoutes.execution} />;
}
