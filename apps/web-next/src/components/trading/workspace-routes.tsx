"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/components/trading/workspace-context";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

type WorkspaceRouteProps = {
  workspace: WorkspaceState;
};

type WorkspaceRouteShellProps = {
  workspace?: WorkspaceState;
};

function useRouteWorkspace(workspace?: WorkspaceState) {
  const contextWorkspace = useWorkspace();

  return workspace ?? contextWorkspace;
}

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

export function DashboardWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <DashboardRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function AccountsWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <AccountsRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function CapitalWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <CapitalRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function TradesWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <TradesRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function CalendarWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <CalendarRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function AnalyticsWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  const routeWorkspace = useRouteWorkspace(workspace);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsOverviewRouteView workspace={routeWorkspace} />
    </div>
  );
}

export function AnalyticsDailyWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <AnalyticsDailyRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function AnalyticsHourlyWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <AnalyticsHourlyRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function AnalyticsRiskWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <AnalyticsRiskRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function SettingsWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <SettingsRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function CalculatorWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <CalculatorRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function StudyWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <StudyRouteView workspace={useRouteWorkspace(workspace)} />;
}

export function NotesWorkspaceRoute({ workspace }: WorkspaceRouteShellProps = {}) {
  return <NotesRouteView workspace={useRouteWorkspace(workspace)} />;
}
