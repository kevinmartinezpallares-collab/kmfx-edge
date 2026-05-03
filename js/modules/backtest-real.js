function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function formatNumber(value, digits = 2) {
  const numeric = safeNumber(value, NaN);
  if (!Number.isFinite(numeric)) return "—";
  return numeric.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatCurrencyCompact(value) {
  const numeric = safeNumber(value, NaN);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(numeric);
}

function tradeNetPnl(trade = {}) {
  if ("net" in trade || "pnl" in trade) return safeNumber(trade.net ?? trade.pnl);
  return safeNumber(trade.profit) + safeNumber(trade.commission) + safeNumber(trade.swap);
}

function parseHour(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin hora";
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function tradeDimensionKey(trade, dimension) {
  if (dimension === "symbol") return String(trade.symbol || "UNKNOWN").toUpperCase();
  if (dimension === "hour") return parseHour(trade.closeTime || trade.close_time || trade.time || trade.date);
  if (dimension === "session") return trade.session || trade.trade_session || "Sin sesión";
  if (dimension === "direction") return String(trade.direction || trade.type || trade.side || "N/A").toUpperCase();
  return "Sin dato";
}

function calculateMaxDrawdownPct(pnls, startingEquity = 100000) {
  let equity = Math.max(safeNumber(startingEquity), 1);
  let peak = equity;
  let maxDrawdown = 0;
  pnls.forEach((pnl) => {
    equity += safeNumber(pnl);
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
  });
  return maxDrawdown;
}

function calculateSharpe(pnls, startingEquity = 100000) {
  const returns = pnls.map((pnl) => safeNumber(pnl) / Math.max(safeNumber(startingEquity), 1));
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / returns.length;
  const volatility = Math.sqrt(variance);
  return volatility > 0 ? mean / volatility : null;
}

function averageOptional(rows, keys) {
  const values = rows
    .map((row) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== ""))
    .filter((value) => value !== undefined)
    .map((value) => safeNumber(value, NaN))
    .filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateTradeMetrics(trades = [], startingEquity = 100000) {
  const pnls = trades.map(tradeNetPnl);
  const wins = pnls.filter((value) => value > 0);
  const losses = pnls.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const tradeCount = pnls.length;
  return {
    trade_count: tradeCount,
    net_pnl: pnls.reduce((sum, value) => sum + value, 0),
    profit_factor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : null,
    expectancy_amount: tradeCount ? pnls.reduce((sum, value) => sum + value, 0) / tradeCount : 0,
    expectancy_r: null,
    win_rate_pct: tradeCount ? (wins.length / tradeCount) * 100 : 0,
    max_drawdown_pct: calculateMaxDrawdownPct(pnls, startingEquity),
    sharpe_ratio: calculateSharpe(pnls, startingEquity),
    average_slippage: averageOptional(trades, ["slippage", "slippage_points", "slippage_pips"]),
    average_spread: averageOptional(trades, ["spread", "spread_points", "spread_pips"]),
    commission_per_trade: averageOptional(trades, ["commission", "commission_amount"])
  };
}

function normalizeMetrics(backtest = {}) {
  const source = backtest.metrics && typeof backtest.metrics === "object" ? backtest.metrics : backtest;
  return {
    trade_count: safeNumber(source.trade_count ?? source.total_trades ?? source.trades),
    profit_factor: safeNumber(source.profit_factor ?? source.profitFactor ?? source.pf, null),
    expectancy_amount: safeNumber(source.expectancy_amount ?? source.expectancy ?? source.avg_trade, 0),
    expectancy_r: source.expectancy_r ?? source.expectancyR ?? null,
    win_rate_pct: safeNumber(source.win_rate_pct ?? source.winRate ?? source.win_rate),
    max_drawdown_pct: safeNumber(source.max_drawdown_pct ?? source.drawdown_pct ?? source.maxDD),
    sharpe_ratio: source.sharpe_ratio ?? source.sharpe ?? null,
    average_slippage: source.average_slippage ?? source.avg_slippage ?? null,
    average_spread: source.average_spread ?? source.avg_spread ?? null,
    commission_per_trade: source.commission_per_trade ?? source.avg_commission ?? null
  };
}

function compareMetric(metric, backtestValue, realValue) {
  const backtest = backtestValue === null || backtestValue === undefined ? null : safeNumber(backtestValue, null);
  const real = realValue === null || realValue === undefined ? null : safeNumber(realValue, null);
  if (backtest === null || real === null) {
    return { metric, backtest, real, delta: null, delta_pct: null, state: "missing" };
  }
  const delta = real - backtest;
  const deltaPct = Math.abs(backtest) > 1e-9 ? (delta / Math.abs(backtest)) * 100 : null;
  const lowerIsBetter = metric === "max_drawdown_pct";
  let state = "in_range";
  if (lowerIsBetter) {
    if (deltaPct !== null && deltaPct >= 25) state = "degraded";
    if (deltaPct !== null && deltaPct <= -15) state = "improved";
  } else if (metric !== "trade_count") {
    if (deltaPct !== null && deltaPct <= -20) state = "degraded";
    if (deltaPct !== null && deltaPct >= 15) state = "improved";
  }
  return { metric, backtest, real, delta, delta_pct: deltaPct, state };
}

function compareMetricSet(backtestMetrics, realMetrics) {
  return ["trade_count", "profit_factor", "expectancy_amount", "win_rate_pct", "max_drawdown_pct", "sharpe_ratio"]
    .map((metric) => compareMetric(metric, backtestMetrics[metric], realMetrics[metric]));
}

function strategyName(backtest = {}) {
  return backtest.strategy || backtest.strategy_tag || backtest.strategyTag || backtest.name || "Sin estrategia";
}

function tradeBelongsToStrategy(trade = {}, strategy = "") {
  const needle = normalizeText(strategy);
  if (!needle) return false;
  const candidates = [
    trade.strategy_tag,
    trade.strategyTag,
    trade.setup,
    trade.comment,
    trade.magic
  ].map(normalizeText).filter(Boolean);
  return candidates.some((candidate) => candidate === needle || candidate.includes(needle) || needle.includes(candidate));
}

function compareDimension(backtest = {}, realTrades = [], dimension, startingEquity = 100000) {
  const backtestGroups = backtest.breakdowns?.[dimension] && typeof backtest.breakdowns[dimension] === "object"
    ? backtest.breakdowns[dimension]
    : {};
  const realGroups = realTrades.reduce((groups, trade) => {
    const key = tradeDimensionKey(trade, dimension);
    groups[key] = groups[key] || [];
    groups[key].push(trade);
    return groups;
  }, {});
  const keys = [...new Set([...Object.keys(backtestGroups), ...Object.keys(realGroups)])];
  return keys.map((key) => {
    const btMetrics = normalizeMetrics(backtestGroups[key] || {});
    const realMetrics = calculateTradeMetrics(realGroups[key] || [], startingEquity);
    const comparisons = compareMetricSet(btMetrics, realMetrics);
    const degradedCount = comparisons.filter((item) => item.state === "degraded").length;
    return {
      key,
      dimension,
      state: degradedCount >= 2 ? "degraded" : degradedCount === 1 ? "watch" : "in_range",
      degradation_score: degradedCount,
      real: realMetrics,
      comparisons
    };
  }).sort((a, b) => b.degradation_score - a.degradation_score || Math.abs(safeNumber(b.real.net_pnl)) - Math.abs(safeNumber(a.real.net_pnl)));
}

function diagnose(backtestMetrics, realMetrics, comparisons, dimensions, minRealTrades, minBacktestTrades) {
  if (safeNumber(backtestMetrics.trade_count) < minBacktestTrades) {
    return {
      status: "backtest_not_reliable",
      text: "Backtest con muestra insuficiente para decidir.",
      action: "Ampliar muestra antes de asignar capital."
    };
  }
  if (safeNumber(realMetrics.trade_count) < minRealTrades) {
    return {
      status: "sample_insufficient",
      text: "Muestra real insuficiente frente al umbral.",
      action: "Mantener en testing y acumular evidencia real."
    };
  }
  const degraded = comparisons.filter((item) => item.state === "degraded");
  const improved = comparisons.filter((item) => item.state === "improved");
  const worst = Object.values(dimensions).flat().find((item) => item.state === "degraded");
  if (degraded.length >= 2) {
    return {
      status: "edge_degraded",
      text: "Dos o más métricas clave se degradan frente al backtest.",
      action: worst ? `Reducir sizing y revisar ${worst.dimension}: ${worst.key}.` : "Reducir sizing y revisar ejecución."
    };
  }
  if (improved.length && !degraded.length) {
    return {
      status: "real_outperforms_backtest",
      text: "El real supera al backtest en métricas clave.",
      action: "Mantener observación; no subir riesgo solo por outperformance."
    };
  }
  return {
    status: "within_expected_variance",
    text: "Real dentro del rango operativo esperado.",
    action: "Mantener plan y seguir comparando por sesión."
  };
}

export function buildBacktestVsRealReport({
  backtests = [],
  realTrades = [],
  startingEquity = 100000,
  minRealTrades = 5,
  minBacktestTrades = 30
} = {}) {
  const strategies = backtests.map((backtest) => {
    const strategy = strategyName(backtest);
    const matchingTrades = realTrades.filter((trade) => tradeBelongsToStrategy(trade, strategy));
    const backtestMetrics = normalizeMetrics(backtest);
    const realMetrics = calculateTradeMetrics(matchingTrades, startingEquity);
    const comparisons = compareMetricSet(backtestMetrics, realMetrics);
    const dimensions = {
      symbol: compareDimension(backtest, matchingTrades, "symbol", startingEquity),
      hour: compareDimension(backtest, matchingTrades, "hour", startingEquity),
      session: compareDimension(backtest, matchingTrades, "session", startingEquity),
      direction: compareDimension(backtest, matchingTrades, "direction", startingEquity)
    };
    const diagnosis = diagnose(backtestMetrics, realMetrics, comparisons, dimensions, minRealTrades, minBacktestTrades);
    return {
      strategy,
      status: diagnosis.status,
      diagnostic_text: diagnosis.text,
      action: diagnosis.action,
      backtest: backtestMetrics,
      real: realMetrics,
      metric_comparisons: comparisons,
      dimension_breakdown: dimensions
    };
  }).sort((a, b) => (a.status !== "edge_degraded") - (b.status !== "edge_degraded") || a.strategy.localeCompare(b.strategy));

  return {
    report_type: "backtest_vs_real",
    strategy_count: strategies.length,
    diagnostic_counts: {
      edge_degraded: strategies.filter((item) => item.status === "edge_degraded").length,
      sample_insufficient: strategies.filter((item) => item.status === "sample_insufficient").length,
      backtest_not_reliable: strategies.filter((item) => item.status === "backtest_not_reliable").length,
      real_outperforms_backtest: strategies.filter((item) => item.status === "real_outperforms_backtest").length,
      within_expected_variance: strategies.filter((item) => item.status === "within_expected_variance").length
    },
    strategies
  };
}

function statusLabel(status = "") {
  switch (status) {
    case "edge_degraded":
      return "Edge degradado";
    case "sample_insufficient":
      return "Muestra baja";
    case "backtest_not_reliable":
      return "Backtest débil";
    case "real_outperforms_backtest":
      return "Real supera";
    default:
      return "En rango";
  }
}

function statusTone(status = "") {
  if (status === "edge_degraded" || status === "backtest_not_reliable") return "paused";
  if (status === "sample_insufficient") return "testing";
  if (status === "real_outperforms_backtest" || status === "within_expected_variance") return "active";
  return "testing";
}

function metricPair(label, backtest, real, formatter = formatNumber) {
  return `
    <div class="backtest-real-pair">
      <span>${escapeHtml(label)}</span>
      <strong>${formatter(backtest)}</strong>
      <strong>${formatter(real)}</strong>
    </div>
  `;
}

function worstFocus(strategy) {
  const rows = Object.values(strategy.dimension_breakdown || {}).flat();
  const degraded = rows.find((row) => row.state === "degraded") || rows.find((row) => row.state === "watch");
  if (!degraded) return "Sin foco degradado";
  return `${degraded.dimension}: ${degraded.key}`;
}

export function renderBacktestVsRealSection(report) {
  const strategies = Array.isArray(report?.strategies) ? report.strategies : [];
  return `
    <article class="tl-section-card strategies-table-card backtest-real-card">
      <div class="tl-section-header">
        <div class="strategies-section-heading">
          <div class="tl-section-title">Backtest vs Real</div>
          <div class="row-sub">Lectura lado a lado por estrategia: expectativa, ejecución real y foco donde se rompe el edge.</div>
        </div>
        <div class="backtest-real-head-tools">
          <button class="btn-secondary btn-inline strategies-action-btn" type="button" data-strategy-action="import-backtest">Importar MT5</button>
          <input type="file" accept=".html,.htm,.xml,.csv,text/html,text/csv,application/xml" multiple hidden data-backtest-import-input>
          <div class="strategies-summary" aria-label="Resumen Backtest vs Real">
            <div class="strategies-summary__item" data-tone="neutral">
              <span class="strategies-summary__label">Comparadas</span>
              <strong class="strategies-summary__value">${strategies.length}</strong>
            </div>
            <div class="strategies-summary__item" data-tone="loss">
              <span class="strategies-summary__label">Degradadas</span>
              <strong class="strategies-summary__value">${safeNumber(report?.diagnostic_counts?.edge_degraded)}</strong>
            </div>
            <div class="strategies-summary__item" data-tone="neutral">
              <span class="strategies-summary__label">Muestra baja</span>
              <strong class="strategies-summary__value">${safeNumber(report?.diagnostic_counts?.sample_insufficient)}</strong>
            </div>
          </div>
        </div>
      </div>
      ${strategies.length ? `
        <div class="table-wrap">
          <table class="backtest-real-table">
            <thead>
              <tr>
                <th>Estrategia</th>
                <th>Estado</th>
                <th>Backtest / Real</th>
                <th>Foco</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              ${strategies.map((strategy) => `
                <tr class="strategies-table-row">
                  <td>
                    <div class="table-primary-cell strategy-primary-cell">
                      <strong>${escapeHtml(strategy.strategy)}</strong>
                      <div class="row-sub">${escapeHtml(strategy.diagnostic_text)}</div>
                    </div>
                  </td>
                  <td><span class="strategy-status-chip strategy-status-chip--${statusTone(strategy.status)}">${statusLabel(strategy.status)}</span></td>
                  <td>
                    <div class="backtest-real-pairs" aria-label="Comparativa ${escapeHtml(strategy.strategy)}">
                      <div class="backtest-real-pair backtest-real-pair--head"><span>Métrica</span><strong>BT</strong><strong>Real</strong></div>
                      ${metricPair("PF", strategy.backtest.profit_factor, strategy.real.profit_factor)}
                      ${metricPair("Exp.", strategy.backtest.expectancy_amount, strategy.real.expectancy_amount, formatCurrencyCompact)}
                      ${metricPair("WR", strategy.backtest.win_rate_pct, strategy.real.win_rate_pct, (value) => `${formatNumber(value, 1)}%`)}
                      ${metricPair("DD", strategy.backtest.max_drawdown_pct, strategy.real.max_drawdown_pct, (value) => `${formatNumber(value, 2)}%`)}
                    </div>
                  </td>
                  <td>${escapeHtml(worstFocus(strategy))}</td>
                  <td><div class="row-sub">${escapeHtml(strategy.action)}</div></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="strategies-empty-state">
          <div class="strategies-empty-state__title">Sin backtests importados</div>
          <div class="strategies-empty-state__copy">Cuando exista un report MT5 Strategy Tester, esta sección comparará el backtest contra el ledger real por estrategia.</div>
        </div>
      `}
    </article>
  `;
}
