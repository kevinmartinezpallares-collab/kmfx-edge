import type { LucideIcon } from "lucide-react";
import {
  BarChart3Icon,
  BriefcaseBusinessIcon,
  CalendarDaysIcon,
  CandlestickChartIcon,
  CreditCardIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  NotebookPenIcon,
  ReceiptTextIcon,
  Settings2Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TrendingUpDownIcon,
  WalletCardsIcon,
  WrenchIcon,
} from "lucide-react";

export type NavigationChild = {
  title: string;
  href: string;
  enabled: boolean;
};

export type NavigationItem = {
  title: string;
  href?: string;
  icon: LucideIcon;
  enabled: boolean;
  badge?: string;
  children?: NavigationChild[];
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export type MobileNavigationPriority = "primary" | "secondary" | "lower";

export type RouteAccessLevel = "user" | "admin";

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Operativa",
    items: [
      {
        title: "Panel",
        href: "/dashboard",
        icon: LayoutDashboardIcon,
        enabled: true,
      },
      {
        title: "Cuentas",
        href: "/accounts",
        icon: WalletCardsIcon,
        enabled: true,
      },
      {
        title: "Portfolio",
        href: "/capital",
        icon: LineChartIcon,
        enabled: true,
      },
    ],
  },
  {
    label: "Decisión",
    items: [
      {
        title: "Insights",
        href: "/analytics",
        icon: BarChart3Icon,
        enabled: true,
        children: [
          {
            title: "Resumen",
            href: "/analytics",
            enabled: true,
          },
          {
            title: "Día",
            href: "/analytics/daily",
            enabled: true,
          },
          {
            title: "Horario",
            href: "/analytics/hourly",
            enabled: true,
          },
          {
            title: "Riesgo",
            href: "/analytics/risk",
            enabled: true,
          },
        ],
      },
      {
        title: "Trades",
        href: "/trades",
        icon: ReceiptTextIcon,
        enabled: true,
      },
      {
        title: "Apuntes",
        href: "/notes",
        icon: NotebookPenIcon,
        enabled: true,
      },
      {
        title: "Calendario",
        href: "/calendar",
        icon: CalendarDaysIcon,
        enabled: true,
      },
    ],
  },
  {
    label: "Próximamente",
    items: [
      {
        title: "Mesa de Riesgo",
        href: "/risk",
        icon: ShieldAlertIcon,
        enabled: false,
        badge: "Próximamente",
      },
      {
        title: "Playbooks",
        href: "/strategies",
        icon: BriefcaseBusinessIcon,
        enabled: false,
        badge: "Próximamente",
        children: [
          {
            title: "Backtest vs real",
            href: "/strategies/backtest-vs-real",
            enabled: false,
          },
          {
            title: "Portfolios",
            href: "/strategies/portfolio",
            enabled: false,
          },
        ],
      },
      {
        title: "Prop Firms",
        href: "/funding",
        icon: ShieldCheckIcon,
        enabled: false,
        badge: "Próximamente",
        children: [
          {
            title: "Procesos",
            href: "/funding/journeys",
            enabled: false,
          },
          {
            title: "Cuentas",
            href: "/funding/accounts",
            enabled: false,
          },
          {
            title: "Reglas",
            href: "/funding/rules",
            enabled: false,
          },
          {
            title: "Payouts",
            href: "/funding/payouts",
            enabled: false,
          },
        ],
      },
      {
        title: "Mercado",
        href: "/market",
        icon: CandlestickChartIcon,
        enabled: false,
        badge: "Próximamente",
        children: [
          {
            title: "Noticias",
            href: "/market/economic-calendar",
            enabled: false,
          },
        ],
      },
      {
        title: "Ejecución",
        href: "/execution",
        icon: TrendingUpDownIcon,
        enabled: false,
        badge: "Próximamente",
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        title: "Calculadora",
        href: "/tools/calculator",
        icon: WrenchIcon,
        enabled: true,
        children: [
          {
            title: "Lotaje",
            href: "/tools/calculator",
            enabled: true,
          },
        ],
      },
      {
        title: "Biblioteca",
        href: "/study",
        icon: GraduationCapIcon,
        enabled: true,
      },
      {
        title: "Ajustes",
        href: "/settings",
        icon: Settings2Icon,
        enabled: true,
      },
      {
        title: "Suscripción",
        href: "/subscription",
        icon: CreditCardIcon,
        enabled: true,
      },
    ],
  },
];

export const primaryNavigation: NavigationItem[] = [
  ...navigationGroups[0].items,
  ...navigationGroups[1].items,
];

export const secondaryNavigation: NavigationItem[] = [...navigationGroups[3].items];

