import { WorkspaceShell } from "@/components/trading/workspace-shell";
import { getWorkspaceStateForSearchParams } from "@/lib/data/workspace-source";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const workspace = await getWorkspaceStateForSearchParams();

  return <WorkspaceShell workspace={workspace}>{children}</WorkspaceShell>;
}
