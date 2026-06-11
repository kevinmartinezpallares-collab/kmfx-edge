"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/components/trading/workspace-context";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

type WorkspaceRouteProps = {
  workspace: WorkspaceState;
};

function WorkspaceRouteFallback() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-[28rem] rounded-[2rem]" />
    </div>
  );
}

const DashboardRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/mesa-dashboard").then(
      (module) => module.MesaDashboard,
    ),
  { loading: WorkspaceRouteFallback },
);

const AccountsRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/accounts/reference-section").then(
      (module) => module.AccountsReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const CapitalRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/capital/reference-section").then(
      (module) => module.CapitalReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const TradesRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/trades/reference-section").then(
      (module) => module.TradesReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const CalendarRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/calendar/reference-section").then(
      (module) => module.CalendarReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const AnalyticsOverviewRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/analytics/reference-sections").then(
      (module) => module.AnalyticsOverviewSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const AnalyticsDailyRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/analytics/reference-sections").then(
      (module) => module.AnalyticsDailyReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const AnalyticsHourlyRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/analytics/reference-sections").then(
      (module) => module.AnalyticsHourlyReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const AnalyticsRiskRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/analytics/reference-sections").then(
      (module) => module.AnalyticsRiskReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const SettingsRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/settings/reference-sections").then(
      (module) => module.SettingsReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const CalculatorRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/system/reference-sections").then(
      (module) => module.CalculatorReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const StudyRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/system/reference-sections").then(
      (module) => module.StudyReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

const NotesRouteView = dynamic<WorkspaceRouteProps>(
  () =>
    import("@/components/trading/notes/reference-section").then(
      (module) => module.NotesReferenceSection,
    ),
  { loading: WorkspaceRouteFallback },
);

export function DashboardWorkspaceRoute() {
  return <DashboardRouteView workspace={useWorkspace()} />;
}

export function AccountsWorkspaceRoute() {
  return <AccountsRouteView workspace={useWorkspace()} />;
}

export function CapitalWorkspaceRoute() {
  return <CapitalRouteView workspace={useWorkspace()} />;
}

export function TradesWorkspaceRoute() {
  return <TradesRouteView workspace={useWorkspace()} />;
}

export function CalendarWorkspaceRoute() {
  return <CalendarRouteView workspace={useWorkspace()} />;
}

export function AnalyticsWorkspaceRoute() {
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsOverviewRouteView workspace={useWorkspace()} />
    </div>
  );
}

export function AnalyticsDailyWorkspaceRoute() {
  return <AnalyticsDailyRouteView workspace={useWorkspace()} />;
}

export function AnalyticsHourlyWorkspaceRoute() {
  return <AnalyticsHourlyRouteView workspace={useWorkspace()} />;
}

export function AnalyticsRiskWorkspaceRoute() {
  return <AnalyticsRiskRouteView workspace={useWorkspace()} />;
}

export function SettingsWorkspaceRoute() {
  return <SettingsRouteView workspace={useWorkspace()} />;
}

export function CalculatorWorkspaceRoute() {
  return <CalculatorRouteView workspace={useWorkspace()} />;
}

export function StudyWorkspaceRoute() {
  return <StudyRouteView workspace={useWorkspace()} />;
}

export function NotesWorkspaceRoute() {
  return <NotesRouteView workspace={useWorkspace()} />;
}
