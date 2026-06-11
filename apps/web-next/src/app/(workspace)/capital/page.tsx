import type { Metadata } from "next";
import { CapitalWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Portfolio / KMFX Edge",
  description: "Revisa capital, cuentas fondeadas y asignación operativa en KMFX Edge.",
};

export default function CapitalPage() {
  return <CapitalWorkspaceRoute />;
}
