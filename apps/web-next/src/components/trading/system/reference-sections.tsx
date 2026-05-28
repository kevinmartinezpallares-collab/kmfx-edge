"use client";

import * as React from "react";
import { Search } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  getStudyOverview,
  type StudyCategory,
} from "@/lib/domain/study-selectors";
import { cn } from "@/lib/utils";
import { LotSizeCalculator } from "@/components/trading/lot-size-calculator";
import { MetricInfoCard } from "@/components/trading/metric-info-card";

function PageMotion({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function CalculatorReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  return (
    <PageMotion>
      <div className="grid gap-4">
        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle>Calculadora de lotaje</CardTitle>
            <CardDescription>
              Estilo Myfxbook: cuenta, risk, stop e instrumento para calcular el lotaje sin tocar MT5.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <LotSizeCalculator accounts={workspace.accounts} risk={workspace.risk} />
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle>Notas de cálculo</CardTitle>
            <CardDescription>
              Alcance claro para no convertir una estimación en una orden real.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              "Calcula FX spot, oro e índices CFD con lot step 0.01.",
              "En oro e índices el valor punto/lote es editable porque cambia por broker.",
              "Las cuentas de fondeo usan su risk recomendado e incluyen room diario cuando existe.",
              "No envía órdenes, no cambia riesgo real y no guarda presets de cuenta.",
            ].map((item) => (
              <div
                key={item}
                className="border-t border-border/70 pt-3 text-sm text-muted-foreground first:border-t-0 first:pt-0"
              >
                {item}
              </div>
            ))}
            <div className="border-t border-border/70 pt-3">
              <p className="text-xs text-muted-foreground">Pendiente de precisión broker</p>
              <p className="mt-2 text-sm text-foreground">
                Cuando MT5 exponga specs por símbolo, la calculadora debe preferir tick value,
                tick size, contract size y volume step reales sobre estos defaults.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageMotion>
  );
}

export function StudyReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const studyOverview = getStudyOverview(workspace);
  const [query, setQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<StudyCategory | "Todas">(
    "Todas",
  );
  const categoryOptions = studyOverview.categorySummaries.map(
    (summary) => summary.category,
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("es-ES");
  const visibleRows = studyOverview.glossaryRows.filter((row) => {
    const matchesCategory =
      activeCategory === "Todas" || row.category === activeCategory;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;

    return [
      row.term,
      row.category,
      row.definition,
      row.formula ?? "",
      row.dataNeeds,
      row.interpretation,
      row.sourceLabel,
    ]
      .join(" ")
      .toLocaleLowerCase("es-ES")
      .includes(normalizedQuery);
  });

  return (
    <PageMotion>
      <div className="grid gap-4">
        <Card size="sm" className="border-border/70 bg-card/70 shadow-sm">
          <CardHeader className="gap-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-start">
            <div className="min-w-0">
              <CardTitle className="text-xl">Biblioteca</CardTitle>
              <CardDescription className="mt-1">
                Glosario operativo de métricas, fórmulas y contexto KMFX.
              </CardDescription>
            </div>
            <CardAction className="col-start-1 row-start-2 w-full md:col-start-2 md:row-span-2 md:row-start-1 md:w-[360px]">
              <div className="relative h-10">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar término o fórmula"
                  className="h-10 pl-9"
                  aria-label="Buscar en Biblioteca"
                />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid overflow-hidden rounded-lg border border-border/70 md:grid-cols-3">
              {studyOverview.contextRows.map((item) => (
                <div
                  key={item}
                  className="border-b border-border/70 bg-background/18 px-3 py-2 text-sm text-muted-foreground last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["Todas", ...categoryOptions] as Array<StudyCategory | "Todas">).map(
                (category) => (
                  <Button
                    key={category}
                    type="button"
                    variant={activeCategory === category ? "secondary" : "outline"}
                    size="sm"
                    className="h-11 sm:h-9"
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}
                  </Button>
                ),
              )}
            </div>
          </CardContent>
        </Card>

        <nav
          className="flex gap-2 overflow-x-auto border-b border-border/70 pb-3"
          aria-label="Categorías de Biblioteca"
        >
          {studyOverview.categorySummaries.map((summary) => (
            <button
              key={summary.category}
              type="button"
              onClick={() => setActiveCategory(summary.category)}
              className={cn(
                "min-w-[180px] rounded-lg border border-border/70 bg-background/25 px-3 py-2 text-left transition-colors hover:bg-background/45",
                activeCategory === summary.category && "bg-background/55 text-foreground",
              )}
            >
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                {summary.category}
                <span className="font-mono text-xs text-muted-foreground">
                  {summary.count}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {summary.focus}
              </span>
            </button>
          ))}
        </nav>

        <section className="grid justify-center gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,270px))] sm:justify-start">
          {visibleRows.map((item) => (
            <MetricInfoCard key={item.id} item={item} />
          ))}
          {visibleRows.length === 0 ? (
            <div className="rounded-xl border border-border/70 bg-card/65 p-5 text-sm text-muted-foreground lg:col-span-2 2xl:col-span-3">
              No hay términos para esa búsqueda.
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {studyOverview.formulaNotes.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border/70 bg-card/65 p-4"
            >
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </section>
      </div>
    </PageMotion>
  );
}
