function readNumber(source, path) {
  const value = path.reduce((current, key) => current?.[key], source);
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function readNumberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function compareMetric(metric, raw, computed) {
  const delta = computed - raw;
  return {
    metric,
    raw,
    computed,
    match: Math.abs(delta) < 0.01,
    delta,
  };
}

export function buildIntegrityReport(dashboardPayload, model) {
  const payload = dashboardPayload && typeof dashboardPayload === "object" ? dashboardPayload : {};
  const dashboardModel = model && typeof model === "object" ? model : {};
  const rows = [
    compareMetric("balance", readNumberValue(payload?.reportMetrics?.balance ?? payload?.balance ?? 0), readNumber(dashboardModel, ["account", "balance"])),
    compareMetric("equity", readNumberValue(payload?.reportMetrics?.equity ?? payload?.equity ?? 0), readNumber(dashboardModel, ["account", "equity"])),
    compareMetric("netProfit", readNumber(payload, ["reportMetrics", "netProfit"]), readNumber(dashboardModel, ["totals", "pnl"])),
    compareMetric("profitFactor", readNumber(payload, ["reportMetrics", "profitFactor"]), readNumber(dashboardModel, ["totals", "profitFactor"])),
    compareMetric("winRate", readNumber(payload, ["reportMetrics", "winRate"]), readNumber(dashboardModel, ["totals", "winRate"])),
    compareMetric("drawdownPct", readNumber(payload, ["reportMetrics", "drawdownPct"]), readNumber(dashboardModel, ["totals", "drawdown", "maxPct"])),
    compareMetric("totalTrades", readNumber(payload, ["reportMetrics", "totalTrades"]), readNumber(dashboardModel, ["totals", "totalTrades"])),
    compareMetric("grossProfit", readNumber(payload, ["reportMetrics", "grossProfit"]), readNumber(dashboardModel, ["totals", "grossProfit"])),
    compareMetric("grossLoss", Math.abs(readNumber(payload, ["reportMetrics", "grossLoss"])), readNumber(dashboardModel, ["totals", "grossLoss"])),
  ];

  console.table(rows);
  return rows;
}
