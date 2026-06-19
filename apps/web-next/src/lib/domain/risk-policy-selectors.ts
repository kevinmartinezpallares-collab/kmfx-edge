import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { formatPercent } from "@/lib/formatters/numbers";

export type RiskPolicyRuleControl = {
  label: string;
  value: string;
  detail: string;
  futureAction: string;
  status: "Solo aviso ahora" | "Preparado para EA" | "Desactivado";
  checked: boolean;
};

export type RiskPolicyVolumeControl = {
  label: string;
  value: string;
  detail: string;
};

export type RiskPolicySymbolControl = {
  symbol: string;
  enabled: boolean;
  exposurePct: number;
  trades: number;
  pnl: number;
  rule: "Permitido" | "Bloqueado";
};

export type RiskPolicySessionControl = {
  key: "Asia" | "London" | "New York";
  label: string;
  hours: string;
  mode: "Normal" | "Reducido" | "Bloqueado";
  effect: string;
  modeTone: string;
  size: "100%" | "50%" | "0%";
};

export type RiskPolicyControls = {
  rules: RiskPolicyRuleControl[];
  volumeControls: RiskPolicyVolumeControl[];
  symbolControls: RiskPolicySymbolControl[];
  sessionControls: RiskPolicySessionControl[];
  enabledSymbolCount: number;
  maxRiskReferencePct: number;
};

function getMaxRiskReferencePct(workspace: WorkspaceState) {
  const fundingRisks = workspace.accounts
    .map((account) => account.funding?.recommendedRiskPct)
    .filter((risk): risk is number => Number.isFinite(risk));

  return fundingRisks.length > 0 ? Math.min(...fundingRisks) : 0.5;
}

const DEFAULT_POLICY_SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "XAUUSD",
  "NAS100",
  "USDCAD",
  "AUDUSD",
  "USDJPY",
  "EURJPY",
];

function getPolicySymbols(workspace: WorkspaceState) {
  return Array.from(
    new Set([
      ...workspace.risk.exposureBySymbol.map((item) => item.symbol),
      ...workspace.trades.map((trade) => trade.symbol),
      ...DEFAULT_POLICY_SYMBOLS,
    ]),
  ).slice(0, 10);
}

export function getRiskPolicyControls(workspace: WorkspaceState): RiskPolicyControls {
  const maxRiskReferencePct = getMaxRiskReferencePct(workspace);
  const hasFundingRiskReference = workspace.accounts.some((account) =>
    Number.isFinite(account.funding?.recommendedRiskPct),
  );
  const riskReferenceValue = hasFundingRiskReference
    ? `${formatPercent(maxRiskReferencePct, 2)} máximo`
    : `Referencia base ${formatPercent(maxRiskReferencePct, 2)}`;
  const rules: RiskPolicyRuleControl[] = [
    {
      label: "Riesgo por operación",
      value: riskReferenceValue,
      detail: "Tamaño máximo permitido para el próximo trade.",
      futureAction: "Reducir lote o no entrar",
      status: "Solo aviso ahora",
      checked: true,
    },
    {
      label: "Pérdida diaria",
      value: formatPercent(workspace.risk.dailyLimitPct),
      detail: "Cuando el día llega al límite, no se añade más riesgo.",
      futureAction: "No abrir más trades",
      status: "Preparado para EA",
      checked: true,
    },
    {
      label: "Drawdown máximo",
      value: formatPercent(workspace.risk.maxLimitPct),
      detail: "Límite total de pérdida antes de parar.",
      futureAction: "Parar la cuenta",
      status: "Preparado para EA",
      checked: true,
    },
    {
      label: "Riesgo abierto máximo",
      value: formatPercent(workspace.risk.heatLimitPct),
      detail: "Riesgo total que ya está abierto en mercado.",
      futureAction: "No abrir más trades",
      status: "Preparado para EA",
      checked: true,
    },
    {
      label: "Máximo operaciones/día",
      value: "5",
      detail: "Evita operar de más cuando baja la calidad.",
      futureAction: "Hacer pausa",
      status: "Solo aviso ahora",
      checked: true,
    },
    {
      label: "Entradas sin stop loss",
      value: "No permitidas",
      detail: "Toda entrada debe tener un stop definido.",
      futureAction: "No abrir sin stop",
      status: "Preparado para EA",
      checked: true,
    },
    {
      label: "Pausa tras 2 pérdidas",
      value: "45 min",
      detail: "Corta la operativa impulsiva tras una mala racha.",
      futureAction: "Hacer pausa",
      status: "Solo aviso ahora",
      checked: true,
    },
    {
      label: "Noticias alto impacto",
      value: "15 min",
      detail: "Evita entrar cerca de noticias importantes.",
      futureAction: "No operar el evento",
      status: "Solo aviso ahora",
      checked: true,
    },
    {
      label: "Automatización MT5 futura",
      value: "Pendiente",
      detail: "Bloqueo real pendiente de activar en MT5.",
      futureAction: "Activar módulo MT5",
      status: "Desactivado",
      checked: false,
    },
  ];

  const volumeControls: RiskPolicyVolumeControl[] = [
    {
      label: "Lote máximo",
      value: "1.00",
      detail: "Tope por entrada",
    },
    {
      label: "Posiciones simultáneas",
      value: "3",
      detail: "Máximo abiertas",
    },
    {
      label: "Riesgo por símbolo",
      value: formatPercent(Math.min(workspace.risk.heatLimitPct, 1.5), 2),
      detail: "Evita concentración",
    },
    {
      label: "Operaciones por día",
      value: "5",
      detail: "Límite diario",
    },
  ];

  const symbolControls = getPolicySymbols(workspace).map<RiskPolicySymbolControl>((symbol) => {
    const exposure = workspace.risk.exposureBySymbol.find((item) => item.symbol === symbol);
    const trades = workspace.trades.filter((trade) => trade.symbol === symbol);
    const pnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
    const enabled = symbol === "EURUSD" || symbol === "GBPUSD" || Boolean(exposure);

    return {
      symbol,
      enabled,
      exposurePct: exposure?.openRiskPct ?? 0,
      trades: trades.length,
      pnl,
      rule: enabled ? "Permitido" : "Bloqueado",
    };
  });

  const sessionSeeds: Array<
    Pick<RiskPolicySessionControl, "key" | "label" | "hours" | "mode">
  > = [
    { key: "Asia", label: "Asia", hours: "00:00-08:00 CET", mode: "Normal" },
    { key: "London", label: "Londres", hours: "08:00-17:00 CET", mode: "Reducido" },
    { key: "New York", label: "Nueva York", hours: "13:00-22:00 CET", mode: "Bloqueado" },
  ];
  const sessionControls: RiskPolicySessionControl[] = sessionSeeds.map((session) => {
    const mode = session.mode.toLowerCase();
    const modeTone =
      mode === "bloqueado"
        ? "bg-destructive"
        : mode === "reducido"
          ? "bg-risk"
          : "bg-zinc-300";
    const effect =
      mode === "bloqueado"
        ? "No abrir nuevas entradas"
        : mode === "reducido"
          ? "Lote reducido y solo planes A+"
          : "Operativa normal";
    const size =
      mode === "bloqueado" ? "0%" : mode === "reducido" ? "50%" : "100%";

    return {
      ...session,
      effect,
      modeTone,
      size,
    };
  });

  return {
    rules,
    volumeControls,
    symbolControls,
    sessionControls,
    enabledSymbolCount: symbolControls.filter((row) => row.enabled).length,
    maxRiskReferencePct,
  };
}
