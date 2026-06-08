import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EconomicCalendarWidget } from "@/components/trading/economic-calendar-widget";
import { macroCalendarConfig } from "@/lib/config/macro-calendar";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  economicImpactLabel,
  getEconomicCalendarOverview,
  type EconomicImpact,
} from "@/lib/domain/economic-calendar-selectors";
import { cn } from "@/lib/utils";

function economicImpactClasses(impact: EconomicImpact) {
  if (impact === "alto") {
    return "border-loss/20 bg-loss-muted text-loss";
  }

  if (impact === "medio") {
    return "border-risk/20 bg-risk-muted text-risk";
  }

  return "border-info/20 bg-info-muted text-info";
}

const NEWS_RISK_RULES = [
  "Evitar abrir operaciones justo antes de eventos de alto impacto.",
  "Revisar USD, EUR, GBP, JPY, CAD, AUD, NZD y CHF antes de operar.",
  "Vigilar CPI, NFP, FOMC, tipos de interés, GDP, PMI, empleo y discursos de bancos centrales.",
  "Las reglas exactas dependen de cada empresa de fondeo.",
];

function NewsRiskCard() {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Reglas de riesgo de noticias</CardTitle>
        <CardDescription>
          Lectura rápida para cuentas reales y retos de fondeo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {NEWS_RISK_RULES.map((rule) => (
          <div
            key={rule}
            className="rounded-lg border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground"
          >
            {rule}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function HighImpactNewsInfoCard() {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>Estado actual</CardTitle>
        <CardDescription>
          Sin coste recurrente, sin scraping y sin datos propios todavía.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        <p>
          El calendario es informativo. KMFX no garantiza exactitud,
          disponibilidad ni actualización del proveedor externo.
        </p>
        <p>
          Mesa de Riesgo podrá usar esta sección como contexto de solo lectura, pero no
          modifica operaciones.
        </p>
        <p className="rounded-lg border border-border/70 bg-background/35 p-3 text-foreground">
          Proveedor externo: TradingView. La integración queda encapsulada para
          cambiarla más adelante sin rediseñar la sección.
        </p>
      </CardContent>
    </Card>
  );
}

export function MacroCalendarSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const calendar = getEconomicCalendarOverview(workspace);

  return (
    <div className="grid gap-4">
      <Card className="border-border/70 bg-card/70">
        <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Noticias de alto impacto</CardTitle>
            <CardDescription>
              Consulta eventos macro relevantes antes de operar o gestionar retos
              de fondeo.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit">
            {macroCalendarConfig.enabled ? "Calendario activo" : "Calendario desactivado"}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {calendar.summaryCards.map((item) => (
            <div
              key={item.label}
              className="border-l border-border/70 px-4 py-1 first:border-l-0"
            >
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-2 truncate text-xl font-semibold text-foreground">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 border-border/70 bg-card/70">
          <CardHeader>
            <CardTitle>Calendario macro</CardTitle>
            <CardDescription>
              Widget oficial embebido. Filtrado hacia eventos de impacto medio y
              alto sobre divisas principales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EconomicCalendarWidget
              enabled={macroCalendarConfig.enabled}
              provider={macroCalendarConfig.provider}
            />
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <NewsRiskCard />
          <HighImpactNewsInfoCard />
        </div>
      </div>

      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <CardTitle>Agenda de riesgo</CardTitle>
          <CardDescription>
            Resumen interno de ventanas a vigilar. No reemplaza al proveedor
            externo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Hora</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Impacto</TableHead>
                  <TableHead>Afecta a</TableHead>
                  <TableHead>Ventana</TableHead>
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calendar.rows.map((event) => (
                  <TableRow key={`${event.time}-${event.event}`}>
                    <TableCell className="font-mono text-foreground">
                      {event.time} CET
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">{event.event}</p>
                      <p className="text-xs text-muted-foreground">
                        Moneda {event.currency}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("border", economicImpactClasses(event.impact))}
                      >
                        {economicImpactLabel(event.impact)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.affected.join(" / ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.window}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-sm text-foreground">
                      {event.action}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
