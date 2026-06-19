import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookOpenCheckIcon,
  ClockIcon,
  EyeIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { RiskPolicyConfigurator } from "@/components/trading/risk/policy-configurator";
import type {
  RiskGuardMonitorEvent,
  RiskGuardMonitorMetric,
  RiskGuardMonitorRule,
  RiskGuardMonitorTone,
} from "@/lib/domain/risk-engine";
import { buildRiskGuardMonitor } from "@/lib/domain/risk-engine";
import { getRiskPolicyControls } from "@/lib/domain/risk-policy-selectors";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { cn } from "@/lib/utils";

type RiskGuardMonitorSectionProps = {
  workspace: WorkspaceState;
};

const toneTextClasses: Record<RiskGuardMonitorTone, string> = {
  danger: "text-loss",
  muted: "text-muted-foreground",
  safe: "text-profit",
  warning: "text-risk",
};

const tonePanelClasses: Record<RiskGuardMonitorTone, string> = {
  danger: "border-loss/35 bg-card/70",
  muted: "border-border/70 bg-card/70",
  safe: "border-border/70 bg-card/70",
  warning: "border-risk/35 bg-card/70",
};

const toneMarkerClasses: Record<RiskGuardMonitorTone, string> = {
  danger: "bg-loss",
  muted: "bg-muted-foreground",
  safe: "bg-profit",
  warning: "bg-risk",
};

const riskCardClass = "border-border/70 bg-card/70 shadow-none";

function MetricCard({ metric }: { metric: RiskGuardMonitorMetric }) {
  const compactValue = metric.value.length > 13 || /\s/.test(metric.value);

  return (
    <Card size="sm" className={riskCardClass}>
      <CardHeader>
        <CardTitle className="text-xs text-muted-foreground">{metric.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "font-semibold tracking-normal tabular-nums",
            compactValue ? "text-xl leading-tight" : "font-mono text-2xl",
            toneTextClasses[metric.tone],
          )}
        >
          {metric.value}
        </p>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">{metric.detail}</p>
      </CardContent>
    </Card>
  );
}

function RiskZonePanel({
  barWidth,
  monitor,
}: {
  barWidth: number;
  monitor: ReturnType<typeof buildRiskGuardMonitor>;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Margen diario</p>
          <p className="mt-1 text-xs text-muted-foreground">{monitor.dailyLimitSourceLabel}</p>
        </div>
        <p className={cn("font-mono text-3xl font-semibold tracking-normal tabular-nums", toneTextClasses[monitor.status.tone])}>
          {monitor.dailyUsagePct.toFixed(0)}%
        </p>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border/70 bg-background/45">
        <div className="grid grid-cols-[7fr_2fr_1fr] text-[11px] font-medium text-muted-foreground">
          <div className="border-r border-border/60 px-3 py-2">Operar</div>
          <div className="border-r border-border/60 px-3 py-2">Reducir</div>
          <div className="px-3 py-2">Parar</div>
        </div>
        <div className="relative h-20 border-t border-border/60 bg-background/35">
          <div className="absolute inset-y-0 left-[70%] w-px bg-risk/45" />
          <div className="absolute inset-y-0 left-[90%] w-px bg-loss/45" />
          <div
            className={cn("absolute bottom-0 left-0 top-0", toneMarkerClasses[monitor.status.tone])}
            style={{ width: `${barWidth}%`, opacity: 0.72 }}
          />
          <div className="absolute inset-x-0 bottom-0 h-px bg-border/80" />
        </div>
        <div className="grid grid-cols-3 border-t border-border/60 text-[11px] text-muted-foreground">
          <div className="px-3 py-2">Aviso 70%</div>
          <div className="px-3 py-2 text-center">Crítico 90%</div>
          <div className="px-3 py-2 text-right">Límite 100%</div>
        </div>
      </div>
    </div>
  );
}

