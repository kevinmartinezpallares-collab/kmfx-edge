import { WorkspaceShell } from "@/components/trading/workspace-shell";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const workspace = await getWorkspaceState();

  return <WorkspaceShell workspace={workspace}>{children}</WorkspaceShell>;
}
