"use client";

import { AccountsReferenceSection } from "@/components/trading/accounts";
import {
  AnalyticsDailyReferenceSection,
  AnalyticsHourlyReferenceSection,
  AnalyticsOverviewSection,
  AnalyticsRiskReferenceSection,
} from "@/components/trading/analytics";
import { CalendarReferenceSection } from "@/components/trading/calendar";
import { CapitalReferenceSection } from "@/components/trading/capital";
import { MesaDashboard } from "@/components/trading/mesa-dashboard";
import { NotesReferenceSection } from "@/components/trading/notes";
import { SettingsReferenceSection } from "@/components/trading/settings";
import {
  CalculatorReferenceSection,
  StudyReferenceSection,
} from "@/components/trading/system";
import { TradesReferenceSection } from "@/components/trading/trades";
import { useWorkspace } from "@/components/trading/workspace-context";

export function DashboardWorkspaceRoute() {
  return <MesaDashboard workspace={useWorkspace()} />;
}

export function AccountsWorkspaceRoute() {
  return <AccountsReferenceSection workspace={useWorkspace()} />;
}

export function CapitalWorkspaceRoute() {
  return <CapitalReferenceSection workspace={useWorkspace()} />;
}

export function TradesWorkspaceRoute() {
  return <TradesReferenceSection workspace={useWorkspace()} />;
}

export function CalendarWorkspaceRoute() {
  return <CalendarReferenceSection workspace={useWorkspace()} />;
}

export function AnalyticsWorkspaceRoute() {
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsOverviewSection workspace={useWorkspace()} />
    </div>
  );
}

export function AnalyticsDailyWorkspaceRoute() {
  return <AnalyticsDailyReferenceSection workspace={useWorkspace()} />;
}

export function AnalyticsHourlyWorkspaceRoute() {
  return <AnalyticsHourlyReferenceSection workspace={useWorkspace()} />;
}

export function AnalyticsRiskWorkspaceRoute() {
  return <AnalyticsRiskReferenceSection workspace={useWorkspace()} />;
}

export function SettingsWorkspaceRoute() {
  return <SettingsReferenceSection workspace={useWorkspace()} />;
}

export function CalculatorWorkspaceRoute() {
  return <CalculatorReferenceSection workspace={useWorkspace()} />;
}

export function StudyWorkspaceRoute() {
  return <StudyReferenceSection workspace={useWorkspace()} />;
}

export function NotesWorkspaceRoute() {
  return <NotesReferenceSection workspace={useWorkspace()} />;
}
