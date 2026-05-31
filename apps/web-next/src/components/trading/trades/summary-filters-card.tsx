import type * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signedTextClass } from "@/lib/domain/semantic-colors";
import { formatCurrency, formatSignedCurrency } from "@/lib/formatters/numbers";
import { cn } from "@/lib/utils";

type TradesSummaryFiltersCardProps = {
  accountLabel: string;
  costs: number;
  dateFrom: string;
  dateTo: string;
  missingSetupCount: number;
  netPnl: number;
  onDateFromChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDateToChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOutcomeFilterChange: (value: string | null) => void;
  onSessionFilterChange: (value: string | null) => void;
  onSetupFilterChange: (value: string | null) => void;
  onSymbolFilterChange: (value: string | null) => void;
  outcomeFilter: string;
  outcomeFilterLabel: string;
  sessionFilter: string;
  sessionFilterLabel: string;
  sessions: string[];
  setupFilter: string;
  setupFilterLabel: string;
  symbolFilter: string;
  symbolFilterLabel: string;
  symbols: string[];
  tagCoveragePct: number;
  totalTrades: number;
  wins: number;
  losses: number;
};

export function TradesSummaryFiltersCard({
  accountLabel,
  costs,
  dateFrom,
  dateTo,
  missingSetupCount,
  netPnl,
  onDateFromChange,
  onDateToChange,
  onOutcomeFilterChange,
  onSessionFilterChange,
  onSetupFilterChange,
  onSymbolFilterChange,
  outcomeFilter,
  outcomeFilterLabel,
  sessionFilter,
  sessionFilterLabel,
  sessions,
  setupFilter,
  setupFilterLabel,
  symbolFilter,
  symbolFilterLabel,
  symbols,
  tagCoveragePct,
  totalTrades,
  wins,
  losses,
}: TradesSummaryFiltersCardProps) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="pb-3">
        <CardTitle>Trades</CardTitle>
        <CardDescription>
          Operaciones cerradas con resultado, costes, parciales y estado de revisión.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            ["Operaciones cerradas", String(totalTrades), accountLabel],
            ["PnL neto", formatSignedCurrency(netPnl), `${wins}W / ${losses}L`],
            ["Costes", formatCurrency(costs), "Comisión + swap"],
            ["Setup / etiquetas", `${tagCoveragePct.toFixed(0)}%`, `${missingSetupCount} pendientes`],
          ].map(([label, value, note]) => (
            <div key={label} className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p
                className={cn(
                  "mt-1 truncate text-lg font-semibold text-foreground sm:text-2xl",
                  label === "PnL neto" && signedTextClass(netPnl),
                )}
              >
                {value}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
          <Field className="col-span-2 lg:col-span-1">
            <FieldLabel htmlFor="trades-account-filter">Cuenta</FieldLabel>
            <Input
              id="trades-account-filter"
              value={accountLabel}
              disabled
              className="border-border/70 bg-background/40"
            />
          </Field>
          <Field className="col-span-2 min-w-0 md:col-span-1">
            <FieldLabel htmlFor="trades-date-from-filter">Desde</FieldLabel>
            <Input
              id="trades-date-from-filter"
              type="date"
              value={dateFrom}
              onChange={onDateFromChange}
              className="border-border/70 bg-background/40"
            />
          </Field>
          <Field className="col-span-2 min-w-0 md:col-span-1">
            <FieldLabel htmlFor="trades-date-to-filter">Hasta</FieldLabel>
            <Input
              id="trades-date-to-filter"
              type="date"
              value={dateTo}
              onChange={onDateToChange}
              className="border-border/70 bg-background/40"
            />
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="trades-symbol-filter">Símbolo</FieldLabel>
            <Select value={symbolFilter} onValueChange={onSymbolFilterChange}>
              <SelectTrigger
                id="trades-symbol-filter"
                className="w-full border-border/70 bg-background/40"
              >
                <SelectValue>{symbolFilterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Todos</SelectItem>
                  {symbols.map((symbol) => (
                    <SelectItem key={symbol} value={symbol}>
                      {symbol}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="trades-session-filter">Sesión</FieldLabel>
            <Select value={sessionFilter} onValueChange={onSessionFilterChange}>
              <SelectTrigger
                id="trades-session-filter"
                className="w-full border-border/70 bg-background/40"
              >
                <SelectValue>{sessionFilterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Todas</SelectItem>
                  {sessions.map((session) => (
                    <SelectItem key={session} value={session}>
                      {session}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="trades-outcome-filter">Resultado</FieldLabel>
            <Select value={outcomeFilter} onValueChange={onOutcomeFilterChange}>
              <SelectTrigger
                id="trades-outcome-filter"
                className="w-full border-border/70 bg-background/40"
              >
                <SelectValue>{outcomeFilterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Todo</SelectItem>
                  <SelectItem value="win">Ganadoras</SelectItem>
                  <SelectItem value="loss">Perdedoras</SelectItem>
                  <SelectItem value="flat">Neutras</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="trades-setup-filter">Setup</FieldLabel>
            <Select value={setupFilter} onValueChange={onSetupFilterChange}>
              <SelectTrigger
                id="trades-setup-filter"
                className="w-full border-border/70 bg-background/40"
              >
                <SelectValue>{setupFilterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Todo</SelectItem>
                  <SelectItem value="with">Con setup</SelectItem>
                  <SelectItem value="without">Sin setup</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
