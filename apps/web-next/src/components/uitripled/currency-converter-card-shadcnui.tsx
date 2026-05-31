"use client";

import { m as motion } from "motion/react";
import { ArrowLeftRight, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useReducer } from "react";

type Currency = {
  code: string;
  name: string;
  symbol: string;
};

type CurrencyCode = (typeof CURRENCIES)[number]["code"];

const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
];

const BASE_INDEX: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
  JPY: 147.42,
  AUD: 1.5,
  CAD: 1.36,
  CHF: 0.88,
  CNY: 7.11,
  INR: 83.24,
  MXN: 17.12,
};

type ConverterState = {
  amount: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  result: number | null;
  rate: number | null;
  loading: boolean;
  isFlipped: boolean;
  error: string;
};

type ConverterAction =
  | { type: "setAmount"; amount: string }
  | { type: "setFromCurrency"; currency: CurrencyCode }
  | { type: "setToCurrency"; currency: CurrencyCode }
  | { type: "swapCurrencies" }
  | { type: "conversionPending" }
  | { type: "conversionEmpty" }
  | { type: "conversionInvalid"; message: string }
  | { type: "conversionSucceeded"; rate: number; result: number }
  | { type: "conversionFailed"; message: string };

const initialConverterState: ConverterState = {
  amount: "100",
  fromCurrency: "USD",
  toCurrency: "EUR",
  result: null,
  rate: null,
  loading: false,
  isFlipped: false,
  error: "",
};

function converterReducer(
  state: ConverterState,
  action: ConverterAction
): ConverterState {
  switch (action.type) {
    case "setAmount":
      return { ...state, amount: action.amount };
    case "setFromCurrency":
      return { ...state, fromCurrency: action.currency };
    case "setToCurrency":
      return { ...state, toCurrency: action.currency };
    case "swapCurrencies":
      return {
        ...state,
        fromCurrency: state.toCurrency,
        toCurrency: state.fromCurrency,
      };
    case "conversionPending":
      return { ...state, loading: true, error: "" };
    case "conversionEmpty":
      return {
        ...state,
        error: "",
        loading: false,
        rate: null,
        result: null,
      };
    case "conversionInvalid":
    case "conversionFailed":
      return {
        ...state,
        error: action.message,
        loading: false,
        rate: null,
        result: null,
      };
    case "conversionSucceeded":
      return {
        ...state,
        error: "",
        isFlipped: !state.isFlipped,
        loading: false,
        rate: action.rate,
        result: action.result,
      };
  }
}

export function CurrencyConverterCard() {
  const [state, dispatch] = useReducer(
    converterReducer,
    initialConverterState
  );
  const {
    amount,
    error,
    fromCurrency,
    isFlipped,
    loading,
    rate,
    result,
    toCurrency,
  } = state;

  useEffect(() => {
    const trimmed = amount.trim();

    if (!trimmed) {
      window.queueMicrotask(() => {
        dispatch({ type: "conversionEmpty" });
      });
      return;
    }

    const numericAmount = Number(trimmed);

    if (Number.isNaN(numericAmount)) {
      window.queueMicrotask(() => {
        dispatch({ type: "conversionInvalid", message: "Enter a valid amount" });
      });
      return;
    }

    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) return;
      dispatch({ type: "conversionPending" });
    });

    const timeout = window.setTimeout(() => {
      if (cancelled) return;

      const fromIndex = BASE_INDEX[fromCurrency];
      const toIndex = BASE_INDEX[toCurrency];

      if (!fromIndex || !toIndex) {
        dispatch({
          type: "conversionFailed",
          message: "Unsupported currency selection",
        });
        return;
      }

      const nextRate = toIndex / fromIndex;

      dispatch({
        type: "conversionSucceeded",
        rate: nextRate,
        result: numericAmount * nextRate,
      });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [amount, fromCurrency, toCurrency]);

  const formattedResult = useMemo(() => {
    if (result === null) return "0.00";

    return result.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [result]);

  const activeRate = useMemo(() => {
    if (!rate) return null;

    return rate.toFixed(4);
  }, [rate]);

  const handleSwap = () => {
    dispatch({ type: "swapCurrencies" });
  };

  const amountSymbol =
    CURRENCIES.find((currency) => currency.code === fromCurrency)?.symbol ??
    "$";
  const resultSymbol =
    CURRENCIES.find((currency) => currency.code === toCurrency)?.symbol ?? "$";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="group mx-auto w-full relative"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.04] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 -z-10  rounded-2xl" />
      <div className="relative overflow-hidden border border-border/60 bg-card/80 backdrop-blur  rounded-2xl">
        <div className="space-y-1 px-6 pt-6 pb-4">
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <TrendingUp className="size-6 text-primary" />
            Currency Converter
          </h2>
          <p className="text-sm text-muted-foreground">
            Conversión orientativa entre divisas
          </p>
        </div>

        <div className="space-y-6 px-6 pb-6">
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="currency-converter-amount"
            >
              From
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  {amountSymbol}
                </span>
                <input
                  id="currency-converter-amount"
	                  type="number"
	                  inputMode="decimal"
	                  value={amount}
	                  onChange={(event) =>
	                    dispatch({
	                      type: "setAmount",
	                      amount: event.target.value,
	                    })
	                  }
                  placeholder="Amount"
                  className="w-full rounded-lg border border-border bg-background/70 px-8 py-3 text-lg font-semibold text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>
              <select
	                value={fromCurrency}
	                onChange={(event) =>
	                  dispatch({
	                    type: "setFromCurrency",
	                    currency: event.target.value as CurrencyCode,
	                  })
	                }
                className="w-[132px] rounded-lg border border-border bg-background p-3 text-sm font-semibold text-foreground shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.symbol} {currency.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-center">
            <motion.button
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleSwap}
              disabled={loading}
              className="flex size-12 items-center justify-center rounded-full border border-border/70 bg-background/50 text-foreground transition hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeftRight className="size-5" />
            </motion.button>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="currency-converter-result"
            >
              To
            </label>
            <div className="flex gap-3">
              <motion.div
                key={isFlipped ? "flipped" : "stationary"}
                initial={{ rotateX: 90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="relative flex-1"
              >
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  {resultSymbol}
                </span>
                <input
                  id="currency-converter-result"
                  type="text"
                  value={formattedResult}
                  readOnly
                  className="w-full rounded-lg border border-border bg-background/60 px-8 py-3 text-lg font-semibold text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </motion.div>
              <select
	                value={toCurrency}
	                onChange={(event) =>
	                  dispatch({
	                    type: "setToCurrency",
	                    currency: event.target.value as CurrencyCode,
	                  })
	                }
                className="w-[132px] rounded-lg border border-border bg-background p-3 text-sm font-semibold text-foreground shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.symbol} {currency.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground"
            >
              <motion.span
                className="size-4 rounded-full border-2 border-muted-foreground/60 border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
              />
              Calculando tipo de cambio…
            </motion.div>
          )}

          {!loading && activeRate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-center text-sm font-medium text-primary"
            >
              1 {fromCurrency} ≈ {activeRate} {toCurrency}
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm font-medium text-destructive"
            >
              {error}
            </motion.div>
          )}

          {!loading && !error && (
            <p className="text-center text-xs text-muted-foreground">
              Tipo de cambio orientativo. Se actualiza con cada cambio.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
