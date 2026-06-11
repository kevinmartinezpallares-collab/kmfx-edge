import type { Metadata } from "next";
import { TradesWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Trades / KMFX Edge",
  description: "Revisa operaciones cerradas, resultados y datos de ejecucion.",
};

export default function TradesPage() {
  return <TradesWorkspaceRoute />;
}
