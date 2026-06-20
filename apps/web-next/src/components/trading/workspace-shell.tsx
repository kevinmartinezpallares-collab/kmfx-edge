"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  BookOpenCheck,
  ChevronDown,
  CreditCard,
  ExternalLink,
  HelpCircle,
  ListChecks,
  LogOut,
  PlugZap,
  Route,
  Settings2,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import { CommandPalette } from "@/components/uitripled/command-palette-shadcnui";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { WorkspaceProvider } from "@/components/trading/workspace-context";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { RiskGuardAlert } from "@/lib/domain/risk-alerts";
import { buildReviewPriorityRows } from "@/lib/domain/review-selectors";
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
const ACTIVE_WORKSPACE_ACCOUNT_COOKIE = "kmfx-active-account";
const PROMO_NOTIFICATIONS_STORAGE_PREFIX = "kmfx-promo-notifications-read";
const DASHBOARD_ONBOARDING_STORAGE_KEY = "kmfx-dashboard-onboarding-v1";
const LIVE_HEALTHY_REFRESH_INTERVAL_MS = 60000;
const LIVE_RECONNECT_REFRESH_INTERVAL_MS = 12000;
const LIVE_RECONNECT_REFRESH_STATES = new Set([
  "error",
  "pending",
  "stale",
  "syncing",
]);
const ORION_FUNDED_REFERRAL_URL =
  process.env.NEXT_PUBLIC_ORION_FUNDED_REFERRAL_URL ??
  "https://shop.orionfunded.com/?ref=10578";
const DARWINEX_ZERO_REFERRAL_URL =
  process.env.NEXT_PUBLIC_DARWINEX_ZERO_REFERRAL_URL ??
  "https://www.darwinexzero.com/?fpr=n1d7v&coupon=KMFX";

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
      badge: "20%+5%",
      title: "20% + 5% en Darwinex Zero",
      body: "20% de descuento en el alta y 5% adicional en planes anuales y trianuales con el cupón KMFX.",
      actionLabel: "Abrir enlace",
      code: "KMFX",
      href: DARWINEX_ZERO_REFERRAL_URL,
    },
  ];
}

function getPromoNotificationsStorageKey(userEmail: string | undefined) {
  const scope = String(userEmail || "anonymous").trim().toLowerCase() || "anonymous";
  return `${PROMO_NOTIFICATIONS_STORAGE_PREFIX}:${scope}`;
}

