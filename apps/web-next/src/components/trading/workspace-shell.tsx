"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CreditCard,
  ExternalLink,
  LogOut,
  Settings2,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import { CommandPalette } from "@/components/uitripled/command-palette-shadcnui";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { getAccountsOverview } from "@/lib/domain/accounts-selectors";
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

type PromoNotification = {
  id: string;
  partnerLabel: string;
  badge: string;
  title: string;
  body: string;
  actionLabel: string;
  code?: string;
  href?: string;
};

const LOCATION_SEARCH_CHANGE_EVENT = "kmfx-location-search-change";
const ORION_FUNDED_REFERRAL_URL =
  process.env.NEXT_PUBLIC_ORION_FUNDED_REFERRAL_URL ??
  "https://shop.orionfunded.com/?ref=10578";
const DARWINEX_ZERO_REFERRAL_URL =
  process.env.NEXT_PUBLIC_DARWINEX_ZERO_REFERRAL_URL ??
  "https://www.darwinexzero.com/";

let historyPatchReferenceCount = 0;
let restoreHistoryPatch: (() => void) | null = null;

function getLocationSearchSnapshot() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function retainHistoryPatch() {
  if (typeof window === "undefined") {
    return () => {};
  }

  historyPatchReferenceCount += 1;

  if (!restoreHistoryPatch) {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const notifySearchChange = () => {
      queueMicrotask(() => {
        window.dispatchEvent(new Event(LOCATION_SEARCH_CHANGE_EVENT));
      });
    };

    window.history.pushState = function pushState(...args) {
      const result = originalPushState.apply(window.history, args);
      notifySearchChange();
      return result;
    };
    window.history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(window.history, args);
      notifySearchChange();
      return result;
    };

    restoreHistoryPatch = () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }

  return () => {
    historyPatchReferenceCount = Math.max(0, historyPatchReferenceCount - 1);

    if (historyPatchReferenceCount === 0 && restoreHistoryPatch) {
      restoreHistoryPatch();
      restoreHistoryPatch = null;
    }
  };
}

function subscribeLocationSearch(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const releaseHistoryPatch = retainHistoryPatch();
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(LOCATION_SEARCH_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(LOCATION_SEARCH_CHANGE_EVENT, onStoreChange);
    releaseHistoryPatch();
  };
}

function useLocationSearchParams() {
  const search = React.useSyncExternalStore(
    subscribeLocationSearch,
    getLocationSearchSnapshot,
    () => "",
  );

  return React.useMemo(() => new URLSearchParams(search), [search]);
}

function getPromoNotifications(): PromoNotification[] {
  return [
    {
      id: "orion-funded-discount",
      partnerLabel: "Orion Funded",
      badge: "15%",
      title: "15% en Orion Funded",
      body: "Abre el enlace de referido y usa el código KMFX antes de contratar el reto.",
      actionLabel: "Abrir enlace",
      code: "KMFX",
      href: ORION_FUNDED_REFERRAL_URL,
    },
    {
      id: "darwinex-zero-referral",
      partnerLabel: "Darwinex Zero",
      badge: "Referido",
      title: "Descuento Darwinex Zero",
      body: "Accede desde el enlace de referido para revisar el descuento disponible.",
      actionLabel: "Abrir enlace",
      href: DARWINEX_ZERO_REFERRAL_URL,
    },
  ];
}

