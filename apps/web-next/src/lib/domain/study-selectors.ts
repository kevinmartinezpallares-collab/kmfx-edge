import type { TradeSession } from "@/lib/contracts/trade";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";

export type StudyCategory =
  | "Métricas"
  | "Riesgo"
  | "Operativa"
  | "Prop Firms"
  | "Calculadora";

export type StudyLink = {
  label: string;
  href: string;
};

export type StudyGlossaryRow = {
  id: string;
  category: StudyCategory;
  term: string;
  currentValue: string;
  definition: string;
  formula: string | null;
  usedIn: StudyLink[];
  dataNeeds: string;
  interpretation: string;
  sourceLabel: string;
};

export type StudyCategorySummary = {
  category: StudyCategory;
  focus: string;
  count: number;
};

export type StudyOverview = {
  glossaryRows: StudyGlossaryRow[];
  dominantSession: TradeSession | "Pendiente";
  categorySummaries: StudyCategorySummary[];
  contextRows: string[];
  formulaNotes: Array<{
    title: string;
    body: string;
  }>;
};

const categoryFocus: Record<StudyCategory, string> = {
  Métricas: "Resultado / calidad / lectura de rendimiento",
  Riesgo: "Límites / room / exposición abierta",
  Operativa: "Sesiones / símbolos / setups / parciales",
  "Prop Firms": "Retos / límites / consistencia / cobros",
  Calculadora: "Pips / valor pip / lotaje / divisa",
};