export const routeTitles: Record<string, string> = {
  "/dashboard": "Panel",
  "/accounts": "Cuentas",
  "/cuentas": "Cuentas",
  "/risk": "Mesa de Riesgo",
  "/analytics": "Insights",
  "/analytics/daily": "Insights / Día",
  "/analytics/hourly": "Insights / Horario",
  "/analytics/risk": "Insights / Riesgo",
  "/analisis": "Insights",
  "/analisis/daily": "Insights / Día",
  "/analisis/hourly": "Insights / Horario",
  "/analisis/risk": "Insights / Riesgo",
  "/insights": "Insights",
  "/insights/daily": "Insights / Día",
  "/insights/hourly": "Insights / Horario",
  "/insights/risk": "Insights / Riesgo",
  "/trades": "Trades",
  "/operaciones": "Trades",
  "/notes": "Apuntes",
  "/calendar": "Calendario",
  "/calendario": "Calendario",
  "/strategies": "Playbooks",
  "/estrategias": "Playbooks",
  "/strategies/backtest-vs-real": "Playbooks / Backtest vs Real",
  "/strategies/portfolio": "Playbooks / Portfolios",
  "/capital": "Portfolio",
  "/market": "Mercado",
  "/market/economic-calendar": "Mercado / Noticias",
  "/execution": "Ejecución",
  "/ejecucion": "Ejecución",
  "/funding": "Prop Firms",
  "/funding/journeys": "Prop Firms / Procesos",
  "/funding/accounts": "Prop Firms / Cuentas",
  "/funding/rules": "Prop Firms / Reglas",
  "/funding/payouts": "Prop Firms / Payouts",
  "/study": "Biblioteca",
  "/estudio": "Biblioteca",
  "/tools/calculator": "Calculadora / Lotaje",
  "/herramientas": "Calculadora / Lotaje",
  "/settings": "Ajustes",
  "/ajustes": "Ajustes",
  "/subscription": "Suscripción",
  "/settings/subscription": "Suscripción",
  "/debug": "Diagnóstico",
  "/strategy-lab": "Strategy Lab",
};

export const routeDecisionQuestions: Record<string, string> = {
  "/dashboard": "¿Qué pasa ahora en la cuenta activa?",
  "/accounts": "¿Qué cuentas están disponibles y cuáles requieren revisión?",
  "/cuentas": "¿Qué cuentas están disponibles y cuáles requieren revisión?",
  "/capital": "¿Dónde está el capital y qué cuenta aporta más al resultado?",
  "/analytics": "¿Qué está funcionando y qué debo revisar antes de subir riesgo?",
  "/analytics/daily": "¿Qué días explican el resultado y cuáles debo revisar?",
  "/analytics/hourly": "¿Qué horarios conviene operar o evitar?",
  "/analytics/risk": "¿Qué patrón de riesgo está afectando la operativa?",
  "/analisis": "¿Qué está funcionando y qué debo revisar antes de subir riesgo?",
  "/analisis/daily": "¿Qué días explican el resultado y cuáles debo revisar?",
  "/analisis/hourly": "¿Qué horarios conviene operar o evitar?",
  "/analisis/risk": "¿Qué patrón de riesgo está afectando la operativa?",
  "/insights": "¿Qué está funcionando y qué debo revisar antes de subir riesgo?",
  "/insights/daily": "¿Qué días explican el resultado y cuáles debo revisar?",
  "/insights/hourly": "¿Qué horarios conviene operar o evitar?",
  "/insights/risk": "¿Qué patrón de riesgo está afectando la operativa?",
  "/trades": "¿Qué operaciones explican el resultado reciente?",
  "/operaciones": "¿Qué operaciones explican el resultado reciente?",
  "/notes": "¿Qué aprendizaje operativo debo recordar antes de la siguiente sesión?",
  "/calendar": "¿Cómo evoluciona el resultado por día, semana y mes?",
  "/calendario": "¿Cómo evoluciona el resultado por día, semana y mes?",
  "/tools/calculator": "¿Qué lotaje corresponde al riesgo definido?",
  "/herramientas": "¿Qué lotaje corresponde al riesgo definido?",
  "/study": "¿Qué significa cada métrica y cómo se interpreta?",
  "/estudio": "¿Qué significa cada métrica y cómo se interpreta?",
  "/settings": "¿Qué configuración está activa y qué queda pendiente?",
  "/ajustes": "¿Qué configuración está activa y qué queda pendiente?",
  "/subscription": "¿Qué plan está activo y qué límites aplica?",
  "/settings/subscription": "¿Qué plan está activo y qué límites aplica?",
};