function MonitorBoundaryCard({
  monitor,
}: {
  monitor: ReturnType<typeof buildRiskGuardMonitor>;
}) {
  const rows = [
    {
      icon: BookOpenCheckIcon,
      label: "Control",
      text: "El trader mantiene el control operativo.",
      tone: "safe" as RiskGuardMonitorTone,
    },
    {
      icon: ShieldAlertIcon,
      label: "MT5",
      text:
        monitor.terminal.protectionState === "pending"
          ? "Pendiente de confirmación del EA."
          : monitor.terminal.protectionLabel,
      tone: monitor.terminal.tone,
    },
    {
      icon: ClockIcon,
      label: "Siguiente",
      text: monitor.terminal.policyHash
        ? `Hash ${monitor.terminal.policyHash.slice(0, 8)} - ${monitor.terminal.lastAckLabel}`
        : "Guardar política y confirmar en MT5.",
      tone: monitor.terminal.policyHashMatches ? "safe" : "muted" as RiskGuardMonitorTone,
    },
  ];

  return (
    <Card className={riskCardClass}>
      <CardHeader>
        <CardTitle>Qué está activo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 border-b border-border/60 py-3 last:border-b-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <row.icon className={cn("size-4", toneTextClasses[row.tone])} />
              {row.label}
            </div>
            <p className="text-muted-foreground">{row.text}</p>
          </div>
        ))}
        {!monitor.hasSufficientData ? (
          <div className="mt-3 rounded-lg border border-border/70 bg-background/35 p-3 text-xs leading-5 text-muted-foreground">
            Historial insuficiente para completar todas las métricas.
          </div>
        ) : null}
        {monitor.terminal.firmCautionRequired ? (
          <div className="mt-3 rounded-lg border border-risk/35 bg-risk/10 p-3 text-xs leading-5 text-risk">
            Cerrar posiciones automáticamente puede afectar normas de fondeo. Úsalo solo tras revisar la firma y el examen.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RuleRow({ rule }: { rule: RiskGuardMonitorRule }) {
  const statusLabel =
    rule.status === "Bloqueo lógico"
      ? "Bloquear entrada"
      : rule.status === "Teórico"
        ? "No activo"
        : rule.status;

  return (
    <li className="grid gap-3 border-b border-border/60 py-3 last:border-b-0 md:grid-cols-[1.1fr_0.7fr_0.7fr_1.4fr] md:items-center">
      <div>
        <p className="font-medium text-foreground">{rule.label}</p>
        <p className="mt-1 text-xs text-muted-foreground md:hidden">{rule.detail}</p>
      </div>
      <p className="font-mono text-sm text-foreground">{rule.value}</p>
      <p className={cn("text-sm font-medium", toneTextClasses[rule.tone])}>{statusLabel}</p>
      <p className="hidden text-sm text-muted-foreground md:block">{rule.detail}</p>
    </li>
  );
}

function EventRow({ event }: { event: RiskGuardMonitorEvent }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{event.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
      </div>
      <p className={cn("shrink-0 font-mono text-sm font-semibold", toneTextClasses[event.tone])}>
        {event.value}
      </p>
    </li>
  );
}

export function RiskGuardMonitorSection({
  workspace,
}: RiskGuardMonitorSectionProps) {
  const monitor = buildRiskGuardMonitor(workspace);
  const policy = getRiskPolicyControls(workspace);
  const barWidth = Math.min(monitor.dailyUsagePct, 100);
  const accountLabel = monitor.account?.label ?? "Cuenta sin seleccionar";

  return (
    <section className="flex w-full max-w-none flex-col gap-4 p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium tracking-normal text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/70 px-2 py-1 text-profit">
              <EyeIcon className="size-3.5" />
              Monitor activo
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/70 px-2 py-1 text-muted-foreground">
              <ShieldAlertIcon className="size-3.5" />
              {monitor.terminal.activeEnforcementConfirmed ? "EA confirmado" : "MT5 solo lectura"}
            </span>
          </div>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
            Mesa de Riesgo
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Control de disciplina, límites y pausas antes de añadir riesgo.
          </p>
        </div>
        <Link
          href="/trades"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
        >
          Ver operaciones
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.7fr)]">
        <Card className={cn("min-h-[330px]", tonePanelClasses[monitor.status.tone])}>
          <CardHeader className="gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ShieldCheckIcon className={cn("size-6", toneTextClasses[monitor.status.tone])} />
                {monitor.status.label}
              </CardTitle>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {monitor.status.action}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">Última lectura MT5</p>
              <p className="mt-1 font-mono text-foreground">{monitor.lastReadLabel}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Cuenta activa</p>
                <p className="mt-1 truncate font-medium text-foreground">
                  {monitor.account?.label ?? "Sin cuenta activa"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Servidor</p>
                <p className="mt-1 truncate font-medium text-foreground">
                  {monitor.account ? `${monitor.account.broker} / ${monitor.account.server}` : "Pendiente"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estado operativo</p>
                <p className={cn("mt-1 font-medium", toneTextClasses[monitor.status.tone])}>
                  {monitor.status.label}
                </p>
              </div>
            </div>

            <RiskZonePanel barWidth={barWidth} monitor={monitor} />

            <div className="rounded-lg border border-border/70 bg-background/45 p-4">
              <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-risk" />
                <span>{monitor.monitor.message}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <MonitorBoundaryCard monitor={monitor} />
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-3 xl:grid-cols-6">
        {monitor.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>

      <RiskPolicyConfigurator
        accountId={monitor.account?.id ?? workspace.activeAccountId}
        accountLabel={accountLabel}
        policy={policy}
      />

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className={riskCardClass}>
          <CardHeader>
            <CardTitle>Reglas leídas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul>
              {monitor.rules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} />
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className={riskCardClass}>
          <CardHeader>
            <CardTitle>Eventos recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {monitor.recentEvents.length ? (
              <ul>
                {monitor.recentEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                Historial insuficiente para mostrar eventos recientes.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
