import type { TradingAccount } from "@/lib/contracts/account";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";

export type PortfolioAccountReadiness = {
  account: TradingAccount;
  role: string;
  riskBudgetPct: number | null;
  maxHeatPct: number | null;
  policySource: "portfolio_policy" | "funding_profile" | "requires_review";
  blockers: string[];
};

export type PortfolioPolicyReadiness = {
  status: "empty" | "partial" | "requires_review" | "ready";
  totalEquity: number;
  accountCount: number;
  explicitPortfolioCount: number;
  explicitPolicyCount: number;
  readinessPct: number;
  exportEligible: boolean;
  blockers: string[];
  accounts: PortfolioAccountReadiness[];
};

export type PortfolioAccountRow = TradingAccount & {
  sharePct: number;
};

export type PortfolioWeightRow = {
  setup: string;
  trades: number;
  pnl: number;
};

export type PortfolioSessionWeightRow = {
  session: string;
  trades: number;
  pnl: number;
};

export type PortfolioAllocationRow = {
  account: PortfolioAccountRow;
  type: "Fondeo" | "Darwinex" | "Real";
  role: string;
  allocationPct: number;
  contributionPct: number;
  riskBudgetPct: number | null;
  maxHeatPct: number | null;
  ruleSource: "Definidas" | "Heredadas" | "Revisar";
  action: "Actualizar" | "Definir reglas" | "Reducir" | "Mantener";
};

export type PortfolioStrategyPolicyRow = PortfolioWeightRow & {
  sampleLabel: "Sólida" | "Temprana" | "Pocas operaciones";
  decision: "Etiquetar" | "Observar" | "Reducir" | "Candidata";
};

export type PortfolioCapitalPoint = {
  time: number;
  value: number;
};

export type PortfolioConcentrationRow = {
  label: string;
  value: string;
  metric: string;
  state: string;
};

export type PortfolioOverview = {
  accountRows: PortfolioAccountRow[];
  totalEquity: number;
  totalPnl: number;
  portfolioReturnPct: number;
  connectedAccounts: number;
  staleAccounts: number;
  heatSharePct: number;
  largestAccount: PortfolioAccountRow | null;
  topExposure: WorkspaceState["risk"]["exposureBySymbol"][number] | null;
  portfolioReadiness: PortfolioPolicyReadiness;
  strategyWeights: PortfolioWeightRow[];
  sessionWeights: PortfolioSessionWeightRow[];
  allocationRows: PortfolioAllocationRow[];
  contributionRows: PortfolioAllocationRow[];
  strategyPolicyRows: PortfolioStrategyPolicyRow[];
  policyBlockers: string[];
  capitalCurveSeries: PortfolioCapitalPoint[];
  capitalCurveDisplaySeries: PortfolioCapitalPoint[];
  capitalCurveLatest: number;
  capitalCurveWindow: number;
  concentrationRows: PortfolioConcentrationRow[];
};

function inferAccountRole(account: TradingAccount) {
  if (account.funding?.accountMode === "funded") return "payout_protection";
  if (account.funding?.accountMode === "challenge") return "challenge";
  if (account.isFunded) return "challenge";
  return "own_capital";
}

export function formatPortfolioRole(role: string) {
  const labels: Record<string, string> = {
    lead: "Cuenta principal",
    follower: "Cuenta seguidora",
    challenge: "Reto de fondeo",
    payout_protection: "Protección de cobro",
    experimental: "Experimental",
    own_capital: "Capital propio",
    requires_review: "Revisar",
  };

  return labels[role] ?? role;
}

export function formatPortfolioBlocker(blocker: string, accounts: TradingAccount[]) {
  const [accountId, reason] = blocker.includes(":")
    ? blocker.split(":")
    : [null, blocker];
  const accountLabel = accountId
    ? accounts.find((account) => account.id === accountId)?.label
    : null;
  const labels: Record<string, string> = {
    missing_portfolio_policy: "Falta definir reglas generales de capital",
    missing_portfolio_account_policy: "Falta definir reglas para la cuenta",
    missing_risk_budget: "Falta definir riesgo asignado",
    plan_limited: "Plan limitado",
    stale_sync: "Datos desactualizados",
  };
  const readableReason = labels[reason] ?? reason;

  return accountLabel ? `${accountLabel}: ${readableReason}` : readableReason;
}