function parseStoredPromoIds(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function getNavBadge(
  href: string | undefined,
  item: NavigationItem,
  workspace: WorkspaceState,
) {
  if (!item.enabled) return item.badge ?? "Próximamente";
  if (!href) return item.badge;

  const accountsOverview = getAccountsOverview(workspace);

  if (href === "/dashboard") return "Activo";
  if (href === "/accounts") return String(accountsOverview.totalCount);
  if (href === "/capital") {
    return accountsOverview.fundedCount > 0
      ? `${accountsOverview.fundedCount}F`
      : String(accountsOverview.totalCount);
  }
  if (href === "/analytics") return workspace.analytics.currentPeriod;
  if (href === "/trades") {
    return String(countClosedTradeExecutions(workspace.trades));
  }
  if (href === "/notes") {
    const reviewCount = buildReviewPriorityRows(workspace).length;
    return reviewCount > 0 ? String(reviewCount) : item.badge;
  }
  if (href === "/calendar") {
    const activeDays = workspace.analytics.daily.length;
    return activeDays > 0 ? String(activeDays) : item.badge;
  }

  return item.badge;
}

function isHrefActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

function hrefWithActiveAccount(href: string, selectedAccountId: string | null) {
  if (!selectedAccountId) return href;

  const params = new URLSearchParams({ account: selectedAccountId });
  return `${href}?${params.toString()}`;
}

function persistActiveWorkspaceAccount(accountId: string) {
  if (typeof document === "undefined") return;

  const attributes = [
    `${ACTIVE_WORKSPACE_ACCOUNT_COOKIE}=${encodeURIComponent(accountId)}`,
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
  ];
  if (window.location.protocol === "https:") {
    attributes.push("Secure");
  }

  document.cookie = attributes.join("; ");
}

function getWorkspacePrefetchHrefs(
  pathname: string,
  selectedAccountId: string | null,
) {
  const workspaceCoreRoutes = [
    "/dashboard",
    "/accounts",
    "/capital",
    "/trades",
    "/calendar",
    "/analytics",
  ];
  const routeGroups: Record<string, string[]> = {
    "/dashboard": ["/accounts", "/capital", "/trades", "/calendar"],
    "/accounts": ["/dashboard", "/capital", "/subscription"],
    "/capital": ["/dashboard", "/accounts", "/analytics"],
    "/trades": ["/dashboard", "/calendar", "/analytics"],
    "/calendar": ["/dashboard", "/trades", "/analytics/daily"],
    "/analytics": ["/dashboard", "/analytics/daily", "/analytics/hourly"],
    "/analytics/daily": ["/analytics", "/calendar", "/trades"],
    "/analytics/hourly": ["/analytics", "/analytics/daily"],
    "/analytics/risk": ["/analytics", "/dashboard"],
    "/settings": ["/subscription", "/accounts"],
    "/subscription": ["/accounts", "/settings"],
  };
  const baseRoutes = routeGroups[pathname] ?? workspaceCoreRoutes.slice(0, 4);

  return baseRoutes.map((href) =>
    hrefWithActiveAccount(href, selectedAccountId),
  );
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
  const { isMobile, setOpenMobile } = useSidebar();

  function prefetchTo(href: string) {
    router.prefetch(hrefWithActiveAccount(href, selectedAccountId));
  }

  function closeMobileSidebar() {
    if (isMobile) {
      setOpenMobile(false);
    }
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
        const targetHref = href && item.enabled
          ? hrefWithActiveAccount(href, selectedAccountId)
          : undefined;

        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              size="sm"
              isActive={isActive}
              tooltip={item.title}
              render={
                targetHref ? (
                  <Link href={targetHref} prefetch />
                ) : undefined
              }
              aria-disabled={!item.enabled || undefined}
              disabled={!item.enabled}
              tabIndex={!item.enabled ? -1 : undefined}
              className={cn(
                "text-sm",
                !item.enabled &&
                  "text-sidebar-foreground/35 hover:text-sidebar-foreground/35 disabled:opacity-100",
              )}
              onClick={targetHref ? closeMobileSidebar : undefined}
              onFocus={() => {
                if (href && item.enabled) {
                  prefetchTo(href);
                }
              }}
              onPointerEnter={() => {
                if (href && item.enabled) {
                  prefetchTo(href);
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
                  const childTargetHref = child.enabled
                    ? hrefWithActiveAccount(child.href, selectedAccountId)
                    : undefined;
                  return (
                    <SidebarMenuSubItem key={child.href}>
                      <SidebarMenuSubButton
                        isActive={childActive}
                        render={
                          childTargetHref ? (
                            <Link href={childTargetHref} prefetch />
                          ) : undefined
                        }
                        aria-disabled={!child.enabled || undefined}
                        tabIndex={!child.enabled ? -1 : undefined}
                        onClick={childTargetHref ? closeMobileSidebar : undefined}
                        onFocus={() => {
                          if (child.enabled) {
                            prefetchTo(child.href);
                          }
                        }}
                        onPointerEnter={() => {
                          if (child.enabled) {
                            prefetchTo(child.href);
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
      aria-label={sidebarOpen ? "Cerrar navegación" : "Abrir navegación"}
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

function workspaceNeedsLiveReconnectRefresh(workspace: WorkspaceState) {
  return (
    workspace.meta.sourceMode === "live" &&
    workspace.accounts.some((account) =>
      LIVE_RECONNECT_REFRESH_STATES.has(account.connectionState),
    )
  );
}

function LiveReconnectAutoRefresh({ workspace }: { workspace: WorkspaceState }) {
  const router = useRouter();
  const refreshInFlightRef = React.useRef(false);
  const isLiveWorkspace = workspace.meta.sourceMode === "live";
  const needsReconnectRefresh = workspaceNeedsLiveReconnectRefresh(workspace);
  const refreshIntervalMs = needsReconnectRefresh
    ? LIVE_RECONNECT_REFRESH_INTERVAL_MS
    : LIVE_HEALTHY_REFRESH_INTERVAL_MS;

  const refreshWorkspace = React.useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;

    try {
      await fetch("/api/kmfx/accounts/refresh", {
        cache: "no-store",
        method: "POST",
      });
      router.refresh();
    } catch {
      // A reconnect refresh is best-effort; the current snapshot stays usable.
    } finally {
      window.setTimeout(() => {
        refreshInFlightRef.current = false;
      }, 750);
    }
  }, [router]);

  React.useEffect(() => {
    if (!isLiveWorkspace || typeof window === "undefined") {
      return;
    }

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean };
    }).connection;

    if (connection?.saveData && !needsReconnectRefresh) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshWorkspace();
    }, refreshIntervalMs);

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshWorkspace();
      }
    };

    window.addEventListener("focus", refreshWorkspace);
    window.addEventListener("online", refreshWorkspace);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWorkspace);
      window.removeEventListener("online", refreshWorkspace);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isLiveWorkspace, needsReconnectRefresh, refreshIntervalMs, refreshWorkspace]);

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
  if (source.includes("orion") || source.includes("ogm")) {
    return "/brand-logos/orion-funded.jpeg";
  }
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

function getDashboardOnboardingStorageKey(userEmail: string | undefined) {
  const identity = String(userEmail || "anonymous").trim().toLowerCase();
  return `${DASHBOARD_ONBOARDING_STORAGE_KEY}:${identity}`;
}

const dashboardOnboardingSteps = [
  {
    icon: PlugZap,
    title: "Conecta tu cuenta MT5",
    body: "En Cuentas, añade la cuenta que quieres revisar y copia la KMFXKey en el conector. Cuando sincronice, el dashboard deja de usar datos de ejemplo.",
  },
  {
    icon: ListChecks,
    title: "Confirma el punto de partida",
    body: "Revisa balance, equity, servidor, estado de conexión y última sincronización antes de tomar decisiones con la cuenta activa.",
  },
  {
    icon: Route,
    title: "Recorre las vistas clave",
    body: "Panel para lectura rápida, Portfolio para capital, Trades para ejecución, Calendario para contexto e Insights para patrones.",
  },
  {
    icon: BookOpenCheck,
    title: "Cierra el bucle diario",
    body: "Añade notas, revisa alertas y deja marcada la siguiente acción: corregir riesgo, esperar sesión o preparar la próxima operación.",
  },
];

function DashboardOnboardingDialog({
  onOpenChange,
  open,
  selectedAccountId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedAccountId: string | null;
}) {
  const router = useRouter();
  const titleRef = React.useRef<HTMLHeadingElement | null>(null);

  function closeAndNavigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const accountsHref = selectedAccountId
    ? `/accounts?account=${encodeURIComponent(selectedAccountId)}`
    : "/accounts";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100svh-1rem)] overflow-y-auto p-0 sm:max-w-2xl"
        initialFocus={titleRef}
      >
        <DialogHeader className="border-b border-border/70 px-4 pb-4 pt-5 pr-12 sm:px-6 sm:pt-6">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline" className="bg-background">
              Inicio rápido
            </Badge>
            <span className="text-xs font-medium text-muted-foreground">
              Primer recorrido
            </span>
          </div>
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className="text-xl leading-tight outline-none sm:text-2xl"
          >
            Bienvenido a KMFX Edge
          </DialogTitle>
          <DialogDescription className="max-w-xl leading-6">
            Empieza conectando una cuenta y usa este orden para entender el
            dashboard sin perderte entre métricas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-4 py-4 sm:px-6">
          <div className="rounded-lg border border-border/70 bg-muted/35 p-4">
            <p className="text-sm font-medium text-foreground">
              Ruta recomendada para empezar
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              KMFX Edge está pensado para una rutina sencilla: conectar MT5,
              validar que los datos llegan bien, revisar el estado operativo y
              decidir la siguiente acción.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {dashboardOnboardingSteps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-lg border border-border/70 bg-card/70 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                    <step.icon className="size-4 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-primary">
                        Paso {index + 1}
                      </span>
                    </div>
                    <h2 className="mt-1 text-sm font-semibold text-foreground">
                      {step.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none rounded-b-xl px-4 py-3 sm:px-6">
          <DialogClose render={<Button variant="outline" />}>
            Ahora no
          </DialogClose>
          <Button
            variant="outline"
            onClick={() => closeAndNavigate("/dashboard")}
          >
            Ver panel
          </Button>
          <Button onClick={() => closeAndNavigate(accountsHref)}>
            <PlugZap data-icon="inline-start" />
            Conectar cuenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountSwitcher({
  workspace,
  activeAccount,
  searchParams,
  variant = "full",
}: {
  workspace: WorkspaceState;
  activeAccount: WorkspaceState["accounts"][number] | undefined;
  searchParams: URLSearchParams;
  variant?: "full" | "compact";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const compact = variant === "compact";

  function selectAccount(accountId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("account", accountId);
    persistActiveWorkspaceAccount(accountId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    window.setTimeout(() => {
      router.refresh();
    }, 0);
  }

  const accountsHref = activeAccount
    ? `/accounts?account=${encodeURIComponent(activeAccount.id)}`
    : "/accounts";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size={compact ? "icon" : "default"}
            className={cn(
              "min-w-0 rounded-full",
              compact ? "size-11 p-0" : "px-2",
            )}
            aria-label={`Cambiar cuenta: ${activeAccount?.label ?? "Cuenta activa"}`}
          />
        }
      >
        <AccountBrandAvatar account={activeAccount} className="size-6" />
        {compact ? (
          <span className="sr-only">
            {activeAccount?.label ?? "Cuenta activa"}
          </span>
        ) : (
          <>
            <span className="max-w-44 truncate">
              {activeAccount?.label ?? "Cuenta activa"}
            </span>
            <ChevronDown data-icon="inline-end" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(18rem,calc(100vw-2rem))]"
      >
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
          {workspace.accounts.map((account) => (
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
              <span>Mesa de Riesgo</span>
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

function SidebarUserMenu({
  onOpenOnboarding,
  workspace,
}: {
  onOpenOnboarding: () => void;
  workspace: WorkspaceState;
}) {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const profileName = profileNameFromEmail(workspace.meta.userEmail);
  const roleLabel = workspace.meta.userRoleLabel ?? "Usuario";
  const initials = profileInitials(profileName);
  const secondaryLabel = workspace.meta.userEmail ?? roleLabel;
  const profileAvatarUrl = workspace.meta.userAvatarUrl ?? "";

  function navigateTo(pathname: string) {
    if (isMobile) {
      setOpenMobile(false);
    }

    router.push(pathname);
  }

  async function handleSignOut() {
    if (isMobile) {
      setOpenMobile(false);
    }

    try {
      await fetch("/auth/signout", {
        cache: "no-store",
        method: "POST",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

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
              {profileAvatarUrl ? (
                <AvatarImage src={profileAvatarUrl} alt={`Foto de ${profileName}`} />
              ) : null}
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
                    {profileAvatarUrl ? (
                      <AvatarImage src={profileAvatarUrl} alt={`Foto de ${profileName}`} />
                    ) : null}
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
              <DropdownMenuItem onClick={() => navigateTo("/settings")}>
                <UserRound data-icon="inline-start" />
                Perfil y preferencias
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigateTo("/accounts")}>
                <WalletCards data-icon="inline-start" />
                Cuentas conectadas
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                  onOpenOnboarding();
                }}
              >
                <HelpCircle data-icon="inline-start" />
                Ver guía inicial
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigateTo("/subscription")}>
                <CreditCard data-icon="inline-start" />
                Suscripción y plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigateTo("/settings")}>
                <Settings2 data-icon="inline-start" />
                Ajustes generales
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                nativeButton
                render={<button aria-label="Cerrar sesión" type="button" />}
                className="w-full font-medium !text-red-500 focus:!bg-red-500/10 focus:!text-red-500 dark:!text-red-400 dark:focus:!bg-red-400/10 dark:focus:!text-red-400 [&_svg]:!text-red-500 dark:[&_svg]:!text-red-400"
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  void handleSignOut();
                }}
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
  onDismissAll,
  onRestore,
  onRestoreAll,
}: {
  dismissedPromoIds: string[];
  notifications: PromoNotification[];
  onDismiss: (promoId: string) => void;
  onDismissAll: () => void;
  onRestore: (promoId: string) => void;
  onRestoreAll: () => void;
}) {
  const unreadNotifications = notifications.filter(
    (promo) => !dismissedPromoIds.includes(promo.id),
  );
  const readNotifications = notifications.filter((promo) =>
    dismissedPromoIds.includes(promo.id),
  );
  const unreadCount = unreadNotifications.length;
  const hasReadNotifications = readNotifications.length > 0;

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
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between gap-2 px-1 pb-2 pt-1">
            <DropdownMenuLabel className="p-0">
              Notificaciones
            </DropdownMenuLabel>
            {unreadCount ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={onDismissAll}
              >
                Marcar leídas
              </Button>
            ) : hasReadNotifications ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={onRestoreAll}
              >
                Restaurar
              </Button>
            ) : null}
          </div>
        </DropdownMenuGroup>
        <div className="flex flex-col gap-2">
          {(unreadCount ? unreadNotifications : readNotifications).map((promo) => {
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
                    {dismissed ? "Leída" : "Nueva"}
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
                    {dismissed ? "Marcar nueva" : "Marcar leída"}
                  </Button>
                </div>
              </div>
            );
          })}
          {!notifications.length ? (
            <div className="rounded-lg border border-border/70 bg-card/75 p-4 text-sm text-muted-foreground">
              No hay notificaciones.
            </div>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <p className="px-1 pb-1 text-xs leading-5 text-muted-foreground">
          {unreadCount
            ? `${unreadCount} pendientes.`
            : "Todas las notificaciones están leídas."}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type RiskAlertBannerItem = RiskGuardAlert & {
  id: string;
  occurredAt?: string;
};

type WindowWithWebAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type RiskGuardEventResponse = {
  event?: {
    id?: string;
    label?: string;
    reason?: string;
    tone?: RiskGuardAlert["tone"];
    occurred_at?: string;
    occurredAt?: string;
  } | null;
  ok?: boolean;
};

function playRiskGuardAlertSound() {
  if (typeof window === "undefined") return;

  const AudioContextClass =
    window.AudioContext ?? (window as WindowWithWebAudio).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const playTone = () => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.14);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
    window.setTimeout(() => void context.close(), 320);
  };

  if (context.state === "suspended") {
    void context.resume().then(playTone).catch(() => void context.close());
    return;
  }

  playTone();
}

function buildRiskAlertBannerItems(
  demoCase: string | null,
  demoRunId: string | null,
): RiskAlertBannerItem | null {
  if (!demoCase) return null;

  if (demoCase === "max-trades") {
    return {
      id: `demo:riskguard:max-trades:${demoRunId ?? "default"}`,
      tone: "warning",
      label: "Mesa de Riesgo: máximo de operaciones alcanzado",
      reason:
        "Ya se han abierto las operaciones permitidas para esta sesión. Espera al siguiente bloque operativo antes de entrar de nuevo.",
    };
  }

  return {
    id: `demo:riskguard:block-new-trades:${demoRunId ?? "default"}`,
    tone: "danger",
    label: "Mesa de Riesgo: entradas bloqueadas",
    reason:
      "Prueba visual: la política activa no permite abrir más operaciones hasta recuperar margen de riesgo.",
  };
}

function RiskGuardGlobalAlert({
  demoCase,
  demoRunId,
  selectedAccountId,
}: {
  demoCase: string | null;
  demoRunId: string | null;
  selectedAccountId: string | null;
}) {
  const [dismissedAlertIds, setDismissedAlertIds] = React.useState<string[]>([]);
  const [eventAlert, setEventAlert] =
    React.useState<RiskAlertBannerItem | null>(null);
  const soundedAlertIdRef = React.useRef<string | null>(null);
  const mountedAtRef = React.useRef<number | null>(null);
  const seenBackendAlertIdRef = React.useRef<string | null>(null);
  const demoAlert = React.useMemo(
    () => buildRiskAlertBannerItems(demoCase, demoRunId),
    [demoCase, demoRunId],
  );
  const activeAlert =
    demoAlert && !dismissedAlertIds.includes(demoAlert.id)
      ? demoAlert
      : eventAlert && !dismissedAlertIds.includes(eventAlert.id)
        ? eventAlert
        : null;
  const riskHref = selectedAccountId
    ? `/risk?demo=1&account=${encodeURIComponent(selectedAccountId)}`
    : "/risk?demo=1";

  React.useEffect(() => {
    function handleRiskGuardAlert(event: Event) {
      const detail = (event as CustomEvent<Partial<RiskGuardAlert> & {
        id?: string;
      }>).detail;

      if (!detail?.label || !detail.reason) return;

      const id =
        detail.id ??
        `riskguard:${Date.now()}:${detail.tone ?? "warning"}:${detail.label}`;
      setDismissedAlertIds((current) => current.filter((item) => item !== id));
      setEventAlert({
        id,
        tone: detail.tone ?? "warning",
        label: detail.label,
        reason: detail.reason,
      });
    }

    window.addEventListener("kmfx:riskguard-alert", handleRiskGuardAlert);

    return () => {
      window.removeEventListener("kmfx:riskguard-alert", handleRiskGuardAlert);
    };
  }, []);

  React.useEffect(() => {
    if (demoCase || typeof window === "undefined") return;

    let cancelled = false;
    const controller = new AbortController();
    mountedAtRef.current = Date.now();

    async function pollRiskGuardEvent() {
      const query = selectedAccountId
        ? `?accountId=${encodeURIComponent(selectedAccountId)}`
        : "";

      try {
        const response = await fetch(`/api/kmfx/riskguard/events${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as RiskGuardEventResponse;
        const event = payload.event;
        const id = event?.id?.trim();
        const label = event?.label?.trim();
        const reason = event?.reason?.trim();

        if (cancelled || !event || !id || !label || !reason) return;
        if (seenBackendAlertIdRef.current === id) return;

        const occurredAt = event.occurred_at ?? event.occurredAt;
        const occurredAtMs = Date.parse(String(occurredAt || ""));
        seenBackendAlertIdRef.current = id;

        const mountedAt = mountedAtRef.current ?? Date.now();
        if (Number.isFinite(occurredAtMs) && occurredAtMs < mountedAt - 5000) {
          return;
        }

        setDismissedAlertIds((current) => current.filter((item) => item !== id));
        setEventAlert({
          id,
          tone: event.tone ?? "warning",
          label,
          reason,
          occurredAt,
        });
      } catch {
        // RiskGuard alerts are best-effort; the dashboard must stay quiet on transient polling errors.
      }
    }

    void pollRiskGuardEvent();
    const interval = window.setInterval(() => {
      void pollRiskGuardEvent();
    }, 5000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [demoCase, selectedAccountId]);

  React.useEffect(() => {
    if (!activeAlert) return;
    if (soundedAlertIdRef.current === activeAlert.id) return;

    soundedAlertIdRef.current = activeAlert.id;
    playRiskGuardAlertSound();
  }, [activeAlert]);

  if (!activeAlert) return null;

  const isDanger = activeAlert.tone === "danger";

  return (
    <div className="pointer-events-none absolute left-4 right-4 top-20 z-40 md:left-6 md:right-6">
      <Alert
        variant={isDanger ? "destructive" : "default"}
        className="pointer-events-auto mx-auto max-w-3xl pr-14 shadow-[0_20px_64px_-42px_rgba(0,0,0,0.85)] sm:pr-36"
      >
        <AlertTriangle />
        <AlertTitle>{activeAlert.label}</AlertTitle>
        <AlertDescription className="pr-2">
          {activeAlert.reason}
        </AlertDescription>
        <AlertAction className="flex items-center gap-1">
          {!demoCase ? (
            <Button
              nativeButton={false}
              render={<Link href={riskHref} />}
              className="hidden sm:inline-flex"
              size="sm"
              variant="outline"
            >
              Ver riesgo
            </Button>
          ) : null}
          <Button
            aria-label="Ocultar aviso de Mesa de Riesgo"
            onClick={() =>
              setDismissedAlertIds((current) => [...current, activeAlert.id])
            }
            size="icon-sm"
            variant="ghost"
          >
            <X data-icon="inline-start" />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}

function WorkspaceSidebar({
  activePromo,
  onDismissPromo,
  onOpenOnboarding,
  remainingPromoCount,
  selectedAccountId,
  workspace,
}: {
  activePromo: PromoNotification | undefined;
  onDismissPromo: (promoId: string) => void;
  onOpenOnboarding: () => void;
  remainingPromoCount: number;
  selectedAccountId: string | null;
  workspace: WorkspaceState;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const showUpcomingNavigation = workspace.meta.userRoleLabel === "Administrador";
  const visibleNavigationGroups = React.useMemo(
    () =>
      navigationGroups.filter(
        (group) => showUpcomingNavigation || group.label !== "Próximamente",
      ),
    [showUpcomingNavigation],
  );

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
        {visibleNavigationGroups.map((group, index) => (
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
            {index < visibleNavigationGroups.length - 1 ? <SidebarSeparator /> : null}
          </React.Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border/70 p-2">
        <SidebarFundingPromo
          activePromo={activePromo}
          remainingCount={remainingPromoCount}
          onDismiss={onDismissPromo}
        />
        <SidebarUserMenu
          onOpenOnboarding={onOpenOnboarding}
          workspace={workspace}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function WorkspaceShell({ children, workspace }: WorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useLocationSearchParams();
  const demoMode = searchParams.get("demo");
  const previewMode = demoMode === "1";
  const riskAlertDemoParam = searchParams.get("riskAlertDemo");
  const riskAlertDemoCase =
    riskAlertDemoParam === "1" ? "block-new-trades" : riskAlertDemoParam;
  const riskAlertDemoRunId = searchParams.get("soundTest");
  const selectedAccountId =
    searchParams.get("account") ?? workspace.activeAccountId;
  const activeAccount =
    workspace.accounts.find((account) => account.id === selectedAccountId) ??
    workspace.accounts[0];
  const accountSyncRefreshRef = React.useRef<string | null>(null);
  const selectedWorkspace = React.useMemo(() => {
    if (!selectedAccountId) return workspace;
    if (!workspace.accounts.some((account) => account.id === selectedAccountId)) {
      return workspace;
    }

    return {
      ...workspace,
      activeAccountId: selectedAccountId,
    };
  }, [selectedAccountId, workspace]);

  React.useEffect(() => {
    if (!selectedAccountId || selectedAccountId === workspace.activeAccountId) {
      accountSyncRefreshRef.current = null;
      return;
    }

    if (!workspace.accounts.some((account) => account.id === selectedAccountId)) {
      return;
    }

    persistActiveWorkspaceAccount(selectedAccountId);
    if (accountSyncRefreshRef.current === selectedAccountId) {
      return;
    }

    accountSyncRefreshRef.current = selectedAccountId;
    router.refresh();
  }, [router, selectedAccountId, workspace.accounts, workspace.activeAccountId]);
  const promoNotifications = React.useMemo(
    () => getPromoNotifications(),
    [],
  );
  const [dismissedPromoIds, setDismissedPromoIds] = React.useState<string[]>([]);
  const [dashboardOnboardingOpen, setDashboardOnboardingOpen] = React.useState(false);
  const promoNotificationsStorageKey = React.useMemo(
    () => getPromoNotificationsStorageKey(workspace.meta.userEmail),
    [workspace.meta.userEmail],
  );
  const [loadedPromoNotificationsStorageKey, setLoadedPromoNotificationsStorageKey] =
    React.useState("");
  const activePromo = promoNotifications.find(
    (promo) => !dismissedPromoIds.includes(promo.id),
  );
  const remainingPromoCount = promoNotifications.filter(
    (promo) => !dismissedPromoIds.includes(promo.id),
  ).length;
  const prefetchHrefs = React.useMemo(
    () => getWorkspacePrefetchHrefs(pathname, selectedAccountId),
    [pathname, selectedAccountId],
  );
  const dashboardOnboardingStorageKey = React.useMemo(
    () => getDashboardOnboardingStorageKey(workspace.meta.userEmail),
    [workspace.meta.userEmail],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setLoadedPromoNotificationsStorageKey("");

    try {
      const storedIds = parseStoredPromoIds(
        window.localStorage.getItem(promoNotificationsStorageKey),
      );
      const knownPromoIds = new Set(promoNotifications.map((promo) => promo.id));
      setDismissedPromoIds(storedIds.filter((id) => knownPromoIds.has(id)));
    } catch {
      setDismissedPromoIds([]);
    } finally {
      setLoadedPromoNotificationsStorageKey(promoNotificationsStorageKey);
    }
  }, [promoNotifications, promoNotificationsStorageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (loadedPromoNotificationsStorageKey !== promoNotificationsStorageKey) return;

    try {
      if (dismissedPromoIds.length) {
        window.localStorage.setItem(
          promoNotificationsStorageKey,
          JSON.stringify(dismissedPromoIds),
        );
      } else {
        window.localStorage.removeItem(promoNotificationsStorageKey);
      }
    } catch {
      // Storage can be unavailable in hardened browsers; notifications still work in-session.
    }
  }, [
    dismissedPromoIds,
    loadedPromoNotificationsStorageKey,
    promoNotificationsStorageKey,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (window.localStorage.getItem(dashboardOnboardingStorageKey) === "seen") {
        return;
      }
    } catch {
      return;
    }

    const timer = window.setTimeout(() => {
      setDashboardOnboardingOpen(true);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [dashboardOnboardingStorageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean };
    }).connection;

    if (connection?.saveData) return;

    let cancelled = false;
    const timers: number[] = [];
    const prefetchQueuedRoutes = () => {
      prefetchHrefs.forEach((href, index) => {
        timers.push(
          window.setTimeout(() => {
            if (!cancelled && href !== pathname) {
              router.prefetch(href);
            }
          }, index * 220),
        );
      });
    };
    const scheduleIdle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback.bind(window)
        : null;
    const idleCallback = scheduleIdle
      ? scheduleIdle(prefetchQueuedRoutes, { timeout: 2500 })
      : window.setTimeout(prefetchQueuedRoutes, 1400);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      if (scheduleIdle && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleCallback);
      } else {
        window.clearTimeout(idleCallback);
      }
    };
  }, [pathname, prefetchHrefs, router]);

  function dismissPromo(promoId: string) {
    setDismissedPromoIds((current) =>
      current.includes(promoId) ? current : [...current, promoId],
    );
  }

  function dismissAllPromos() {
    setDismissedPromoIds(promoNotifications.map((promo) => promo.id));
  }

  function restorePromo(promoId: string) {
    setDismissedPromoIds((current) => current.filter((id) => id !== promoId));
  }

  function restoreAllPromos() {
    setDismissedPromoIds([]);
  }

  function setOnboardingSeen() {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(dashboardOnboardingStorageKey, "seen");
    } catch {
      // Storage can be unavailable in hardened browsers; the modal still works.
    }
  }

  function handleDashboardOnboardingOpenChange(open: boolean) {
    setDashboardOnboardingOpen(open);
    if (!open) {
      setOnboardingSeen();
    }
  }

  function openDashboardOnboarding() {
    setDashboardOnboardingOpen(true);
  }

  return (
    <SidebarProvider defaultOpen>
      <CloseMobileSidebarOnRouteChange />
      <LiveReconnectAutoRefresh workspace={selectedWorkspace} />
      <WorkspaceSidebar
        activePromo={activePromo}
        onDismissPromo={dismissPromo}
        onOpenOnboarding={openDashboardOnboarding}
        remainingPromoCount={remainingPromoCount}
        selectedAccountId={selectedAccountId}
        workspace={selectedWorkspace}
      />
      <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden bg-background">
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
              onDismissAll={dismissAllPromos}
              onRestore={restorePromo}
              onRestoreAll={restoreAllPromos}
            />
            <ThemeSwitcher />
            <div className="lg:hidden">
              <AccountSwitcher
                workspace={workspace}
                activeAccount={activeAccount}
                searchParams={searchParams}
                variant="compact"
              />
            </div>
            <div className="hidden lg:block">
              <AccountSwitcher
                workspace={workspace}
                activeAccount={activeAccount}
                searchParams={searchParams}
              />
            </div>
          </div>
        </header>
        <RiskGuardGlobalAlert
          demoCase={riskAlertDemoCase}
          demoRunId={riskAlertDemoRunId}
          selectedAccountId={selectedAccountId}
        />

        <main className="relative min-w-0 overflow-x-hidden">
          <div className="h-[calc(100svh-4rem)] overflow-x-hidden overflow-y-auto">
            <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden p-4 md:p-6">
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
              <WorkspaceProvider workspace={selectedWorkspace}>
                {children}
              </WorkspaceProvider>
            </div>
          </div>
        </main>
      </SidebarInset>
      <DashboardOnboardingDialog
        onOpenChange={handleDashboardOnboardingOpenChange}
        open={dashboardOnboardingOpen}
        selectedAccountId={selectedAccountId}
      />
    </SidebarProvider>
  );
}
