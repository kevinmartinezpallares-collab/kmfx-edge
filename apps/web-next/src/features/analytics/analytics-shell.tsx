import Link from "next/link";

import { AuthorityNotice } from "@/components/domain/authority-notice";
import { MetricCard } from "@/components/domain/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { cn } from "@/lib/utils";

type AnalyticsTab = "summary" | "daily" | "hourly" | "risk";

type AnalyticsShellProps = {
  currentTab: AnalyticsTab;
  analytics: WorkspaceState["analytics"];
};

const tabItems: Array<{
  key: AnalyticsTab;
  label: string;
  href: string;
  body: string;
}> = [
  {
    key: "summary",
    label: "Resumen",
    href: "/analytics",
    body: "Vista resumen en solo lectura con las señales principales de rendimiento.",
  },
  {
    key: "daily",
    label: "Día",
    href: "/analytics/daily",
    body: "Lectura diaria tipada, confianza por datos y revisión compacta de sesión.",
  },
  {
    key: "hourly",
    label: "Horario",
    href: "/analytics/hourly",
    body: "Rendimiento por hora y sesión sobre trades agrupados reales.",
  },
  {
    key: "risk",
    label: "Riesgo",
    href: "/analytics/risk",
    body: "Enlace semántico entre métricas analíticas y lectura de riesgo validada.",
  },
];

export function AnalyticsShell({ currentTab, analytics }: AnalyticsShellProps) {
  const activeTab =
    tabItems.find((tab) => tab.key === currentTab) ?? tabItems[0];

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {analytics.summary.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            note={metric.note}
            tone="info"
          />
        ))}
      </div>
      <Card className="rounded-[2rem] border-border/70 bg-card/90 shadow-none">
        <CardHeader className="gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-medium text-foreground">
              Navegación de Insights
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              Lecturas separadas por rendimiento, día, horario y riesgo para revisar la operativa sin mezclar señales.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabItems.map((tab) => {
              const active = tab.key === activeTab.key;
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={cn(
                    "rounded-2xl border px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-border bg-background text-foreground"
                      : "border-border/70 bg-card/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          <AuthorityNotice title={`${activeTab.label} view`} body={activeTab.body} />
        </CardContent>
      </Card>
    </section>
  );
}