export function buildPortfolioAccountRows(workspace: WorkspaceState): PortfolioAccountRow[] {
  const totalEquity = workspace.accounts.reduce(
    (sum, account) => sum + account.equity,
    0,
  );

  return workspace.accounts.map((account) => ({
    ...account,
    sharePct: totalEquity > 0 ? (account.equity / totalEquity) * 100 : 0,
  }));
}

export function getPortfolioPolicyReadiness(
  workspace: WorkspaceState,
): PortfolioPolicyReadiness {
  const portfolioAccounts = workspace.portfolio?.accounts ?? [];
  const policies = workspace.portfolio?.policies ?? [];
  const accounts = workspace.accounts.map<PortfolioAccountReadiness>((account) => {
    const explicitAccount = portfolioAccounts.find(
      (item) => item.accountId === account.id && item.enabled,
    );
    const fundingBudget = account.funding?.recommendedRiskPct ?? null;
    const blockers = [
      explicitAccount ? null : "missing_portfolio_account_policy",
      account.planAccess === "limited" ? "plan_limited" : null,
      account.connectionState === "stale" ? "stale_sync" : null,
      !explicitAccount && fundingBudget === null ? "missing_risk_budget" : null,
    ].filter((item): item is string => Boolean(item));

    return {
      account,
      role: explicitAccount?.role ?? inferAccountRole(account),
      riskBudgetPct: explicitAccount?.riskBudgetPct ?? fundingBudget,
      maxHeatPct: explicitAccount?.maxHeatPct ?? null,
      policySource: explicitAccount
        ? "portfolio_policy"
        : fundingBudget !== null
          ? "funding_profile"
          : "requires_review",
      blockers,
    };
  });
  const resolvedAccounts = accounts.filter(
    (item) => item.policySource !== "requires_review",
  ).length;
  const readinessPct =
    accounts.length > 0 ? Math.round((resolvedAccounts / accounts.length) * 100) : 0;
  const blockers = [
    workspace.accounts.length === 0 ? "no_accounts" : null,
    policies.length === 0 ? "missing_portfolio_policy" : null,
    ...accounts.flatMap((item) =>
      item.blockers.map((blocker) => `${item.account.id}:${blocker}`),
    ),
  ].filter((item): item is string => Boolean(item));
  const status =
    workspace.accounts.length === 0
      ? "empty"
      : readinessPct > 0 && readinessPct < 100
        ? "partial"
        : blockers.length > 0
          ? "requires_review"
          : "ready";

  return {
    status,
    totalEquity: workspace.accounts.reduce((sum, account) => sum + account.equity, 0),
    accountCount: workspace.accounts.length,
    explicitPortfolioCount: workspace.portfolio?.portfolios.length ?? 0,
    explicitPolicyCount: policies.length,
    readinessPct,
    exportEligible: blockers.length === 0,
    blockers,
    accounts,
  };
}

function tradingDayKeyToEpochSeconds(tradingDayKey: string, index: number) {
  const parsed = Date.parse(`${tradingDayKey}T00:00:00.000Z`);
  return Number.isFinite(parsed)
    ? Math.floor(parsed / 1000)
    : 1_777_593_600 + index * 86_400;
}

