export type StrategyLabStatus = "ready" | "pending" | "blocked";

export type StrategyLabMetric = {
  label: string;
  value: string;
  note: string;
};

export type StrategyLabStep = {
  id: string;
  label: string;
  status: StrategyLabStatus;
  detail: string;
};

export type StrategyLabGeneBlock = {
  block: string;
  role: string;
  options: string[];
};

export type StrategyLabCommand = {
  label: string;
  command: string;
};

export type StrategyLabCandidate = {
  rank: string;
  symbol: string;
  timeframe: string;
  genes: string;
  score: string;
  status: string;
};

export const strategyLabMetrics: StrategyLabMetric[] = [
  {
    label: "Espacio total",
    value: "~2.02M",
    note: "22.500 combinaciones x simbolo, TF y direccion",
  },
  {
    label: "Pool inicial",
    value: "200",
    note: "individuos por generacion segun .env",
  },
  {
    label: "Survivors",
    value: "10",
    note: "top candidatos que mutan la siguiente ronda",
  },
  {
    label: "Promocion",
    value: "50+",
    note: "fitness minimo para passed=true",
  },
];

export const strategyLabSteps: StrategyLabStep[] = [
  {
    id: "postgres",
    label: "PostgreSQL Hetzner",
    status: "pending",
    detail: "Crear DB kmfx_algo y ejecutar kmfx_genetic/schema.sql.",
  },
  {
    id: "ea",
    label: "EA MQL5",
    status: "ready",
    detail: "Genetic_EA.ex5 compilado con MetaEditor: 0 errores, 0 warnings.",
  },
  {
    id: "env",
    label: ".env local",
    status: "pending",
    detail: "Configurar DB_URL, MT5_FILES_PATH y parametros de generacion.",
  },
  {
    id: "first-run",
    label: "Primera generacion",
    status: "pending",
    detail: "Ejecutar python core/orchestrator.py y comprobar result.json.",
  },
  {
    id: "dashboard",
    label: "Panel interno",
    status: "ready",
    detail: "Ruta /strategy-lab protegida por Gmail admin y feature flag.",
  },
];

export const strategyLabGeneBlocks: StrategyLabGeneBlock[] = [
  {
    block: "A",
    role: "Tendencia",
    options: ["ema50_slope", "ema_cross_2050", "ema_cross_50200", "adx_25", "none"],
  },
  {
    block: "B",
    role: "Estructura",
    options: ["asian_range", "london_range", "prev_day_hl", "bollinger", "none"],
  },
  {
    block: "C",
    role: "Entrada",
    options: ["breakout", "reversion", "ob_fvg", "pullback_ema", "candle_pattern", "rsi_extreme"],
  },
  {
    block: "D",
    role: "Sesion",
    options: ["asian", "london_open", "ny_open", "overlap", "any"],
  },
  {
    block: "E",
    role: "Riesgo",
    options: ["rr_1_2", "rr_1_3", "rr_1_4", "atr_dynamic", "trailing_stop", "be_at_1r"],
  },
  {
    block: "F",
    role: "Confirmacion",
    options: ["candle_close", "volume_spike", "spread_filter", "mtf_confirm", "none"],
  },
];

export const strategyLabCommands: StrategyLabCommand[] = [
  {
    label: "Hetzner schema",
    command: "psql -U trading -d kmfx_algo -f kmfx_genetic/schema.sql",
  },
  {
    label: "Entorno Python",
    command: "cd kmfx_genetic && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt",
  },
  {
    label: "Compilar EA",
    command: "kmfx_genetic/scripts/compile_genetic_ea.sh",
  },
  {
    label: "Config local",
    command: "cp .env.example .env",
  },
  {
    label: "Primera generacion",
    command: "python core/orchestrator.py",
  },
];

export const strategyLabCandidatePlaceholders: StrategyLabCandidate[] = [
  {
    rank: "1",
    symbol: "EURUSD",
    timeframe: "H1",
    genes: "pendiente de PostgreSQL",
    score: "-",
    status: "sin runs",
  },
  {
    rank: "2",
    symbol: "GBPUSD",
    timeframe: "M15",
    genes: "pendiente de PostgreSQL",
    score: "-",
    status: "sin runs",
  },
  {
    rank: "3",
    symbol: "USDJPY",
    timeframe: "H4",
    genes: "pendiente de PostgreSQL",
    score: "-",
    status: "sin runs",
  },
];

export function getStrategyLabReadiness(steps = strategyLabSteps) {
  const readyCount = steps.filter((step) => step.status === "ready").length;
  return Math.round((readyCount / steps.length) * 100);
}
