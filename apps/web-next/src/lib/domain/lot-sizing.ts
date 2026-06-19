import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export const FX_SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "EURGBP",
] as const;

export type InstrumentKind = "fx" | "metal" | "index" | "custom";

export type InstrumentProfile = {
  symbol: string;
  label: string;
  kind: InstrumentKind;
  quoteCurrency: string;
  unitLabel: string;
  defaultStopUnits: number;
  defaultValuePerUnitPerLot: number | null;
  valueSourceLabel: string;
};

export const CFD_INSTRUMENT_PROFILES = [
  {
    symbol: "XAUUSD",
    label: "XAUUSD / Oro",
    kind: "metal",
    quoteCurrency: "USD",
    unitLabel: "0.01 USD",
    defaultStopUnits: 1000,
    defaultValuePerUnitPerLot: 1,
    valueSourceLabel: "Default XAU: 100 oz/lote, punto 0.01",
  },
  {
    symbol: "US30",
    label: "US30 / Dow",
    kind: "index",
    quoteCurrency: "USD",
    unitLabel: "1 punto",
    defaultStopUnits: 100,
    defaultValuePerUnitPerLot: 1,
    valueSourceLabel: "Default CFD índice: 1 USD/punto/lote",
  },
  {
    symbol: "NAS100",
    label: "NAS100 / Nasdaq",
    kind: "index",
    quoteCurrency: "USD",
    unitLabel: "1 punto",
    defaultStopUnits: 100,
    defaultValuePerUnitPerLot: 1,
    valueSourceLabel: "Default CFD índice: 1 USD/punto/lote",
  },
  {
    symbol: "SPX500",
    label: "SPX500 / S&P",
    kind: "index",
    quoteCurrency: "USD",
    unitLabel: "1 punto",
    defaultStopUnits: 50,
    defaultValuePerUnitPerLot: 1,
    valueSourceLabel: "Default CFD índice: 1 USD/punto/lote",
  },
] as const satisfies readonly InstrumentProfile[];

export const CALCULATOR_INSTRUMENT_SYMBOLS = [
  ...FX_SYMBOLS,
  ...CFD_INSTRUMENT_PROFILES.map((profile) => profile.symbol),
] as const;

const STATIC_FX_RATES: Record<string, number> = {
  EURUSD: 1.08,
  GBPUSD: 1.27,
  AUDUSD: 0.66,
  USDCAD: 1.37,
  USDCHF: 0.91,
  USDJPY: 155,
  EURGBP: 0.85,
  EURJPY: 167,
  GBPJPY: 197,
};

const ACCOUNT_CURRENCIES = new Set(["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"]);

export type FxPair = {
  base: string;
  quote: string;
  symbol: string;
};

export type CurrencyConversion = {
  rate: number;
  path: string;
  source: "identity" | "static";
};

export type LotSizingInput = {
  account: TradingAccount | null;
  symbol: string;
  riskPct: number;
  stopPips: number;
  baseAmount?: number;
  valuePerUnitPerLot?: number | null;
  applySafeCap?: boolean;
};

export type LotSizingResult = {
  accountCurrency: string;
  equity: number;
  safeCapPct: number | null;
  appliedRiskPct: number;
  requestedRiskMoney: number;
  appliedRiskMoney: number;
  instrument: InstrumentProfile;
  pair: FxPair | null;
  conversion: CurrencyConversion | null;
  pipValuePerLot: number | null;
  lotSize: number;
  riskPerLot: number;
};

export type LotSizingAccountRow = {
  account: TradingAccount;
  riskPct: number;
  riskBudgetUsd: number;
  dailyRoomCapUsd: number | null;
  suggestedRiskUsd: number;
  sourceLabel: string;
};

export type LotSizingRecommendationRow = {
  account: TradingAccount;
  recommendedRiskPct: number;
  result: LotSizingResult;
  dailyRoomPct: number | null;
  dailyRoomMoney: number | null;
  sourceLabel: string;
  freshnessLabel: string;
  needsFreshData: boolean;
};

export type LotSizingOverview = {
  accountRows: LotSizingAccountRow[];
  fundedRows: LotSizingAccountRow[];
  highestBudget: LotSizingAccountRow | null;
  visibleAccountCount: number;
  fundedAccountCount: number;
  totalOpenRiskPct: number;
};

export function normalizeCurrency(value: string | undefined, fallback = "USD") {
  const code = String(value || "").trim().toUpperCase();
  return ACCOUNT_CURRENCIES.has(code) ? code : fallback;
}

