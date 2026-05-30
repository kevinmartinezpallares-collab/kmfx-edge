"use client";

import { usePathname } from "next/navigation";
import { BellIcon, ChevronDownIcon, SearchIcon } from "lucide-react";

import { CommandEntry } from "@/components/app/command-entry";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { RiskStatusBadge } from "@/components/domain/risk-status-badge";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { getAccountContextOverview } from "@/lib/domain/account-context";
import { resolveRouteTitle } from "@/lib/domain/navigation";

type WorkspaceTopbarProps = {
  workspace: WorkspaceState;
};

export function WorkspaceTopbar({ workspace }: WorkspaceTopbarProps) {
  const pathname = usePathname();
  const title = resolveRouteTitle(pathname);
  const accountContext = getAccountContextOverview(workspace);

  return (
    <header className="sticky top-0 z-30 flex min-h-20 items-center gap-4 border-b border-border/70 bg-background/86 px-4 backdrop-blur-xl md:px-6">
      <SidebarTrigger
        aria-label="Abrir navegación"
        className="flex size-11 rounded-2xl border border-border/70 bg-card text-foreground shadow-sm md:hidden"
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>KMFX Edge</span>
          <span className="text-primary">/</span>
          <span>{title}</span>
        </div>
        <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
      </div>
      <div className="ml-auto hidden items-center gap-3 lg:flex">
        <CommandEntry />
        <Button variant="outline" size="icon-lg" aria-label="Buscar" className="rounded-2xl">
          <SearchIcon data-icon="inline-start" />
        </Button>
        <Button variant="outline" size="icon-lg" aria-label="Notificaciones" className="rounded-2xl">
          <BellIcon data-icon="inline-start" />
        </Button>
        <Button variant="outline" className="h-14 rounded-2xl px-4 text-lg">
          <span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-background text-sm">
            {accountContext.activeInitials}
          </span>
          <span>{accountContext.activeLabel}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
        <RiskStatusBadge status={workspace.risk.status} />
      </div>
    </header>
  );
}
