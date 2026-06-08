import type { ReactNode } from "react";
import {
  BarChart3Icon,
  CalendarDaysIcon,
  LineChartIcon,
  LayoutDashboardIcon,
  WalletCardsIcon,
  ShieldAlertIcon,
  BriefcaseBusinessIcon,
  Settings2Icon,
  WrenchIcon,
  ReceiptTextIcon,
} from "lucide-react";

export type SidebarNavItem = {
  title: string;
  path?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SidebarNavGroup = {
  label: string;
  items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [
  {
    label: "Core loop",
    items: [
      {
        title: "Panel",
        path: "/dashboard",
        icon: <LayoutDashboardIcon />,
      },
      {
        title: "Cuentas",
        path: "/accounts",
        icon: <WalletCardsIcon />,
      },
      {
        title: "Riesgo",
        path: "/risk",
        icon: <ShieldAlertIcon />,
      },
      {
        title: "Insights",
        path: "/analytics",
        icon: <BarChart3Icon />,
      },
      {
        title: "Operaciones",
        path: "/trades",
        icon: <ReceiptTextIcon />,
      },
    ],
  },
  {
    label: "Capas siguientes",
    items: [
      {
        title: "Calendario",
        path: "/calendar",
        icon: <CalendarDaysIcon />,
      },
      {
        title: "Estrategias",
        path: "/strategies",
        icon: <BriefcaseBusinessIcon />,
      },
      {
        title: "Capital",
        path: "/capital",
        icon: <LineChartIcon />,
      },
      {
        title: "Herramientas",
        path: "/tools/calculator",
        icon: <WrenchIcon />,
      },
      {
        title: "Ajustes",
        path: "/settings",
        icon: <Settings2Icon />,
      },
    ],
  },
];

export const navLinks: SidebarNavItem[] = navGroups.flatMap((group) => group.items);
