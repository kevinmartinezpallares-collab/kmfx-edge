import type { Metadata } from "next";
import { AccountsWorkspaceRoute } from "@/components/trading/workspace-routes";

export const metadata: Metadata = {
  title: "Cuentas / KMFX Edge",
  description: "Gestiona cuentas conectadas, snapshots MT5 y estado operativo en KMFX Edge.",
};

export default function AccountsPage() {
  return <AccountsWorkspaceRoute />;
}
