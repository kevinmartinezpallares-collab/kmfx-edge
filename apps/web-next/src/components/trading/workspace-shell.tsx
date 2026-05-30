"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CreditCard,
  ExternalLink,
  LogOut,
  Settings2,
  UserRound,
  WalletCards,
} from "lucide-react";

import { CommandPalette } from "@/components/uitripled/command-palette-shadcnui";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  navigationGroups,
  routeTitles,
  type NavigationItem,
} from "@/lib/domain/navigation";
import { resolveConnectionAccess } from "@/lib/billing/connection-access";
import { countClosedTradeExecutions } from "@/lib/domain/trades-selectors";
import { cn } from "@/lib/utils";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

type WorkspaceShellProps = {
  children: React.ReactNode;
  workspace: WorkspaceState;
};

function getNavBadge(
  href: string | undefined,
  item: NavigationItem,
  workspace: WorkspaceState,
) {
  if (!item.enabled) return item.badge ?? "Próximamente";
  if (!href) return item.badge;

  if (href === "/dashboard") return "Activo";
  if (href === "/accounts") return String(workspace.accounts.length);
  if (href === "/risk") return workspace.risk.status === "safe" ? "OK" : workspace.risk.status;
  if (href === "/analytics") return workspace.analytics.currentPeriod;
  if (href === "/trades") return String(countClosedTradeExecutions(workspace.trades));
  if (href === "/capital") {
    const fundedCount = workspace.accounts.filter((account) => account.isFunded).length;
    return `${fundedCount}F`;
  }
  if (href === "/journal") {
    const reviewQueue = Math.max(0, workspace.accounts.length - 1);
    return String(reviewQueue);
  }
  if (href === "/strategies") {
    const fundedCount = workspace.accounts.filter((account) => account.isFunded).length;
    return String(fundedCount);
  }
  if (href === "/funding") {
    const linkedFunding = workspace.accounts.filter((account) => account.funding).length;
    return linkedFunding > 0 ? String(linkedFunding) : "0";
  }

  return item.badge;
}

function isHrefActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