function countUnique(values: Array<string | null>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

export function getStudyOverview(workspace: WorkspaceState): StudyOverview {
  const perf = workspace.analytics.performance;
  const totalTrades = perf.totalTrades || workspace.trades.length;
  const sessionCounts = workspace.trades.reduce<Partial<Record<TradeSession, number>>>(
    (acc, trade) => {
      acc[trade.session] = (acc[trade.session] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const dominantSession =
    Object.entries(sessionCounts).toSorted((a, b) => b[1] - a[1])[0]?.[0] ??
    "Pendiente";
  const topSymbol =
    Object.entries(
      workspace.trades.reduce<Record<string, number>>((acc, trade) => {
        acc[trade.symbol] = (acc[trade.symbol] ?? 0) + 1;
        return acc;
      }, {}),
    ).toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "Pendiente";
  const partialCloseCount = workspace.trades.filter(
    (trade) => trade.executions.length > 1,
  ).length;
  const totalVolume = workspace.trades.reduce((sum, trade) => sum + trade.volume, 0);
  const fundedAccounts = workspace.accounts.filter((account) => account.isFunded);
  const averageConsistency =
    fundedAccounts.length > 0
      ? fundedAccounts.reduce(
          (sum, account) => sum + (account.funding?.consistencyPct ?? 0),
          0,
        ) / fundedAccounts.length
      : 0;
  const payoutEntries =
    workspace.funding?.ledgerEntries.filter((entry) =>
      entry.type.startsWith("payout"),
    ) ?? [];

  const glossaryRows: StudyGlossaryRow[] = [
    {
      id: "pnl",
      category: "Métricas",
      term: "PnL",
      currentValue: formatSignedCurrency(perf.netProfit),
      definition: "Resultado neto de las operaciones cerradas dentro del periodo visible.",
      formula: "PnL neto = profit bruto + comisión + swap + otros costes disponibles.",
      usedIn: [
        { label: "Panel", href: "/dashboard" },
        { label: "Trades", href: "/trades" },
        { label: "Calendario", href: "/calendar" },
      ],
      dataNeeds: "Operaciones cerradas con profit, comisión, swap y divisa de cuenta.",
      interpretation:
        "Mira el neto antes de comparar días o setups; el bruto puede esconder costes.",
      sourceLabel: "Trade.netPnl / kmfx-data-dictionary-v1",
    },
    {
      id: "profit-factor",
      category: "Métricas",
      term: "Profit factor",
      currentValue: perf.profitFactor.toFixed(2),
      definition: "Relación entre beneficio bruto y pérdida bruta.",
      formula: "Profit factor = gross profit / abs(gross loss).",
      usedIn: [
        { label: "Panel", href: "/dashboard" },
        { label: "Insights", href: "/analytics" },
      ],
      dataNeeds: "Beneficio bruto, pérdida bruta y base net/gross coherente.",
      interpretation:
        "Un PF alto con pocas operaciones puede depender de una sola ganadora grande.",
      sourceLabel: "ReportMetrics.profitFactor / kmfx-data-dictionary-v1",
    },
    {
      id: "win-rate",
      category: "Métricas",
      term: "Win rate",
      currentValue: formatPercent(perf.winRatePct),
      definition: "Porcentaje de operaciones cerradas con resultado ganador.",
      formula: "Win rate = operaciones ganadoras / operaciones cerradas x 100.",
      usedIn: [
        { label: "Insights", href: "/analytics" },
        { label: "Playbooks", href: "/strategies" },
      ],
      dataNeeds: "Conteo de ganadoras, perdedoras y operaciones cerradas.",
      interpretation:
        "No mide por sí solo si el sistema gana dinero; léelo junto a PF y Expectancy.",
      sourceLabel: "ReportMetrics.winRate / kmfx-data-dictionary-v1",
    },
    {
      id: "expectancy",
      category: "Métricas",
      term: "Expectancy",
      currentValue: formatSignedCurrency(perf.expectancy),
      definition: "Media neta que deja cada operación cerrada.",
      formula: "Expectancy = PnL neto / operaciones cerradas.",
      usedIn: [
        { label: "Insights", href: "/analytics" },
        { label: "Playbooks", href: "/strategies" },
      ],
      dataNeeds: "PnL neto agregado y número de operaciones cerradas.",
      interpretation:
        "Sirve para comparar estilos, pero necesita volumen suficiente y costes completos.",
      sourceLabel: "analytics.performance.expectancy",
    },
    {
      id: "drawdown",
      category: "Métricas",
      term: "DD",
      currentValue: formatPercent(workspace.risk.maxDrawdownPct),
      definition: "Caída desde un pico de equity hasta el nivel actual o peor punto observado.",
      formula: "DD = (pico de equity - equity) / pico de equity x 100.",
      usedIn: [
        { label: "RiskGuard", href: "/risk" },
        { label: "Prop Firms", href: "/funding" },
      ],
      dataNeeds: "Equity, pico de equity y límite aplicable por cuenta o programa.",
      interpretation:
        "El DD explica distancia al daño; no lo confundas con pérdida diaria aislada.",
      sourceLabel: "RiskSnapshot.summary / kmfx-data-dictionary-v1",
    },
    {
      id: "score",
      category: "Métricas",
      term: "Score",
      currentValue: `${perf.score}/100`,
      definition: "Resumen normalizado de calidad para leer rendimiento sin abrir todos los detalles.",
      formula: "Score = Win rate, Profit factor normalizado y Sortino cuando está disponible.",
      usedIn: [
        { label: "Panel", href: "/dashboard" },
        { label: "Insights", href: "/analytics" },
      ],
      dataNeeds: "Win rate, Profit factor y ratio Sortino cuando el feed lo trae.",
      interpretation:
        "Úsalo como radar rápido; si cambia, abre las métricas que lo explican.",
      sourceLabel: "live-snapshot-adapter.computePerformanceScore",
    },
    {
      id: "daily-room",
      category: "Riesgo",
      term: "Margen diario",
      currentValue: formatPercent(workspace.risk.dailyRoomLeftPct),
      definition: "Distancia restante antes de tocar el límite diario configurado o informado.",
      formula: "Room diario = límite diario - DD diario usado.",
      usedIn: [
        { label: "RiskGuard", href: "/risk" },
        { label: "Prop Firms", href: "/funding" },
      ],
      dataNeeds: "Límite diario, equity intradía y motor de riesgo actualizado.",
      interpretation:
        "Cuando baja, la siguiente operación debe pasar por sizing defensivo.",
      sourceLabel: "RiskSnapshot.summary.distanceToDailyDdLimitPct",
    },
    {
      id: "open-risk",
      category: "Riesgo",
      term: "Riesgo abierto",
      currentValue: formatPercent(workspace.risk.totalOpenRiskPct),
      definition: "Riesgo agregado de las posiciones activas frente al presupuesto visible.",
      formula: "Riesgo abierto = suma del riesgo monetario abierto / equity o límite definido.",
      usedIn: [
        { label: "RiskGuard", href: "/risk" },
        { label: "Portfolio", href: "/capital" },
      ],
      dataNeeds: "Posiciones abiertas, stop loss, equity y presupuesto de riesgo.",
      interpretation:
        "Si falta stop, la lectura debe tratarse como incompleta antes de aumentar exposición.",
      sourceLabel: "RiskSnapshot.summary.totalOpenRiskPct",
    },
    {
      id: "lotaje",
      category: "Riesgo",
      term: "Lotaje",
      currentValue: `${totalVolume.toFixed(2)} lotes cerrados`,
      definition: "Volumen operado. En sizing se deriva desde riesgo permitido y distancia al stop.",
      formula: "Lotaje = riesgo monetario / (stop en pips x valor pip por lote).",
      usedIn: [
        { label: "Calculadora", href: "/tools/calculator" },
        { label: "Trades", href: "/trades" },
      ],
      dataNeeds: "Equity, riesgo %, stop, símbolo, valor pip y divisa de cuenta.",
      interpretation:
        "Mismo lotaje no significa mismo riesgo si cambia el stop o el instrumento.",
      sourceLabel: "calculateFxLotSize / contrato Calculadora",
    },
    {
      id: "risk-dd",
      category: "Riesgo",
      term: "Drawdown",
      currentValue: formatPercent(workspace.risk.dailyDrawdownPct),
      definition: "Pérdida relativa frente a una referencia de equity diaria o histórica.",
      formula: "DD usado = pérdida desde referencia / referencia x 100.",
      usedIn: [
        { label: "RiskGuard", href: "/risk" },
        { label: "Calendario", href: "/calendar" },
      ],
      dataNeeds: "Referencia de equity, equity actual y periodo correcto.",
      interpretation:
        "Separa DD diario de DD total; cada uno responde a un límite distinto.",
      sourceLabel: "RiskSnapshot.summary.dailyDrawdownPct",
    },
    {
      id: "sessions",
      category: "Operativa",
      term: "Sesiones",
      currentValue: dominantSession,
      definition: "Agrupación temporal de operaciones por Asia, London, New York o desconocida.",
      formula: null,
      usedIn: [
        { label: "Insights horario", href: "/analytics/hourly" },
        { label: "Ejecución", href: "/execution" },
      ],
      dataNeeds: "Hora de apertura/cierre normalizada y zona de sesión resuelta.",
      interpretation:
        "Sirve para detectar contexto, no para convertir una franja en señal automática.",
      sourceLabel: "Trade.session / frontend_adapter",
    },
    {
      id: "symbols",
      category: "Operativa",
      term: "Símbolos",
      currentValue: topSymbol,
      definition: "Instrumentos donde se concentra actividad, exposición o resultado.",
      formula: null,
      usedIn: [
        { label: "Mercado", href: "/market" },
        { label: "Trades", href: "/trades" },
      ],
      dataNeeds: "Símbolo normalizado en trades y posiciones abiertas.",
      interpretation:
        "Un símbolo dominante pide revisar concentración antes de abrir más riesgo similar.",
      sourceLabel: "Trade.symbol / Position.symbol",
    },
    {
      id: "setups",
      category: "Operativa",
      term: "Setups",
      currentValue: `${countUnique(workspace.trades.map((trade) => trade.setup))} activos`,
      definition: "Etiqueta operativa que agrupa una idea de entrada o playbook.",
      formula: null,
      usedIn: [
        { label: "Playbooks", href: "/strategies" },
        { label: "Review", href: "/journal" },
      ],
      dataNeeds: "Etiqueta de setup en operaciones cerradas o comentario de estrategia.",
      interpretation:
        "Sin etiqueta, la atribución baja de calidad y conviene revisar la operación.",
      sourceLabel: "Trade.setup / strategyTag",
    },
    {
      id: "partials",
      category: "Operativa",
      term: "Parciales",
      currentValue: `${partialCloseCount} con salida parcial`,
      definition: "Cierres múltiples dentro de una misma posición.",
      formula: null,
      usedIn: [
        { label: "Trades", href: "/trades" },
        { label: "Review", href: "/journal" },
      ],
      dataNeeds: "Ejecuciones agrupadas por posición o parent id.",
      interpretation:
        "Ayudan a estudiar gestión de salida, pero pueden distorsionar conteos si no se agrupan.",
      sourceLabel: "Trade.executions / partials",
    },
    {
      id: "prop-daily-room",
      category: "Prop Firms",
      term: "Margen diario",
      currentValue: fundedAccounts[0]?.funding
        ? formatPercent(fundedAccounts[0].funding.dailyRoomLeftPct)
        : "Pendiente",
      definition: "Room diario aplicado a una cuenta de reto o funded.",
      formula: "Room = límite diario de firma - pérdida diaria usada.",
      usedIn: [
        { label: "Prop Firms", href: "/funding" },
        { label: "Reglas", href: "/funding/rules" },
      ],
      dataNeeds: "Cuenta funding, fase, regla diaria y equity de referencia.",
      interpretation:
        "Es un límite operativo de defensa; no equivale a permiso para usar todo el margen.",
      sourceLabel: "FundingProfile / RiskSnapshot",
    },
    {
      id: "prop-total-limit",
      category: "Prop Firms",
      term: "Límite total",
      currentValue: fundedAccounts[0]?.funding
        ? formatPercent(fundedAccounts[0].funding.maxRoomLeftPct)
        : "Pendiente",
      definition: "Distancia al límite máximo de pérdida del programa.",
      formula: "Room total = límite máximo - DD total usado.",
      usedIn: [
        { label: "Prop Firms", href: "/funding" },
        { label: "Reglas", href: "/funding/rules" },
      ],
      dataNeeds: "Regla de firma, fase actual y DD total reconciliado.",
      interpretation:
        "Cuando el room total se estrecha, el objetivo pasa a proteger la cuenta.",
      sourceLabel: "FundingRuleSet / RiskSnapshot",
    },
    {
      id: "consistency",
      category: "Prop Firms",
      term: "Consistencia",
      currentValue: fundedAccounts.length ? formatPercent(averageConsistency) : "Pendiente",
      definition: "Control de concentración de resultado que algunas firmas usan para validar cobros o fases.",
      formula: null,
      usedIn: [
        { label: "Prop Firms", href: "/funding" },
        { label: "Payouts", href: "/funding/payouts" },
      ],
      dataNeeds: "Programa de firma, operaciones cerradas y regla versionada.",
      interpretation:
        "Debe leerse con la regla exacta de la firma; si no hay provenance, queda en revisión.",
      sourceLabel: "FundingJourney / FundingRuleSet",
    },
    {
      id: "payout",
      category: "Prop Firms",
      term: "Payout",
      currentValue: payoutEntries.length
        ? formatCurrency(
            payoutEntries.reduce(
              (sum, entry) =>
                sum + (entry.netReceivedAmount ?? entry.grossAmount ?? 0),
              0,
            ),
          )
        : "Pendiente",
      definition: "Cobro solicitado o recibido dentro del ciclo funded.",
      formula: "Neto funding = payouts - fees - resets - ajustes.",
      usedIn: [
        { label: "Payouts", href: "/funding/payouts" },
        { label: "Procesos", href: "/funding/journeys" },
      ],
      dataNeeds: "Ledger de cobros, fees, resets, refunds y estado de pago.",
      interpretation:
        "No mezcles economía de fondeo con PnL puro de trading si quieres ver rentabilidad real.",
      sourceLabel: "FundingLedgerEntry / contrato Prop Firms",
    },
    {
      id: "pips",
      category: "Calculadora",
      term: "Pips",
      currentValue: "Según símbolo",
      definition: "Unidad de movimiento usada para medir distancia de entrada, stop y objetivo.",
      formula: "Pips = abs(precio entrada - precio salida) / tamaño de pip.",
      usedIn: [{ label: "Calculadora", href: "/tools/calculator" }],
      dataNeeds: "Símbolo, precisión del instrumento y precios de entrada/salida.",
      interpretation:
        "El tamaño de pip cambia por instrumento; no reutilices el mismo supuesto en metales o índices.",
      sourceLabel: "Calculadora FX / symbol specs pendientes",
    },
    {
      id: "pip-value",
      category: "Calculadora",
      term: "Valor pip",
      currentValue: "Por divisa",
      definition: "Valor monetario de un pip para un lote del instrumento.",
      formula: "Valor pip = tamaño de pip x contrato x lotes, convertido a la divisa de cuenta.",
      usedIn: [{ label: "Calculadora", href: "/tools/calculator" }],
      dataNeeds: "Contrato del símbolo, tipo de cambio y divisa base de cuenta.",
      interpretation:
        "Si la divisa de cotización no coincide con la cuenta, necesitas conversión.",
      sourceLabel: "calculateFxLotSize / contrato Calculadora",
    },
    {
      id: "calculator-lotage",
      category: "Calculadora",
      term: "Lotaje",
      currentValue: "Desde riesgo",
      definition: "Tamaño de posición sugerido para que el stop represente el riesgo elegido.",
      formula: "Lotes = riesgo monetario / (stop pips x valor pip por lote).",
      usedIn: [
        { label: "Calculadora", href: "/tools/calculator" },
        { label: "RiskGuard", href: "/risk" },
      ],
      dataNeeds: "Equity, riesgo %, stop, símbolo y conversiones FX.",
      interpretation:
        "El resultado es apoyo de sizing; no envía órdenes ni modifica riesgo real.",
      sourceLabel: "calculateFxLotSize / contrato Calculadora",
    },
    {
      id: "currency",
      category: "Calculadora",
      term: "Divisa",
      currentValue: workspace.accounts[0]?.baseCurrency ?? "USD",
      definition: "Moneda en la que se expresa equity, riesgo y resultado de la cuenta.",
      formula: null,
      usedIn: [
        { label: "Calculadora", href: "/tools/calculator" },
        { label: "Cuentas", href: "/accounts" },
      ],
      dataNeeds: "Divisa base de cuenta y conversión cuando el par no liquida en esa moneda.",
      interpretation:
        "Comparar cuentas sin normalizar divisa puede deformar PnL y riesgo agregado.",
      sourceLabel: "TradingAccount.baseCurrency",
    },
  ];
  const categorySummaries = Object.entries(categoryFocus).map(([category, focus]) => ({
    category: category as StudyCategory,
    focus,
    count: glossaryRows.filter((row) => row.category === category).length,
  }));

  return {
    glossaryRows,
    dominantSession: dominantSession as TradeSession | "Pendiente",
    categorySummaries,
    contextRows: [
      `Sesión dominante: ${dominantSession}.`,
      `Score ${perf.score}/100 / Win rate ${formatPercent(
        perf.winRatePct,
      )} / ${totalTrades} operaciones cerradas.`,
      `Símbolo más repetido: ${topSymbol}.`,
    ],
    formulaNotes: [
      {
        title: "Provenance primero",
        body: "Cada fórmula indica qué dato necesita y de dónde sale antes de interpretarla.",
      },
      {
        title: "Lectura prudente",
        body: `Con ${totalTrades} operaciones cerradas, compara métricas relacionadas antes de decidir.`,
      },
      {
        title: "Derivación clara",
        body: "Biblioteca explica; RiskGuard protege, Insights analiza y Review cierra aprendizaje.",
      },
    ],
  };
}