export function parsePair(symbol: string): FxPair | null {
  const value = String(symbol || "").trim().toUpperCase();
  if (value.length !== 6) return null;
  const base = value.slice(0, 3);
  const quote = value.slice(3, 6);
  if (!ACCOUNT_CURRENCIES.has(base) || !ACCOUNT_CURRENCIES.has(quote) || base === quote) {
    return null;
  }
  return { base, quote, symbol: value };
}

export function getInstrumentProfile(symbol: string): InstrumentProfile {
  const value = String(symbol || "").trim().toUpperCase();
  if (!value) {
    return {
      symbol: "",
      label: "",
      kind: "fx",
      quoteCurrency: "USD",
      unitLabel: "pip",
      defaultStopUnits: 15,
      defaultValuePerUnitPerLot: null,
      valueSourceLabel: "Escribe un instrumento",
    };
  }
  const cfdProfile = CFD_INSTRUMENT_PROFILES.find((profile) => profile.symbol === value);
  if (cfdProfile) return cfdProfile;

  const compactValue = value.replace(/[^A-Z0-9]/g, "");
  if (compactValue.includes("XAU")) {
    const goldProfile = CFD_INSTRUMENT_PROFILES.find((profile) => profile.symbol === "XAUUSD");
    if (goldProfile) {
      return {
        ...goldProfile,
        symbol: value,
        label: value,
      };
    }
  }

  const indexPreset = CFD_INSTRUMENT_PROFILES.find((profile) =>
    compactValue.includes(profile.symbol),
  );
  if (indexPreset) {
    return {
      ...indexPreset,
      symbol: value,
      label: value,
    };
  }

  const pair = parsePair(value);
  if (pair) {
    return {
      symbol: pair.symbol,
      label: pair.symbol,
      kind: "fx",
      quoteCurrency: pair.quote,
      unitLabel: "pip",
      defaultStopUnits: 15,
      defaultValuePerUnitPerLot: null,
      valueSourceLabel: "FX spot / 100.000 unidades por lote",
    };
  }

  return {
    symbol: value || "EURUSD",
    label: value || "EURUSD",
    kind: "custom",
    quoteCurrency: "USD",
    unitLabel: "1 punto",
    defaultStopUnits: 100,
    defaultValuePerUnitPerLot: 1,
    valueSourceLabel: "Instrumento personalizado: edita valor punto/lote",
  };
}

function lookupRate(base: string, quote: string): CurrencyConversion | null {
  if (base === quote) return { rate: 1, path: `${base}${quote}`, source: "identity" };

  const directKey = `${base}${quote}`;
  const reverseKey = `${quote}${base}`;
  const direct = STATIC_FX_RATES[directKey];
  if (Number.isFinite(direct) && direct > 0) {
    return { rate: direct, path: directKey, source: "static" };
  }
  const reverse = STATIC_FX_RATES[reverseKey];
  if (Number.isFinite(reverse) && reverse > 0) {
    return { rate: 1 / reverse, path: reverseKey, source: "static" };
  }
  return null;
}

export function resolveConversion(
  fromCurrency: string,
  toCurrency: string,
): CurrencyConversion | null {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);

  if (from === to) {
    return { rate: 1, path: `${from}${to}`, source: "identity" };
  }

  const direct = lookupRate(from, to);
  if (direct) return direct;

  const toUsd = lookupRate(from, "USD");
  const fromUsd = lookupRate("USD", to);
  if (!toUsd || !fromUsd) return null;

  return {
    rate: toUsd.rate * fromUsd.rate,
    path: `${toUsd.path} -> ${fromUsd.path}`,
    source: "static",
  };
}

export function roundLotStep(value: number, step = 0.01) {
  return Math.max(0, Math.floor(value / step) * step);
}

