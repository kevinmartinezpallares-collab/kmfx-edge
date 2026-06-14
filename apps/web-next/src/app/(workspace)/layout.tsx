import { WorkspaceShell } from "@/components/trading/workspace-shell";
import { requestBillingStatusSummary } from "@/lib/api/billing-status";
import { getWorkspaceStateForSearchParams } from "@/lib/data/workspace-source";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [workspace, billingStatus] = await Promise.all([
    getWorkspaceStateForSearchParams(),
    requestBillingStatusSummary(),
  ]);

  return (
    <WorkspaceShell billingStatus={billingStatus} workspace={workspace}>
      {children}
    </WorkspaceShell>
  );
}
