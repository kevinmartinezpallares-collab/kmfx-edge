"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LineChartIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { isNavigationHrefActive, primaryNavigation } from "@/lib/domain/navigation";

type WorkspaceSidebarProps = {
  children: React.ReactNode;
  workspace: WorkspaceState;
};

export function WorkspaceSidebar({
  children,
  workspace,
}: WorkspaceSidebarProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-4 rounded-[1.75rem] border border-sidebar-border/70 bg-sidebar-accent/70 p-4">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
              <LineChartIcon className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-semibold text-sidebar-foreground">
                KMFX Edge
              </p>
              <p className="truncate text-lg text-sidebar-foreground/65">
                {workspace.meta.sourceLabel}
              </p>
            </div>
          </div>
          <div className="md:hidden">
            <SidebarTrigger />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Operativa</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryNavigation.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    {item.enabled && item.href ? (
                      <SidebarMenuButton
                        isActive={isNavigationHrefActive(pathname, item.href)}
                        tooltip={item.title}
                        className="h-14 rounded-2xl text-xl"
                        render={
                          <Link href={item.href} className="contents">
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        }
                      />
                    ) : (
                      <>
                        <SidebarMenuButton
                          disabled
                          tooltip={`${item.title} próximamente`}
                          className="h-14 rounded-2xl text-xl text-sidebar-foreground/35 opacity-100"
                        >
                          <item.icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                        {item.badge ? (
                          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                        ) : null}
                      </>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Estado</SidebarGroupLabel>
            <SidebarGroupContent className="flex flex-col gap-4 px-2">
              <div className="rounded-2xl border border-sidebar-border/70 bg-background/35 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-sidebar-foreground/70">Datos</span>
                  <span className="font-medium text-sidebar-foreground">18ms</span>
                </div>
                <Progress value={72} className="mt-3 h-2" />
              </div>
              <div className="rounded-2xl border border-sidebar-border/70 bg-background/35 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-sidebar-foreground/70">Riesgo usado</span>
                  <span className="font-medium text-sidebar-foreground">42%</span>
                </div>
                <Progress value={42} className="mt-3 h-2" />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <Button
            className="h-14 w-full rounded-2xl text-lg"
            render={<Link href="/accounts" />}
          >
            Ver cuentas
          </Button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
