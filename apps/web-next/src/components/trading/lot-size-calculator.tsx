"use client";

import * as React from "react";

import type { TradingAccount } from "@/lib/contracts/account";
import type { RiskSnapshot } from "@/lib/contracts/risk";
import {
  calculateFxLotSize,
  CALCULATOR_INSTRUMENT_SYMBOLS,
  getLotSizingRecommendationRows,
  getInstrumentProfile,
  getRecommendedRiskPct,
  parseCalculatorNumber,
} from "@/lib/domain/lot-sizing";
import { formatCurrency, formatPercent } from "@/lib/formatters/numbers";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function formatLot(value: number) {
  return value.toFixed(2);
}

const calculatorInputClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

const RISK_PRESETS = [0.25, 0.5, 1];

export function LotSizeCalculator({
  accounts,
  risk,
}: {
  accounts: TradingAccount[];
  risk: RiskSnapshot;
}) {
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [symbol, setSymbol] = React.useState("EURUSD");
  const [riskPctInput, setRiskPctInput] = React.useState(
    getRecommendedRiskPct(accounts[0] ?? null).toFixed(2),
  );
  const [stopPipsInput, setStopPipsInput] = React.useState("15");
  const [pointValueInput, setPointValueInput] = React.useState("");

  const selectedAccount =
    accounts.find((account) => account.id === accountId) ?? accounts[0] ?? null;
  const instrument = getInstrumentProfile(symbol);
  const baseAmount = selectedAccount?.equity ?? 0;
  const parsedRiskPct = parseCalculatorNumber(riskPctInput);
  const parsedStopPips = parseCalculatorNumber(stopPipsInput);
  const parsedPointValue = parseCalculatorNumber(pointValueInput);
  const valuePerUnitPerLot =
    instrument.kind === "fx"
      ? null
      : Math.max(parsedPointValue ?? instrument.defaultValuePerUnitPerLot ?? 0, 0);
  const pointValueForValidation = valuePerUnitPerLot ?? 0;
  const requestedRiskPct = Math.max(parsedRiskPct ?? 0, 0);
  const stopPips = Math.max(parsedStopPips ?? 0, 0);
  const result = calculateFxLotSize({
    account: selectedAccount,
    symbol,
    riskPct: requestedRiskPct,
    stopPips,
    baseAmount,
    valuePerUnitPerLot,
  });
  const canCalculate =
    Boolean(selectedAccount) &&
    baseAmount > 0 &&
    requestedRiskPct > 0 &&
    stopPips > 0 &&
    (instrument.kind === "fx" || pointValueForValidation > 0) &&
    Boolean(result.pipValuePerLot);
  const displayedLotSize = canCalculate ? result.lotSize : 0;
  const displayedAppliedRiskMoney = canCalculate ? result.appliedRiskMoney : 0;
  const displayedRequestedRiskMoney = canCalculate ? result.requestedRiskMoney : 0;
  const fundingCapWasApplied =
    result.safeCapPct !== null && requestedRiskPct > result.safeCapPct;
  const dailyRoomPct =
    selectedAccount?.funding?.dailyRoomLeftPct ?? risk.dailyRoomLeftPct;
  const dailyRoomMoney = baseAmount * (Math.max(dailyRoomPct, 0) / 100);
  const heatRoomPct = Math.max(risk.heatLimitPct - risk.totalOpenRiskPct, 0);
  const heatRoomMoney = baseAmount * (heatRoomPct / 100);
  const exceedsRoom =
    displayedAppliedRiskMoney > dailyRoomMoney || result.appliedRiskPct > heatRoomPct;
  const hasStaleData =
    selectedAccount?.connectionState === "stale" ||
    selectedAccount?.connectionState === "pending" ||
    selectedAccount?.connectionState === "error" ||
    selectedAccount?.connectionState === "plan_limited";
  const validationMessage =
    !selectedAccount || baseAmount <= 0
      ? "Selecciona una cuenta con equity disponible."
      : requestedRiskPct <= 0
        ? "Introduce un risk mayor que 0."
        : stopPips <= 0
          ? "Introduce un stop mayor que 0."
          : instrument.kind !== "fx" && pointValueForValidation <= 0
            ? "Introduce un valor por punto mayor que 0."
          : !result.pipValuePerLot
            ? "No hay conversión para este instrumento."
            : null;
  const safetyTone = validationMessage
    ? "warning"
    : exceedsRoom
      ? "danger"
      : fundingCapWasApplied || hasStaleData
        ? "warning"
        : "safe";
  const safetyMessage = validationMessage
    ? validationMessage
    : exceedsRoom
      ? "Reduce risk o stop antes de abrir más exposición."
      : hasStaleData
        ? "Cálculo estimado con datos no frescos."
        : fundingCapWasApplied
          ? "Aplicado el cap recomendado de la cuenta."
          : "Riesgo dentro del margen visible.";

  const recommendations = getLotSizingRecommendationRows({
    accounts,
    symbol,
    stopPips: stopPips > 0 ? stopPips : instrument.defaultStopUnits,
    valuePerUnitPerLot,
  });

  const handleAccountChange = React.useCallback(
    (value: string | null) => {
      if (!value) return;
      setAccountId(value);
      const nextAccount = accounts.find((account) => account.id === value);
      setRiskPctInput(
        getRecommendedRiskPct(nextAccount ?? null).toFixed(2),
      );
    },
    [accounts],
  );

  const applyRecommendedRisk = React.useCallback(() => {
    setRiskPctInput(getRecommendedRiskPct(selectedAccount).toFixed(2));
  }, [selectedAccount]);

  const handleSymbolChange = React.useCallback((value: string | null) => {
    if (!value) return;
    const nextInstrument = getInstrumentProfile(value);
    setSymbol(nextInstrument.symbol);
    setStopPipsInput(String(nextInstrument.defaultStopUnits));
    setPointValueInput(
      nextInstrument.defaultValuePerUnitPerLot === null
        ? ""
        : nextInstrument.defaultValuePerUnitPerLot.toFixed(2),
    );
  }, []);

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <div className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="calculator-account">Cuenta</FieldLabel>
              <select
                id="calculator-account"
                className={calculatorInputClass}
                value={selectedAccount?.id ?? ""}
                onChange={(event) => handleAccountChange(event.currentTarget.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
              <FieldDescription>
                {selectedAccount
                  ? `${formatCurrency(selectedAccount.equity, selectedAccount.baseCurrency)} equity`
                  : "Sin cuenta"}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="calculator-symbol">Instrumento</FieldLabel>
              <select
                id="calculator-symbol"
                className={calculatorInputClass}
                value={symbol}
                onChange={(event) => handleSymbolChange(event.currentTarget.value)}
              >
                {CALCULATOR_INSTRUMENT_SYMBOLS.map((item) => (
                  <option key={item} value={item}>
                    {getInstrumentProfile(item).label}
                  </option>
                ))}
              </select>
              <FieldDescription>
                {instrument.kind === "fx"
                  ? `${result.instrument.quoteCurrency} -> ${result.accountCurrency}`
                  : `${result.instrument.valueSourceLabel}`}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="calculator-risk-pct">Risk %</FieldLabel>
              <input
                id="calculator-risk-pct"
                className={calculatorInputClass}
                inputMode="decimal"
                suppressHydrationWarning
                value={riskPctInput}
                onChange={(event) => setRiskPctInput(event.currentTarget.value)}
              />
              <FieldDescription>
                Recomendado:{" "}
                {selectedAccount
                  ? formatPercent(getRecommendedRiskPct(selectedAccount))
                  : "0.50%"}
              </FieldDescription>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={applyRecommendedRisk}
                  className="min-h-11 rounded-md border border-border/70 px-3 py-1 text-xs text-foreground transition-colors hover:bg-background/50 sm:min-h-7 sm:px-2"
                >
                  Rec.
                </button>
                {RISK_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRiskPctInput(preset.toFixed(2))}
                    className="min-h-11 rounded-md border border-border/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground sm:min-h-7 sm:px-2"
                  >
                    {formatPercent(preset)}
                  </button>
                ))}
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="calculator-stop-pips">Stop</FieldLabel>
              <input
                id="calculator-stop-pips"
                className={calculatorInputClass}
                inputMode="decimal"
                suppressHydrationWarning
                value={stopPipsInput}
                onChange={(event) => setStopPipsInput(event.currentTarget.value)}
              />
              <FieldDescription>
                {instrument.kind === "fx" ? "Pips hasta SL." : "Puntos hasta SL."}
              </FieldDescription>
            </Field>

            {instrument.kind !== "fx" ? (
              <Field>
                <FieldLabel htmlFor="calculator-point-value">Valor punto / lote</FieldLabel>
                <input
                  id="calculator-point-value"
                  className={calculatorInputClass}
                  inputMode="decimal"
                  suppressHydrationWarning
                  value={pointValueInput}
                  onChange={(event) => setPointValueInput(event.currentTarget.value)}
                />
                <FieldDescription>
                  {instrument.unitLabel} / editable según broker.
                </FieldDescription>
              </Field>
            ) : null}
          </div>
        </div>

        <aside className="grid content-start gap-5 border-t border-border/70 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Lotaje</p>
              <p className="mt-2 text-7xl font-semibold leading-[0.9] tabular-nums text-foreground sm:text-8xl lg:text-[7rem]">
                {formatLot(displayedLotSize)}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Lotes estándar / {formatLot(displayedLotSize * 10)} mini /{" "}
                {formatLot(displayedLotSize * 100)} micro
              </p>
              {instrument.kind !== "fx" ? (
                <p className="mt-2 text-xs text-risk">
                  Estimado CFD con valor punto editable, no spec oficial MT5.
                </p>
              ) : null}
            </div>

            <div
              className={cn(
                "border-t border-border/70 pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0",
                safetyTone === "danger" && "text-destructive",
                safetyTone === "warning" && "text-risk",
                safetyTone === "safe" && "text-profit",
              )}
            >
              <p className="text-xs uppercase">Riesgo</p>
              <p className="mt-2 text-sm font-medium text-foreground">{safetyMessage}</p>
              <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <span>Margen diario</span>
                  <span className="tabular-nums text-foreground">
                    {formatCurrency(dailyRoomMoney, result.accountCurrency)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Room por heat</span>
                  <span className="tabular-nums text-foreground">
                    {formatCurrency(heatRoomMoney, result.accountCurrency)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Riesgo abierto</span>
                  <span className="tabular-nums text-foreground">
                    {formatPercent(risk.totalOpenRiskPct)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-t border-border/70 pt-5 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Pérdida al stop</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                {formatCurrency(displayedAppliedRiskMoney, result.accountCurrency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Solicitado: {formatCurrency(displayedRequestedRiskMoney, result.accountCurrency)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Risk usado</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                {formatPercent(result.appliedRiskPct)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.safeCapPct
                  ? `Cap cuenta ${formatPercent(result.safeCapPct)}`
                  : "Sin cap externo"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Valor punto / lote</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                {result.pipValuePerLot
                  ? formatCurrency(result.pipValuePerLot, result.accountCurrency, 2)
                  : "Sin dato"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {instrument.kind === "fx"
                  ? result.conversion?.source === "identity"
                    ? "Misma divisa"
                    : "Conversión estimada"
                  : instrument.unitLabel}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <section className="border-t border-border/70 pt-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-foreground">Recomendaciones por cuenta</p>
            <p className="text-xs text-muted-foreground">
              Mismo par y stop / cada cuenta usa su risk recomendado.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            FX spot + oro/índices CFD estimados / lot step 0.01.
          </p>
        </div>
        <div className="grid gap-2">
          {recommendations.map((item) => (
            <button
              key={item.account.id}
              type="button"
              onClick={() => {
                setAccountId(item.account.id);
                setRiskPctInput(item.recommendedRiskPct.toFixed(2));
              }}
              className={cn(
                "grid gap-3 rounded-md border border-border/70 bg-background/25 p-3 text-left transition-colors hover:bg-background/45 md:grid-cols-[minmax(180px,1fr)_110px_110px_100px]",
                item.account.id === selectedAccount?.id && "border-foreground/40 bg-background/50",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {item.account.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.sourceLabel}
                  {item.dailyRoomPct !== null ? ` / room ${formatPercent(item.dailyRoomPct)}` : ""}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-[11px]",
                    item.needsFreshData ? "text-risk" : "text-muted-foreground",
                  )}
                >
                  {item.freshnessLabel}
                </span>
              </span>
              <span>
                <span className="block text-xs text-muted-foreground">Risk</span>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {formatPercent(item.result.appliedRiskPct)}
                </span>
              </span>
              <span>
                <span className="block text-xs text-muted-foreground">Pérdida</span>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(item.result.appliedRiskMoney, item.result.accountCurrency)}
                </span>
              </span>
              <span>
                <span className="block text-xs text-muted-foreground">Lotaje</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {formatLot(item.result.lotSize)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