function renderNavigationGroup({
  items,
  pathname,
  router,
  selectedAccountId,
  workspace,
}: {
  items: NavigationItem[];
  pathname: string;
  router: ReturnType<typeof useRouter>;
  selectedAccountId: string | null;
  workspace: WorkspaceState;
}) {
  function hrefWithActiveAccount(href: string) {
    if (!selectedAccountId) return href;

    const params = new URLSearchParams({ account: selectedAccountId });
    return `${href}?${params.toString()}`;
  }

  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon;
        const href = item.href;
        const hasActiveChild = item.children?.some((child) => isHrefActive(pathname, child.href)) ?? false;
        const isActive = href ? isHrefActive(pathname, href) || hasActiveChild : hasActiveChild;
        const badge = getNavBadge(href, item, workspace);
        const showChildren = Boolean(item.children?.length) && (isActive || pathname === href);

        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              size="sm"
              isActive={isActive}
              tooltip={item.title}
              aria-disabled={!item.enabled || undefined}
              disabled={!item.enabled}
              tabIndex={!item.enabled ? -1 : undefined}
              className={cn(
                "text-sm",
                !item.enabled &&
                  "text-sidebar-foreground/35 hover:text-sidebar-foreground/35 disabled:opacity-100",
              )}
              onClick={() => {
                if (href && item.enabled) {
                  router.push(hrefWithActiveAccount(href));
                }
              }}
            >
              <Icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
            {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
            {showChildren ? (
              <SidebarMenuSub>
                {item.children?.map((child) => {
                  const childActive = isHrefActive(pathname, child.href);
                  return (
                    <SidebarMenuSubItem key={child.href}>
                      <SidebarMenuSubButton
                        isActive={childActive}
                        aria-disabled={!child.enabled || undefined}
                        tabIndex={!child.enabled ? -1 : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          if (child.enabled) {
                            router.push(hrefWithActiveAccount(child.href));
                          }
                        }}
                      >
                        <span>{child.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function SectionTitle({ pathname }: { pathname: string }) {
  const title = routeTitles[pathname] ?? "Panel";

  return (
      <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>KMFX Edge</span>
        <span className="text-primary">/</span>
        <span>{title}</span>
      </div>
      <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
    </div>
  );
}

function ShellTrigger({ place }: { place: "sidebar" | "navbar" }) {
  const { isMobile, open, openMobile } = useSidebar();
  const sidebarOpen = isMobile ? openMobile : open;

  return (
    <SidebarTrigger
      className={cn(
        "transition-opacity duration-200 motion-reduce:transition-none",
        sidebarOpen &&
          place === "navbar" &&
          "pointer-events-none opacity-0",
        !sidebarOpen &&
          place === "sidebar" &&
          "hidden",
      )}
    />
  );
}

function getAccountCompanyName(
  account: WorkspaceState["accounts"][number] | undefined,
) {
  return account?.funding?.firm || account?.broker || account?.label || "KMFX";
}

function getAccountLogoUrl(
  account: WorkspaceState["accounts"][number] | undefined,
) {
  const source = [
    account?.funding?.firm,
    account?.label,
    account?.broker,
    account?.server,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (source.includes("ftmo")) return "/brand-logos/ftmo.png";
  if (source.includes("darwin")) return "/brand-logos/darwinex-zero.webp";
  if (source.includes("orion")) return "/brand-logos/orion-funded.jpeg";
  if (source.includes("funding pips")) return "/brand-logos/the-funding-pips.jpeg";
  if (source.includes("wsf")) return "/brand-logos/wsf.png";
  if (source.includes("5ers") || source.includes("the5ers")) {
    return "/brand-logos/the5ers.png";
  }
  if (source.includes("ic markets") || source.includes("icmarkets")) {
    return "/brand-logos/ic-markets.png";
  }
  if (source.includes("pepperstone")) return "/brand-logos/pepperstone.svg";

  return null;
}

function getAccountInitials(
  account: WorkspaceState["accounts"][number] | undefined,
) {
  return getAccountCompanyName(account)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "KM";
}

function AccountBrandAvatar({
  account,
  className,
}: {
  account: WorkspaceState["accounts"][number] | undefined;
  className?: string;
}) {
  const logoUrl = getAccountLogoUrl(account);
  const companyName = getAccountCompanyName(account);

  return (
    <Avatar className={cn("bg-background", className)}>
      {logoUrl ? (
        <AvatarImage
          src={logoUrl}
          alt={`${companyName} logo`}
          className="object-contain p-0.5"
        />
      ) : null}
      <AvatarFallback>{getAccountInitials(account)}</AvatarFallback>
    </Avatar>
  );
}

function profileNameFromEmail(email: string | undefined) {
  const localPart = String(email || "").split("@")[0]?.trim();
  if (!localPart) return "Usuario KMFX";

  return (
    localPart
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim() || "Usuario KMFX"
  );
}

function profileInitials(displayName: string) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "KM";
}

function AccountSwitcher({
  workspace,
  activeAccount,
}: {
  workspace: WorkspaceState;
  activeAccount: WorkspaceState["accounts"][number] | undefined;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectAccount(accountId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("account", accountId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const accountsHref = activeAccount
    ? `/accounts?account=${encodeURIComponent(activeAccount.id)}`
    : "/accounts";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="min-w-0 rounded-full px-2" />
        }
      >
        <AccountBrandAvatar account={activeAccount} className="size-6" />
        <span className="max-w-44 truncate">
          {activeAccount?.label ?? "Cuenta activa"}
        </span>
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Cuenta activa</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href={accountsHref} />}>
            <div className="flex min-w-0 items-center gap-3">
              <AccountBrandAvatar account={activeAccount} className="size-9" />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {activeAccount?.label ?? "Sin cuenta"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {activeAccount
                    ? `${activeAccount.broker} / ${activeAccount.server}`
                    : "Conecta una cuenta"}
                </p>
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {workspace.accounts.slice(0, 4).map((account) => (
            <DropdownMenuItem
              key={account.id}
              onSelect={(event) => {
                event.preventDefault();
                selectAccount(account.id);
              }}
            >
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <AccountBrandAvatar account={account} className="size-6" />
                  <span className="truncate">{account.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {account.connectionState === "connected"
                    ? "Conectada"
                    : "Revisar"}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <span className="flex flex-1 items-center justify-between gap-3">
              <span>RiskGuard</span>
              <span className="text-xs text-muted-foreground">Próximamente</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/analytics" />}>Insights</DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}>Ajustes</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarUserMenu({ workspace }: { workspace: WorkspaceState }) {
  const { isMobile } = useSidebar();
  const profileName = profileNameFromEmail(workspace.meta.userEmail);
  const roleLabel = workspace.meta.userRoleLabel ?? "Usuario";
  const initials = profileInitials(profileName);
  const secondaryLabel = workspace.meta.userEmail ?? roleLabel;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="size-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{profileName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {secondaryLabel}
              </span>
            </div>
            <ChevronDown data-icon="inline-end" className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
            className="min-w-60 rounded-lg"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-9">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium text-foreground">
                      {profileName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {secondaryLabel}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <UserRound data-icon="inline-start" />
                Perfil y preferencias
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/accounts" />}>
                <WalletCards data-icon="inline-start" />
                Cuentas conectadas
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/subscription" />}>
                <CreditCard data-icon="inline-start" />
                Suscripción y plan
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <Settings2 data-icon="inline-start" />
                Ajustes generales
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href="/auth/signout" />}
                className="font-medium !text-red-500 focus:!bg-red-500/10 focus:!text-red-500 dark:!text-red-400 dark:focus:!bg-red-400/10 dark:focus:!text-red-400 [&_svg]:!text-red-500 dark:[&_svg]:!text-red-400"
                variant="destructive"
              >
                <LogOut data-icon="inline-start" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function WorkspaceSidebar({ workspace }: { workspace: WorkspaceState }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedAccountId = searchParams.get("account");

  return (
    <Sidebar
      collapsible="icon"
      className="border-sidebar-border/70 bg-sidebar/95 backdrop-blur-xl"
    >
      <SidebarHeader className="flex min-h-16 flex-row items-center justify-between gap-2 border-b border-sidebar-border/70 px-3 group-data-[collapsible=icon]:min-h-14 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-3 rounded-xl px-1.5 py-1 transition-colors hover:bg-sidebar-accent/70 group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0"
          aria-label="Ir al panel de KMFX Edge"
        >
          <LogoMark
            className="size-9 rounded-full ring-1 ring-sidebar-border/80 group-data-[collapsible=icon]:size-8"
            priority
            sizes="36px"
          />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <LogoWordmark className="truncate text-sm [&_span:first-child]:text-sidebar-foreground [&_span:last-child]:text-sidebar-foreground/80" />
          </div>
        </Link>
        <ShellTrigger place="sidebar" />
      </SidebarHeader>

      <SidebarContent>
        {navigationGroups.map((group, index) => (
          <React.Fragment key={group.label}>
            <SidebarGroup>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                {renderNavigationGroup({
                  items: group.items,
                  pathname,
                  router,
                  selectedAccountId,
                  workspace,
                })}
              </SidebarGroupContent>
            </SidebarGroup>
            {index < navigationGroups.length - 1 ? <SidebarSeparator /> : null}
          </React.Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border/70 p-2">
        <SidebarUserMenu workspace={workspace} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function WorkspaceShell({ children, workspace }: WorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsValue = searchParams.toString();
  const previewMode = searchParams.get("demo") === "1";
  const selectedAccountId =
    searchParams.get("account") ?? workspace.activeAccountId;
  const activeAccount =
    workspace.accounts.find((account) => account.id === selectedAccountId) ??
    workspace.accounts[0];

  React.useEffect(() => {
    if (pathname === "/subscription" || previewMode) return;

    let cancelled = false;

    async function checkBillingAccess() {
      try {
        const response = await fetch("/api/kmfx/billing/status", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        const access = resolveConnectionAccess(response.ok ? payload : { ok: false });

        if (
          cancelled ||
          access.allowed ||
          access.reason === "auth_required" ||
          access.reason === "billing_status_unavailable"
        ) {
          return;
        }

        const next = `${pathname}${searchParamsValue ? `?${searchParamsValue}` : ""}`;
        const params = new URLSearchParams({
          next,
          welcome: "1",
        });
        router.replace(`/subscription?${params.toString()}`);
      } catch {
        // Keep navigation usable if billing status cannot be checked momentarily.
      }
    }

    void checkBillingAccess();

    return () => {
      cancelled = true;
    };
  }, [pathname, previewMode, router, searchParamsValue]);

  return (
    <SidebarProvider defaultOpen>
      <WorkspaceSidebar workspace={workspace} />
      <SidebarInset className="min-h-svh bg-background">
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_4%,transparent),transparent_320px)]" />
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border/70 bg-background/72 px-4 shadow-[0_14px_50px_-42px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:px-6 dark:bg-background/76">
          <ShellTrigger place="navbar" />
          <SectionTitle pathname={pathname} />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:block">
              <CommandPalette />
            </div>
            <CommandPalette
              variant="icon"
              className="hidden size-9 items-center justify-center rounded-full border border-border/70 bg-card/75 text-foreground/70 shadow-[0_12px_34px_-24px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-colors hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
            />
            <Button
              className="hidden lg:inline-flex"
              variant="outline"
              size="icon"
              aria-label="Notificaciones"
            >
              <Bell data-icon="inline-start" />
            </Button>
            <ThemeSwitcher />
            <div className="hidden lg:block">
              <AccountSwitcher workspace={workspace} activeAccount={activeAccount} />
            </div>
          </div>
        </header>

        <main className="relative">
          <div className="h-[calc(100svh-4rem)] overflow-y-auto">
            <div className="grid gap-4 p-4 md:p-6">
              {previewMode ? (
                <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/85 p-4 shadow-[0_18px_45px_-34px_rgba(0,0,0,0.45)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Vista de ejemplo
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Puedes revisar el panel con datos preparados. Para conectar MT5,
                      añadir cuentas o descargar archivos necesitas un plan activo.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      nativeButton={false}
                      render={<Link href="/subscription?welcome=1" />}
                      size="sm"
                    >
                      <CreditCard data-icon="inline-start" />
                      Activar plan
                    </Button>
                    <Button
                      nativeButton={false}
                      render={<Link href="/subscription?welcome=1" />}
                      size="sm"
                      variant="outline"
                    >
                      <ExternalLink data-icon="inline-start" />
                      Salir
                    </Button>
                  </div>
                </div>
              ) : null}
              {children}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