export function asCalculatorNumber(value: string, fallback: number) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseCalculatorNumber(value: string) {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getRecommendedRiskPct(account: TradingAccount | null) {
  return account?.funding?.recommendedRiskPct ?? 0.5;
}

export function calculateFxLotSize({
  account,
  symbol,
  riskPct,
  stopPips,
  baseAmount,
  valuePerUnitPerLot,
  applySafeCap = true,
}: LotSizingInput): LotSizingResult {
  const accountCurrency = normalizeCurrency(account?.baseCurrency, "USD");
  const equity = Math.max(baseAmount ?? account?.equity ?? 0, 0);
  const safeCapPct = account?.funding
    ? Math.min(
        account.funding.recommendedRiskPct,
        Math.max(account.funding.dailyRoomLeftPct, 0),
      )
    : null;
  const appliedRiskPct =
    applySafeCap && safeCapPct !== null ? Math.min(riskPct, safeCapPct) : riskPct;
  const requestedRiskMoney = equity * (riskPct / 100);
  const appliedRiskMoney = equity * (appliedRiskPct / 100);
  const instrument = getInstrumentProfile(symbol);
  const pair = parsePair(symbol);
  const pipSize = pair?.quote === "JPY" ? 0.01 : 0.0001;
  const quotePipValuePerLot =
    instrument.kind === "fx"
      ? pair
        ? 100000 * pipSize
        : null
      : Math.max(valuePerUnitPerLot ?? instrument.defaultValuePerUnitPerLot ?? 0, 0);
  const conversion = resolveConversion(instrument.quoteCurrency, accountCurrency);
  const pipValuePerLot = conversion && quotePipValuePerLot
    ? quotePipValuePerLot * conversion.rate
    : null;
  const normalisedStopPips = Math.max(0.1, stopPips);
  const lotSize = pipValuePerLot
    ? roundLotStep(appliedRiskMoney / (normalisedStopPips * pipValuePerLot), 0.01)
    : 0;
  const riskPerLot = pipValuePerLot ? normalisedStopPips * pipValuePerLot : 0;

  return {
    accountCurrency,
    equity,
    safeCapPct,
    appliedRiskPct,
    requestedRiskMoney,
    appliedRiskMoney,
    instrument,
    pair,
    conversion,
    pipValuePerLot,
    lotSize,
    riskPerLot,
  };
}

export function getLotSizingRecommendationRows({
  accounts,
  symbol,
  stopPips,
  valuePerUnitPerLot,
}: {
  accounts: TradingAccount[];
  symbol: string;
  stopPips: number;
  valuePerUnitPerLot?: number | null;
}): LotSizingRecommendationRow[] {
  return accounts.map((account) => {
    const recommendedRiskPct = getRecommendedRiskPct(account);
    const result = calculateFxLotSize({
      account,
      symbol,
      riskPct: recommendedRiskPct,
      stopPips,
      baseAmount: account.equity,
      valuePerUnitPerLot,
    });
    const dailyRoomPct = account.funding?.dailyRoomLeftPct ?? null;
    const dailyRoomMoney =
      dailyRoomPct === null ? null : account.equity * (Math.max(dailyRoomPct, 0) / 100);
    const needsFreshData =
      account.connectionState === "stale" ||
      account.connectionState === "pending" ||
      account.connectionState === "error" ||
      account.connectionState === "plan_limited";
    const freshnessLabel = needsFreshData
      ? `${account.lastSyncLabel} / estimado`
      : account.lastSyncLabel;

    return {
      account,
      recommendedRiskPct,
      result,
      dailyRoomPct,
      dailyRoomMoney,
      sourceLabel: account.funding?.playbookLabel ?? "Riesgo base sin límite externo",
      freshnessLabel,
      needsFreshData,
    };
  });
}

export function getLotSizingOverview(workspace: WorkspaceState): LotSizingOverview {
  const accountRows = workspace.accounts.map((account) => {
    const riskPct = getRecommendedRiskPct(account);
    const riskBudgetUsd = account.equity * (riskPct / 100);
    const dailyRoomCapUsd = account.funding
      ? account.equity * (Math.max(account.funding.dailyRoomLeftPct, 0) / 100)
      : null;
    const suggestedRiskUsd =
      dailyRoomCapUsd === null ? riskBudgetUsd : Math.min(riskBudgetUsd, dailyRoomCapUsd);

    return {
      account,
      riskPct,
      riskBudgetUsd,
      dailyRoomCapUsd,
      suggestedRiskUsd,
      sourceLabel: account.funding?.playbookLabel ?? "Cuenta sin límite externo",
    };
  });
  const fundedRows = accountRows.filter((row) => row.account.funding);
  const highestBudget =
    [...accountRows].toSorted((a, b) => b.suggestedRiskUsd - a.suggestedRiskUsd)[0] ?? null;

  return {
    accountRows,
    fundedRows,
    highestBudget,
    visibleAccountCount: accountRows.length,
    fundedAccountCount: fundedRows.length,
    totalOpenRiskPct: workspace.risk.totalOpenRiskPct,
  };
}
