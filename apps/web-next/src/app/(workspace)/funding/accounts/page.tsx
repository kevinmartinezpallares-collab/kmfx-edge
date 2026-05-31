import type { Metadata } from "next";
import { UpcomingSection } from "@/components/app/upcoming-section";
import { upcomingRoutes } from "@/lib/domain/upcoming-routes";

export const metadata: Metadata = {
  title: "Prop Firms cuentas / KMFX Edge",
  description: "Ruta preparada para cuentas de fondeo y reglas por firma.",
};

export default function FundingAccountsPage() {
  return <UpcomingSection {...upcomingRoutes.fundingAccounts} />;
}
