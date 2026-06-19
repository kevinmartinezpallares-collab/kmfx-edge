import {
  BadgeCheck,
  BarChart3,
  Database,
  FileDown,
  FlaskConical,
  Gauge,
  GitBranch,
  LockKeyhole,
  PlayCircle,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  accountObjectives,
  getStrategyLabReadiness,
  researchGates,
  strategyFamilies,
  strategyLabCommands,
  strategyLabMetrics,
  strategyLabSteps,
  type StrategyLabStatus,
} from "@/lib/domain/strategy-lab";

const statusLabel: Record<StrategyLabStatus, string> = {
  ready: "Listo",
  pending: "Pendiente",
  blocked: "Bloqueado",
};

const statusVariant: Record<StrategyLabStatus, "secondary" | "outline" | "destructive"> = {
  ready: "secondary",
  pending: "outline",
  blocked: "destructive",
};

function StatusBadge({ status }: { status: StrategyLabStatus }) {
  return <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>;
}

function MetricStrip() {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {strategyLabMetrics.map((metric) => (
        <Card key={metric.label} size="sm">
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-xl">{metric.value}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            {metric.note}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ObjectiveTabs() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivo de cuenta</CardTitle>
        <CardDescription>
          El motor no busca el backtest mas bonito; cambia el criterio segun la cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={accountObjectives[0]?.name} className="gap-4">
          <TabsList className="grid h-auto grid-cols-1 md:grid-cols-3">
            {accountObjectives.map((objective) => (
              <TabsTrigger key={objective.name} value={objective.name} className="min-h-10">
                {objective.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {accountObjectives.map((objective) => (
            <TabsContent key={objective.name} value={objective.name}>
              <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 p-4">
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {objective.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {objective.controls.map((control) => (
                    <Badge key={control} variant="outline">
                      {control}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PipelineCard() {
  const readiness = getStrategyLabReadiness();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado del proceso</CardTitle>
        <CardDescription>
          Lo que ya esta listo y lo que falta para alimentar el primer ranking real.
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{readiness}% operativo</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Progress value={readiness} className="h-1.5" />
        <div className="flex flex-col gap-2">
          {strategyLabSteps.map((step, index) => (
            <div
              key={step.id}
              className="grid gap-3 rounded-lg border border-border/70 bg-background/40 p-3 md:grid-cols-[2rem_minmax(0,1fr)_auto] md:items-center"
            >
              <div className="flex size-8 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-sm text-muted-foreground">
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground">{step.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
              </div>
              <StatusBadge status={step.status} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CommandCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comandos utiles</CardTitle>
        <CardDescription>
          Los tres comandos que vas a usar durante la primera carga de datos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {strategyLabCommands.map((item) => (
          <div key={item.label} className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-medium text-foreground">{item.label}</p>
              <Badge variant="outline">CLI</Badge>
            </div>
            <code className="block overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
              {item.command}
            </code>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StrategyCards() {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {strategyFamilies.map((strategy) => (
        <Card key={strategy.name} size="sm">
          <CardHeader>
            <CardTitle>{strategy.name}</CardTitle>
            <CardDescription>{strategy.market}</CardDescription>
            <CardAction>
              <StatusBadge status={strategy.status} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm leading-6 text-muted-foreground">{strategy.bestFor}</p>
            <div className="flex flex-wrap gap-2">
              {strategy.checks.map((check) => (
                <Badge key={check} variant="outline">
                  {check}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ValidationTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Puertas de validacion</CardTitle>
        <CardDescription>
          Una estrategia solo puede convertirse en EA si pasa estas capas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Puerta</TableHead>
              <TableHead>Objetivo</TableHead>
              <TableHead>Lectura</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {researchGates.map((gate) => (
              <TableRow key={gate.name}>
                <TableCell className="font-medium text-foreground">{gate.name}</TableCell>
                <TableCell className="text-muted-foreground">{gate.target}</TableCell>
                <TableCell className="min-w-[260px] text-muted-foreground">
                  {gate.detail}
                </TableCell>
                <TableCell>
                  <StatusBadge status={gate.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FlowCard() {
  const steps = [
    { icon: FileDown, label: "MT5 CSV", detail: "Backtest real exportado" },
    { icon: Database, label: "Supabase", detail: "Metricas y ranking" },
    { icon: Gauge, label: "Fitness", detail: "PF, DD, R:R, Monte Carlo" },
    { icon: GitBranch, label: "Robustez", detail: "Fuentes, costes, OOS" },
    { icon: PlayCircle, label: "EA", detail: "Solo candidatos aprobados" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flujo de investigacion</CardTitle>
        <CardDescription>
          De un backtest bruto a una estrategia candidata sin saltarse controles.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-5">
        {steps.map((step) => (
          <div key={step.label} className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <step.icon className="mb-3 size-4 text-muted-foreground" />
            <p className="font-medium text-foreground">{step.label}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function StrategyLabSection({ previewMode = false }: { previewMode?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                <LockKeyhole data-icon="inline-start" />
                Admin
              </Badge>
              {previewMode ? <Badge variant="outline">Preview local</Badge> : null}
              <Badge variant="outline">
                <ShieldCheck data-icon="inline-start" />
                No promociona sin validacion
              </Badge>
            </div>
            <CardTitle className="text-2xl">Strategy Research Engine</CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7">
              Panel interno para descubrir, validar y promover estrategias de KMFX.
              Sirve para cuentas de fondeo, bots de consistencia larga y track records
              tipo Darwinex sin depender de un unico backtest.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <Target className="mb-3 size-4 text-muted-foreground" />
              <p className="font-medium">Selecciona objetivo</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Fondeo, consistencia o track record.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <FlaskConical className="mb-3 size-4 text-muted-foreground" />
              <p className="font-medium">Prueba familias</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                ORB, VWAP, liquidez y compresion.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <BarChart3 className="mb-3 size-4 text-muted-foreground" />
              <p className="font-medium">Promueve con datos</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Ranking solo tras robustez y costes.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado actual</CardTitle>
            <CardDescription>Listo para recibir el primer CSV de MT5.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">DB</span>
              <Badge variant="secondary">
                <BadgeCheck data-icon="inline-start" />
                OK
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">CSV importado</span>
              <Badge variant="outline">Pendiente</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">EA exportable</span>
              <Badge variant="destructive">Bloqueado</Badge>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                Criterio activo
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Esperar datos reales, comparar fuentes y simular reglas de cuenta antes
                de promover.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <MetricStrip />
      <ObjectiveTabs />
      <FlowCard />

      <section>
        <div className="mb-3">
          <h2 className="text-base font-medium text-foreground">Familias de estrategia</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Cada familia se convertira en una tarjeta con sus parametros, resultados y
            razones de rechazo o promocion.
          </p>
        </div>
        <StrategyCards />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <ValidationTable />
        <div className="flex flex-col gap-4">
          <PipelineCard />
          <CommandCard />
        </div>
      </section>
    </div>
  );
}
