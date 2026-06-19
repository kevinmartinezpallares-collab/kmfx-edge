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

export type StrategyLabCommand = {
  label: string;
  command: string;
  detail: string;
};

export type StrategyFamily = {
  name: string;
  market: string;
  bestFor: string;
  status: StrategyLabStatus;
  checks: string[];
};

export type ResearchGate = {
  name: string;
  target: string;
  detail: string;
  status: StrategyLabStatus;
};

export type AccountObjective = {
  name: string;
  description: string;
  controls: string[];
};

export const strategyLabMetrics: StrategyLabMetric[] = [
  {
    label: "Fuente conectada",
    value: "Supabase",
    note: "strategy_results y ranking interno ya creados",
  },
  {
    label: "Runs reales",
    value: "0",
    note: "pendiente del primer CSV exportado desde MT5",
  },
  {
    label: "Promocion",
    value: "7 puertas",
    note: "sin EA exportable hasta pasar robustez completa",
  },
  {
    label: "Objetivos",
    value: "3 modos",
    note: "fondeo, consistencia larga y Darwinex/track record",
  },
];

export const strategyLabSteps: StrategyLabStep[] = [
  {
    id: "supabase",
    label: "Base de investigacion",
    status: "ready",
    detail: "Supabase tiene strategy_results y la vista de ranking preparada.",
  },
  {
    id: "mt5-export",
    label: "Primer backtest real",
    status: "pending",
    detail: "Exportar un CSV desde MT5 Strategy Tester a kmfx_genetic/exports.",
  },
  {
    id: "csv-ingest",
    label: "Ingesta y fitness",
    status: "ready",
    detail: "El importador calcula PF, drawdown, R:R, probabilidad y fitness.",
  },
  {
    id: "validation",
    label: "Validacion robusta",
    status: "pending",
    detail: "Faltan datasets secundarios, walk-forward y sensibilidad a costes.",
  },
  {
    id: "promotion",
    label: "EA exportable",
    status: "blocked",
    detail: "Bloqueado hasta tener muestra suficiente y validacion out-of-sample.",
  },
];

export const strategyLabCommands: StrategyLabCommand[] = [
  {
    label: "Aplicar schema",
    command: "python3 kmfx_genetic/scripts/apply_schema.py",
    detail: "Crea o actualiza la tabla de resultados en Supabase.",
  },
  {
    label: "Comprobar DB",
    command: "python3 kmfx_genetic/scripts/check_strategy_lab_db.py",
    detail: "Verifica conexion, tabla y vista de ranking.",
  },
  {
    label: "Importar ultimo CSV",
    command: "python3 kmfx_genetic/scripts/import_latest_mt5_csv.py",
    detail: "Lee el CSV mas reciente de kmfx_genetic/exports.",
  },
];

export const accountObjectives: AccountObjective[] = [
  {
    name: "Fondeo",
    description: "Prioriza pasar fase 1/fase 2 sin romper limites diarios ni max drawdown.",
    controls: ["daily loss", "max loss", "target", "min days", "consistency"],
  },
  {
    name: "Consistencia larga",
    description: "Busca curva estable, baja varianza y continuidad durante meses.",
    controls: ["expectancy", "worst month", "trade frequency", "cost sensitivity"],
  },
  {
    name: "Darwinex / track record",
    description: "Enfoque en robustez, control de riesgo y degradacion suave ante costes.",
    controls: ["drawdown smooth", "source consistency", "risk scaling", "walk-forward"],
  },
];

export const strategyFamilies: StrategyFamily[] = [
  {
    name: "ORB breakout",
    market: "NASDAQ NY Open",
    bestFor: "aperturas direccionales",
    status: "pending",
    checks: ["rango inicial", "volatilidad", "coste conservador"],
  },
  {
    name: "ORB failed breakout",
    market: "NASDAQ NY Open",
    bestFor: "trampas de liquidez",
    status: "pending",
    checks: ["falso rompimiento", "retorno al rango", "stop fijo"],
  },
  {
    name: "VWAP continuation",
    market: "US100 / NAS100",
    bestFor: "sesiones con sesgo claro",
    status: "pending",
    checks: ["distancia VWAP", "pullback", "hora NY"],
  },
  {
    name: "VWAP mean reversion",
    market: "US100 / NAS100",
    bestFor: "excesos intradia",
    status: "pending",
    checks: ["desviacion", "rechazo", "salida parcial"],
  },
  {
    name: "Liquidity sweep",
    market: "indices y FX",
    bestFor: "barridos antes de expansion",
    status: "pending",
    checks: ["high/low previo", "cierre de rechazo", "spread"],
  },
  {
    name: "Range compression breakout",
    market: "multi-activo",
    bestFor: "compresion antes de impulso",
    status: "pending",
    checks: ["ATR bajo", "expansion", "filtro horario"],
  },
];

export const researchGates: ResearchGate[] = [
  {
    name: "Muestra minima",
    target: "trades_count suficiente",
    detail: "Evita promover estrategias con pocos trades.",
    status: "pending",
  },
  {
    name: "Cross-source",
    target: "expectancy positiva",
    detail: "Debe sobrevivir a broker, simbolo equivalente y data feed alternativo.",
    status: "pending",
  },
  {
    name: "Walk-forward",
    target: "out-of-sample",
    detail: "El tramo no visto debe confirmar que no es curva bonita por azar.",
    status: "pending",
  },
  {
    name: "Costes",
    target: "spread/slippage conservador",
    detail: "Si se rompe al subir costes, no pasa a EA.",
    status: "pending",
  },
  {
    name: "Reglas de cuenta",
    target: "sin breach critico",
    detail: "Simula fondeo, consistencia larga o Darwinex segun objetivo.",
    status: "pending",
  },
  {
    name: "Robustez",
    target: "parametros vecinos",
    detail: "Penaliza estrategias que solo funcionan en un punto exacto.",
    status: "pending",
  },
  {
    name: "Promocion",
    target: "EA candidato",
    detail: "Solo exporta configuracion cuando supera todas las puertas.",
    status: "blocked",
  },
];

export function getStrategyLabReadiness(steps = strategyLabSteps) {
  const actionableSteps = steps.filter((step) => step.status !== "blocked");
  const readyCount = actionableSteps.filter((step) => step.status === "ready").length;
  return Math.round((readyCount / Math.max(actionableSteps.length, 1)) * 100);
}