export const mobileRoutePriorities: Record<string, MobileNavigationPriority> = {
  "/dashboard": "primary",
  "/risk": "primary",
  "/accounts": "primary",
  "/analytics": "secondary",
  "/insights": "secondary",
  "/trades": "secondary",
  "/notes": "secondary",
  "/calendar": "secondary",
  "/capital": "secondary",
  "/market": "secondary",
  "/execution": "secondary",
  "/strategies": "lower",
  "/funding": "lower",
  "/study": "lower",
  "/tools/calculator": "lower",
  "/settings": "lower",
  "/subscription": "lower",
  "/settings/subscription": "lower",
  "/debug": "lower",
  "/strategy-lab": "lower",
};

export const routeAccessLevels: Record<string, RouteAccessLevel> = {
  "/debug": "admin",
  "/strategy-lab": "admin",
};

const mobileRouteOrder = [
  "/dashboard",
  "/risk",
  "/accounts",
  "/analytics",
  "/trades",
  "/notes",
  "/calendar",
  "/capital",
  "/market",
  "/execution",
  "/funding",
  "/study",
  "/tools/calculator",
  "/settings",
  "/subscription",
  "/settings/subscription",
  "/debug",
  "/strategy-lab",
  "/strategies",
];

const routeAliases: Record<string, string> = {
  "/ajustes": "/settings",
  "/analisis": "/analytics",
  "/analisis/daily": "/analytics/daily",
  "/analisis/hourly": "/analytics/hourly",
  "/analisis/risk": "/analytics/risk",
  "/calendario": "/calendar",
  "/cuentas": "/accounts",
  "/ejecucion": "/execution",
  "/estudio": "/study",
  "/estrategias": "/strategies",
  "/herramientas": "/tools/calculator",
  "/insights": "/analytics",
  "/insights/daily": "/analytics/daily",
  "/insights/hourly": "/analytics/hourly",
  "/insights/risk": "/analytics/risk",
  "/operaciones": "/trades",
};

function resolveCanonicalPathname(pathname: string) {
  const alias = Object.keys(routeAliases)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .toSorted((a, b) => b.length - a.length)[0];

  return alias ? `${routeAliases[alias]}${pathname.slice(alias.length)}` : pathname;
}

function normalizePathname(pathname: string) {
  const [pathWithoutQuery] = pathname.split(/[?#]/);
  const normalized = pathWithoutQuery && pathWithoutQuery !== "/"
    ? pathWithoutQuery.replace(/\/+$/, "")
    : "/";

  return resolveCanonicalPathname(normalized || "/");
}

export function isNavigationHrefActive(pathname: string, href: string) {
  const current = normalizePathname(pathname);
  const target = normalizePathname(href);

  return current === target || current.startsWith(`${target}/`);
}

export function resolveRouteTitle(pathname: string) {
  const current = normalizePathname(pathname);
  const exact = routeTitles[current];
  if (exact) return exact;

  const parentRoute = Object.keys(routeTitles)
    .filter((href) => current.startsWith(`${normalizePathname(href)}/`))
    .toSorted((a, b) => b.length - a.length)[0];

  return parentRoute ? routeTitles[parentRoute] : "Panel";
}

export function getRouteAccessLevel(pathname: string): RouteAccessLevel {
  const current = normalizePathname(pathname);
  const matchedRoute = Object.keys(routeAccessLevels)
    .filter((href) => current === href || current.startsWith(`${normalizePathname(href)}/`))
    .toSorted((a, b) => b.length - a.length)[0];

  return matchedRoute ? routeAccessLevels[matchedRoute] : "user";
}

export function getMobileNavigationPlan() {
  const topLevelItems = navigationGroups.flatMap((group) => group.items);
  const sortByMobileOrder = (a: NavigationItem, b: NavigationItem) => {
    const aIndex = a.href ? mobileRouteOrder.indexOf(a.href) : Number.MAX_SAFE_INTEGER;
    const bIndex = b.href ? mobileRouteOrder.indexOf(b.href) : Number.MAX_SAFE_INTEGER;

    return aIndex - bIndex;
  };

  return {
    primary: topLevelItems.filter(
      (item) => item.enabled && item.href && mobileRoutePriorities[item.href] === "primary",
    ).toSorted(sortByMobileOrder),
    secondary: topLevelItems.filter(
      (item) => item.enabled && item.href && mobileRoutePriorities[item.href] === "secondary",
    ).toSorted(sortByMobileOrder),
    lower: topLevelItems.filter(
      (item) => item.enabled && (!item.href || mobileRoutePriorities[item.href] === "lower"),
    ).toSorted(sortByMobileOrder),
  };
}
