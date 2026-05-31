import { WorkspaceMobileNav } from "@/components/app/workspace-mobile-nav";
import { WorkspaceSidebar } from "@/components/app/workspace-sidebar";
import { WorkspaceStatusStrip } from "@/components/app/workspace-status-strip";
import { WorkspaceTopbar } from "@/components/app/workspace-topbar";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

type AppShellProps = {
  children: React.ReactNode;
  workspace: WorkspaceState;
};

export function AppShell({ children, workspace }: AppShellProps) {
  return (
    <WorkspaceSidebar workspace={workspace}>
      <div className="flex min-h-svh flex-1 flex-col">
        <WorkspaceTopbar workspace={workspace} />
        <div className="flex-1 p-4 md:px-6 md:py-6">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 md:gap-6">
            <WorkspaceStatusStrip workspace={workspace} />
            {children}
          </div>
        </div>
        <WorkspaceMobileNav />
      </div>
    </WorkspaceSidebar>
  );
}
