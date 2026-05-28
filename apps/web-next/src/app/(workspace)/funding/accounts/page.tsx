import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export default function FundingAccountsPage() {
  return <UpcomingSection {...upcomingRoutes.fundingAccounts} />;
}