function getNavBadge(
  href: string | undefined,
  item: NavigationItem,
  workspace: WorkspaceState,
) {
  if (!item.enabled) return item.badge ?? "Próximamente";
  if (!href) return item.badge;

  if (href === "/dashboard") return "Activo";
  if (href === "/accounts") return String(getAccountsOverview(workspace).totalCount);
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

function NavigationGroupMenu({
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

function CloseMobileSidebarOnRouteChange() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  React.useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, pathname, setOpenMobile]);

  return null;
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
  searchParams,
}: {
  workspace: WorkspaceState;
  activeAccount: WorkspaceState["accounts"][number] | undefined;
  searchParams: URLSearchParams;
}) {
  const pathname = usePathname();
  const router = useRouter();

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
              onClick={(event) => {
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
  const router = useRouter();
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
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <UserRound data-icon="inline-start" />
                Perfil y preferencias
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/accounts")}>
                <WalletCards data-icon="inline-start" />
                Cuentas conectadas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/subscription")}>
                <CreditCard data-icon="inline-start" />
                Suscripción y plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings2 data-icon="inline-start" />
                Ajustes generales
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <form action="/auth/signout" method="post">
                <DropdownMenuItem
                  nativeButton
                  render={<button aria-label="Cerrar sesión" type="submit" />}
                  className="w-full font-medium !text-red-500 focus:!bg-red-500/10 focus:!text-red-500 dark:!text-red-400 dark:focus:!bg-red-400/10 dark:focus:!text-red-400 [&_svg]:!text-red-500 dark:[&_svg]:!text-red-400"
                  variant="destructive"
                >
                  <LogOut data-icon="inline-start" />
                  Cerrar sesión
                </DropdownMenuItem>
              </form>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function PromoActionButton({
  promo,
  size = "sm",
}: {
  promo: PromoNotification;
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = React.useState(false);

  function copyPromoCode() {
    if (!promo.code) return;
    void navigator.clipboard?.writeText(promo.code);
    setCopied(true);
  }

  if (promo.href) {
    return (
      <>
        <Button
          nativeButton={false}
          size={size}
          variant="outline"
          className="h-8 flex-1 justify-between bg-background/35 px-2 text-xs"
          render={
            <a
              href={promo.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`${promo.actionLabel}: ${promo.title}`}
            />
          }
        >
          <span>{promo.actionLabel}</span>
          <ExternalLink data-icon="inline-end" />
        </Button>
        {promo.code ? (
          <Button
            size={size}
            variant="outline"
            className="h-8 shrink-0 bg-background/35 px-2 text-xs"
            onClick={copyPromoCode}
          >
            {copied ? "Copiado" : promo.code}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <Button
      size={size}
      variant="outline"
      className="h-8 justify-between bg-background/35 px-2 text-xs"
      onClick={copyPromoCode}
    >
      <span>{copied ? "Copiado" : promo.code ?? promo.actionLabel}</span>
      <ExternalLink data-icon="inline-end" />
    </Button>
  );
}

function SidebarFundingPromo({
  activePromo,
  remainingCount,
  onDismiss,
}: {
  activePromo: PromoNotification | undefined;
  remainingCount: number;
  onDismiss: (promoId: string) => void;
}) {
  const { open } = useSidebar();

  if (!activePromo) return null;

  if (!open) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip={activePromo.title}
            className="relative justify-center border border-sidebar-border/70 bg-sidebar-accent/60 text-sidebar-foreground"
          >
            <Bell />
            <span className="sr-only">{activePromo.title}</span>
            <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      <div className="rounded-lg border border-sidebar-border/70 bg-sidebar-accent/55 p-3 text-sidebar-foreground shadow-[0_18px_44px_-34px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline" className="border-sidebar-border bg-background/35 text-sidebar-foreground">
              {activePromo.badge}
            </Badge>
            <span className="truncate text-xs font-medium text-sidebar-foreground/70">
              {activePromo.partnerLabel}
            </span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Ocultar promoción"
            className="-mr-1 -mt-1 text-sidebar-foreground/55 hover:text-sidebar-foreground"
            onClick={() => onDismiss(activePromo.id)}
          >
            <X data-icon="inline-start" />
          </Button>
        </div>
        <div className="mt-3">
          <p className="text-sm font-semibold leading-5 text-sidebar-foreground">
            {activePromo.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-sidebar-foreground/68">
            {activePromo.body}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <PromoActionButton promo={activePromo} />
          {remainingCount > 1 ? (
            <span className="text-[11px] font-medium text-sidebar-foreground/55">
              +{remainingCount - 1}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TopbarNotifications({
  dismissedPromoIds,
  notifications,
  onDismiss,
  onRestore,
}: {
  dismissedPromoIds: string[];
  notifications: PromoNotification[];
  onDismiss: (promoId: string) => void;
  onRestore: (promoId: string) => void;
}) {
  const visibleCount = notifications.filter(
    (promo) => !dismissedPromoIds.includes(promo.id),
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="relative"
            variant="outline"
            size="icon"
            aria-label="Notificaciones"
          />
        }
      >
        <Bell data-icon="inline-start" />
        {notifications.length ? (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {notifications.length}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-1 pb-2 pt-1">
            Notificaciones
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <div className="flex flex-col gap-2">
          {notifications.map((promo) => {
            const dismissed = dismissedPromoIds.includes(promo.id);

            return (
              <div
                key={promo.id}
                className="rounded-lg border border-border/70 bg-card/75 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline">{promo.badge}</Badge>
                      <span className="truncate text-xs font-medium text-muted-foreground">
                        {promo.partnerLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {promo.title}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {dismissed ? "Guardada" : "Sidebar"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {promo.body}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <PromoActionButton promo={promo} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() =>
                      dismissed ? onRestore(promo.id) : onDismiss(promo.id)
                    }
                  >
                    {dismissed ? "Mostrar" : "Ocultar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <p className="px-1 pb-1 text-xs leading-5 text-muted-foreground">
          {visibleCount
            ? `${visibleCount} visibles en la cola de la sidebar.`
            : "Todas guardadas para revisar desde aquí."}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceSidebar({
  activePromo,
  onDismissPromo,
  remainingPromoCount,
  selectedAccountId,
  workspace,
}: {
  activePromo: PromoNotification | undefined;
  onDismissPromo: (promoId: string) => void;
  remainingPromoCount: number;
  selectedAccountId: string | null;
  workspace: WorkspaceState;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sidebar
      collapsible="icon"
      className="border-sidebar-border/70 bg-sidebar/95 backdrop-blur-xl"
    >
      <SidebarHeader className="flex h-16 min-h-16 shrink-0 flex-row items-center justify-between gap-2 border-b border-border/70 px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
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
                  <NavigationGroupMenu
                    items={group.items}
                    pathname={pathname}
                    router={router}
                    selectedAccountId={selectedAccountId}
                    workspace={workspace}
                  />
                </SidebarGroupContent>
              </SidebarGroup>
            {index < navigationGroups.length - 1 ? <SidebarSeparator /> : null}
          </React.Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border/70 p-2">
        <SidebarFundingPromo
          activePromo={activePromo}
          remainingCount={remainingPromoCount}
          onDismiss={onDismissPromo}
        />
        <SidebarUserMenu workspace={workspace} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function WorkspaceShell({ children, workspace }: WorkspaceShellProps) {
  const pathname = usePathname();
  const searchParams = useLocationSearchParams();
  const previewMode = searchParams.get("demo") === "1";
  const selectedAccountId =
    searchParams.get("account") ?? workspace.activeAccountId;
  const activeAccount =
    workspace.accounts.find((account) => account.id === selectedAccountId) ??
    workspace.accounts[0];
  const promoNotifications = React.useMemo(
    () => getPromoNotifications(),
    [],
  );
  const [dismissedPromoIds, setDismissedPromoIds] = React.useState<string[]>([]);
  const activePromo = promoNotifications.find(
    (promo) => !dismissedPromoIds.includes(promo.id),
  );
  const remainingPromoCount = promoNotifications.filter(
    (promo) => !dismissedPromoIds.includes(promo.id),
  ).length;

  function dismissPromo(promoId: string) {
    setDismissedPromoIds((current) =>
      current.includes(promoId) ? current : [...current, promoId],
    );
  }

  function restorePromo(promoId: string) {
    setDismissedPromoIds((current) => current.filter((id) => id !== promoId));
  }

  return (
    <SidebarProvider defaultOpen>
      <CloseMobileSidebarOnRouteChange />
      <WorkspaceSidebar
        activePromo={activePromo}
        onDismissPromo={dismissPromo}
        remainingPromoCount={remainingPromoCount}
        selectedAccountId={selectedAccountId}
        workspace={workspace}
      />
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
            <TopbarNotifications
              dismissedPromoIds={dismissedPromoIds}
              notifications={promoNotifications}
              onDismiss={dismissPromo}
              onRestore={restorePromo}
            />
            <ThemeSwitcher />
            <div className="hidden lg:block">
              <AccountSwitcher
                workspace={workspace}
                activeAccount={activeAccount}
                searchParams={searchParams}
              />
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
