import {
  Activity,
  BadgeCheck,
  BrainCircuit,
  Database,
  FileCode2,
  Play,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
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
import {
  getStrategyLabReadiness,
  strategyLabCandidatePlaceholders,
  strategyLabCommands,
  strategyLabGeneBlocks,
  strategyLabMetrics,
  strategyLabSteps,
  type StrategyLabStatus,
} from "@/lib/domain/strategy-lab";
import { cn } from "@/lib/utils";

const statusMeta: Record<StrategyLabStatus, { label: string; className: string }> = {
  ready: {
    label: "Listo",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  pending: {
    label: "Pendiente",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  blocked: {
    label: "Bloqueado",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

function StatusBadge({ status }: { status: StrategyLabStatus }) {
  const meta = statusMeta[status];
  return (
    <Badge variant="outline" className={cn("w-fit", meta.className)}>
      {meta.label}
    </Badge>
  );
}

function MetricCards() {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {strategyLabMetrics.map((metric) => (
        <Card key={metric.label} className="border-border/70 bg-card/70">
          <CardHeader className="pb-2">
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="font-mono text-3xl">{metric.value}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {metric.note}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function PipelineCard() {
  const readiness = getStrategyLabReadiness();

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Pipeline de puesta en marcha</CardTitle>
            <CardDescription>
              Orden exacto del documento maestro, con el panel admin ya protegido.
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-2">
            <ShieldCheck className="size-3.5" />
            Admin-only
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Preparacion total</span>
            <span className="font-mono text-foreground">{readiness}%</span>
          </div>
          <Progress value={readiness} className="h-1.5" />
        </div>
        <div className="grid gap-3">
          {strategyLabSteps.map((step, index) => (
            <div
              key={step.id}
              className="grid gap-3 rounded-lg border border-border/70 bg-background/30 p-3 md:grid-cols-[48px_minmax(0,1fr)_auto] md:items-center"
            >
              <div className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-card/65 font-mono text-sm text-muted-foreground">
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground">{step.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {step.detail}
                </p>
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
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Comandos operativos</CardTitle>
        <CardDescription>
          Lo que hay que ejecutar fuera de Vercel: Hetzner, MT5 y tu entorno Python.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {strategyLabCommands.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border/70 bg-background/35 p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Terminal className="size-4 text-primary" />
              {item.label}
            </div>
            <code className="block overflow-x-auto rounded-md bg-black/35 p-3 font-mono text-xs leading-5 text-muted-foreground">
              {item.command}
            </code>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function GeneCatalogCard() {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Catalogo genetico v1</CardTitle>
        <CardDescription>
          Seis bloques combinables. Python elige, MT5 prueba, PostgreSQL decide.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Bloque</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Opciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {strategyLabGeneBlocks.map((block) => (
              <TableRow key={block.block}>
                <TableCell className="font-mono text-foreground">{block.block}</TableCell>
                <TableCell className="text-foreground">{block.role}</TableCell>
                <TableCell className="min-w-[420px] text-muted-foreground">
                  {block.options.join(", ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CandidateCard() {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Top candidates</CardTitle>
        <CardDescription>
          Aqui apareceran los candidatos passed cuando PostgreSQL tenga runs reales.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Rank</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>TF</TableHead>
              <TableHead>Genes</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {strategyLabCandidatePlaceholders.map((candidate) => (
              <TableRow key={candidate.rank}>
                <TableCell className="font-mono text-foreground">{candidate.rank}</TableCell>
                <TableCell className="font-mono text-foreground">{candidate.symbol}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{candidate.timeframe}</TableCell>
                <TableCell className="min-w-[220px] text-muted-foreground">{candidate.genes}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{candidate.score}</TableCell>
                <TableCell>
                  <Badge variant="outline">{candidate.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ArtifactCard() {
  const artifacts = [
    {
      icon: Database,
      title: "schema.sql",
      body: "Tablas generations, algo_runs, top_candidates, mutation_log y vistas de resumen.",
    },
    {
      icon: BrainCircuit,
      title: "core/orchestrator.py",
      body: "Loop genetico: genera pool, espera backtests, calcula fitness y promueve top.",
    },
    {
      icon: FileCode2,
      title: "ea/Genetic_EA.mq5",
      body: "EA modular que lee next_gene.json y escribe result.json al terminar OnTester.",
    },
    {
      icon: Play,
      title: "config/gene_catalog.json",
      body: "Catalogo de bloques, simbolos, timeframes y direcciones del espacio de busqueda.",
    },
  ];

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Artefactos generados</CardTitle>
        <CardDescription>
          El motor vive en `kmfx_genetic/`; la beta solo expone y gobierna la superficie interna.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {artifacts.map((item) => (
          <div
            key={item.title}
            className="rounded-lg border border-border/70 bg-background/30 p-3"
          >
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <item.icon className="size-4 text-primary" />
              {item.title}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function StrategyLabSection() {
  return (
    <div className="grid gap-4">
      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-2">
                  <BadgeCheck className="size-3.5" />
                  Admin activo
                </Badge>
                <Badge variant="secondary" className="gap-2">
                  <Activity className="size-3.5" />
                  Exploracion genetica v1
                </Badge>
              </div>
              <CardTitle className="text-2xl">Strategy Lab</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base leading-7">
                Consola interna para preparar el sistema genetico de KMFX: catalogo de
                genes, setup PostgreSQL, EA de backtest y primera generacion controlada.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <MetricCards />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <PipelineCard />
        <CommandCard />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ArtifactCard />
        <CandidateCard />
      </div>

      <GeneCatalogCard />
    </div>
  );
}