export function getPortfolioOverview(workspace: WorkspaceState): PortfolioOverview {
  const accountRows = buildPortfolioAccountRows(workspace);
  const totalEquity = accountRows.reduce((sum, account) => sum + account.equity, 0);
  const totalPnl = accountRows.reduce((sum, account) => sum + account.totalPnl, 0);
  const portfolioReturnPct =
    totalEquity - totalPnl > 0 ? (totalPnl / (totalEquity - totalPnl)) * 100 : 0;
  const connectedAccounts = accountRows.filter(
    (account) => account.connectionState === "connected",
  ).length;
  const staleAccounts = accountRows.filter(
    (account) => account.connectionState === "stale",
  ).length;
  const heatSharePct =
    workspace.risk.heatLimitPct > 0
      ? Math.min(100, (workspace.risk.totalOpenRiskPct / workspace.risk.heatLimitPct) * 100)
      : 0;
  const largestAccount = [...accountRows].toSorted((a, b) => b.sharePct - a.sharePct)[0] ?? null;
  const topExposure =
    [...workspace.risk.exposureBySymbol].toSorted((a, b) => b.openRiskPct - a.openRiskPct)[0] ??
    null;
  const portfolioReadiness = getPortfolioPolicyReadiness(workspace);
  const strategyWeights = Object.values(
    workspace.trades.reduce<Record<string, PortfolioWeightRow>>((acc, trade) => {
      const executionCount = Math.max(1, trade.executions.length);
      const key = trade.setup ?? "Sin etiqueta";
      const current = acc[key] ?? { setup: key, trades: 0, pnl: 0 };
      current.trades += executionCount;
      current.pnl += trade.netPnl;
      acc[key] = current;
      return acc;
    }, {}),
  ).toSorted((a, b) => b.trades - a.trades);
  const sessionWeights = Object.values(
    workspace.trades.reduce<Record<string, PortfolioSessionWeightRow>>((acc, trade) => {
      const executionCount = Math.max(1, trade.executions.length);
      const current = acc[trade.session] ?? { session: trade.session, trades: 0, pnl: 0 };
      current.trades += executionCount;
      current.pnl += trade.netPnl;
      acc[trade.session] = current;
      return acc;
    }, {}),
  ).toSorted((a, b) => b.trades - a.trades);
  const allocationRows = portfolioReadiness.accounts
    .map((item): PortfolioAllocationRow => {
      const account = accountRows.find((row) => row.id === item.account.id) ?? {
        ...item.account,
        sharePct: 0,
      };
      const identity = `${account.label} ${account.broker} ${account.server}`.toLowerCase();
      const type = account.isFunded
        ? "Fondeo"
        : identity.includes("darwinex")
          ? "Darwinex"
          : "Real";
      const contributionPct =
        account.equity > 0 ? (account.totalPnl / account.equity) * 100 : 0;
      const ruleSource =
        item.policySource === "portfolio_policy"
          ? "Definidas"
          : item.policySource === "funding_profile"
            ? "Heredadas"
            : "Revisar";
      const action =
        account.connectionState === "stale"
          ? "Actualizar"
          : item.policySource === "requires_review"
            ? "Definir reglas"
            : account.totalPnl < 0
              ? "Reducir"
              : "Mantener";

      return {
        account,
        type,
        role: formatPortfolioRole(item.role),
        allocationPct: account.sharePct,
        contributionPct,
        riskBudgetPct: item.riskBudgetPct,
        maxHeatPct: item.maxHeatPct,
        ruleSource,
        action,
      };
    })
    .toSorted((a, b) => b.allocationPct - a.allocationPct);
  const contributionRows = [...allocationRows].toSorted(
    (a, b) => b.account.totalPnl - a.account.totalPnl,
  );
  const strategyPolicyRows = strategyWeights.slice(0, 5).map((strategy): PortfolioStrategyPolicyRow => {
    const sampleLabel =
      strategy.trades >= 8 ? "Sólida" : strategy.trades >= 3 ? "Temprana" : "Pocas operaciones";
    const decision =
      strategy.setup === "Sin etiqueta"
        ? "Etiquetar"
        : strategy.trades < 3
          ? "Observar"
          : strategy.pnl < 0
            ? "Reducir"
            : "Candidata";

    return {
      ...strategy,
      sampleLabel,
      decision,
    };
  });
  const policyBlockers = [
    ...portfolioReadiness.blockers.map((blocker) =>
      formatPortfolioBlocker(blocker, workspace.accounts),
    ),
    workspace.risk.allowNewTrades
      ? null
      : workspace.risk.blockingRule ?? "RiskGuard recomienda revisar riesgo",
    largestAccount && largestAccount.sharePct >= 50
      ? `Concentración alta en ${largestAccount.label}`
      : null,
    strategyWeights.some((strategy) => strategy.setup === "Sin etiqueta")
      ? "Hay operaciones sin setup; falta etiquetado para decidir asignación"
      : null,
  ].filter((item): item is string => Boolean(item));
  const totalClosedPnl = workspace.analytics.daily.reduce((sum, day) => sum + day.pnl, 0);
  const capitalCurveBase = Math.max(0, totalEquity - totalClosedPnl);
  const capitalCurveSeries = [...workspace.analytics.daily]
    .toSorted((a, b) => a.tradingDayKey.localeCompare(b.tradingDayKey))
    .reduce<{ total: number; points: PortfolioCapitalPoint[] }>(
      (acc, day, index) => {
        const nextTotal = acc.total + day.pnl;

        return {
          total: nextTotal,
          points: [
            ...acc.points,
            {
              time: tradingDayKeyToEpochSeconds(day.tradingDayKey, index),
              value: capitalCurveBase + nextTotal,
            },
          ],
        };
      },
      { total: 0, points: [] },
    ).points;
  const capitalCurveLatest = capitalCurveSeries.at(-1)?.value ?? totalEquity;
  const capitalCurveWindow = 86_400 * 14;
  const capitalCurveSampleStep = Math.floor(
    capitalCurveWindow / Math.max(2, capitalCurveSeries.length),
  );
  const capitalCurveSampleAnchor = capitalCurveSeries[0]?.time ?? 1_777_593_600;
  const capitalCurveDisplaySeries =
    capitalCurveSeries.length > 0 && capitalCurveSeries.length < 12
      ? capitalCurveSeries.map((point, index) => ({
          ...point,
          time: capitalCurveSampleAnchor + (index + 1) * Math.max(3_600, capitalCurveSampleStep),
        }))
      : capitalCurveSeries;
  const concentrationRows = [
    largestAccount
      ? {
          label: "Cuenta dominante",
          value: largestAccount.label,
          metric: `${largestAccount.sharePct.toFixed(1)}% del capital`,
          state:
            largestAccount.sharePct >= 50
              ? "Revisar concentración por cuenta"
              : "Dentro de una lectura razonable",
        }
      : null,
    topExposure
      ? {
          label: "Símbolo dominante",
          value: topExposure.symbol,
          metric: `${topExposure.openRiskPct.toFixed(2)}%`,
          state:
            topExposure.tone === "safe"
              ? "Exposición abierta controlada"
              : "Vigilar antes de añadir riesgo",
        }
      : null,
    strategyWeights[0]
      ? {
          label: "Setup más repetido",
          value: strategyWeights[0].setup,
          metric: `${strategyWeights[0].trades} operaciones`,
          state:
            strategyWeights[0].setup === "Sin etiqueta"
              ? "Falta etiquetar para decidir asignación"
              : "Cruzar con retorno antes de escalar",
        }
      : null,
    sessionWeights[0]
      ? {
          label: "Sesión principal",
          value: sessionWeights[0].session,
          metric: `${sessionWeights[0].trades} operaciones`,
          state: "Útil para aislar horarios de riesgo",
        }
      : null,
  ].filter((item): item is PortfolioConcentrationRow => Boolean(item));

  return {
    accountRows,
    totalEquity,
    totalPnl,
    portfolioReturnPct,
    connectedAccounts,
    staleAccounts,
    heatSharePct,
    largestAccount,
    topExposure,
    portfolioReadiness,
    strategyWeights,
    sessionWeights,
    allocationRows,
    contributionRows,
    strategyPolicyRows,
    policyBlockers,
    capitalCurveSeries,
    capitalCurveDisplaySeries,
    capitalCurveLatest,
    capitalCurveWindow,
    concentrationRows,
  };
}
