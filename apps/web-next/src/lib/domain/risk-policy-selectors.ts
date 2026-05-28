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
      detail: "Limita el tamaño de la próxima entrada.",
      futureAction: "Reducir lote / rechazar entrada",
      status: "Solo aviso ahora",
      checked: true,
    },
    {
      label: "Pérdida diaria",
      value: formatPercent(workspace.risk.dailyLimitPct),
      detail: "Si se consume el margen diario, no se añade riesgo.",
      futureAction: "Bloquear nuevas entradas",
      status: "Preparado para EA",
      checked: true,
    },
    {
      label: "Drawdown máximo",
      value: formatPercent(workspace.risk.maxLimitPct),
      detail: "Punto de supervivencia para parar la operativa.",
      futureAction: "Bloquear cuenta",
      status: "Preparado para EA",
      checked: true,
    },
    {
      label: "Riesgo abierto máximo",
      value: formatPercent(workspace.risk.heatLimitPct),
      detail: "Controla el riesgo vivo entre posiciones.",
      futureAction: "Bloquear nuevas entradas",
      status: "Preparado para EA",
      checked: true,
    },
    {
      label: "Máximo operaciones/día",
      value: "5",
      detail: "Evita sobreoperativa y decisiones por impulso.",
      futureAction: "Requerir pausa",
      status: "Solo aviso ahora",
      checked: true,
    },
    {
      label: "Entradas sin stop loss",
      value: "No permitidas",
      detail: "Avisa si una posición no trae protección definida.",
      futureAction: "Rechazar entrada sin SL",
      status: "Preparado para EA",
      checked: true,
    },
    {
      label: "Pausa tras 2 pérdidas",
      value: "45 min",
      detail: "Reduce revenge trading antes de volver a entrar.",
      futureAction: "Bloquear nuevas entradas",
      status: "Solo aviso ahora",
      checked: true,
    },
    {
      label: "Noticias alto impacto",
      value: "15 min",
      detail: "Ventana defensiva antes y después del evento.",
      futureAction: "Bloquear símbolo o sesión",
      status: "Solo aviso ahora",
      checked: true,
    },
    {
      label: "Automatización MT5 futura",
      value: "Pendiente",
      detail: "No se aplicará técnicamente hasta confirmar el paquete EA.",
      futureAction: "Aplicar reglas en terminal",
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
      detail: "Evita sobreoperativa",
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
