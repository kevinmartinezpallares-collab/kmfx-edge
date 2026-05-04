import { closeModal, openModal } from "./modal-system.js?v=build-20260504-070424";
import { showToast } from "./toast.js?v=build-20260504-070424";
import { describeAccountAuthority, formatCurrency, renderAuthorityNotice, selectCurrentAccount } from "./utils.js?v=build-20260504-070424";
import { kpiCardMarkup, kmfxBadgeMarkup, pageHeaderMarkup } from "./ui-primitives.js?v=build-20260504-070424";
import { buildBacktestVsRealReport } from "./backtest-real.js?v=build-20260504-070424";

const emptyForm = {
  date: "2026-03-20",
  symbol: "",
  setup: "",
  pnl: "",
  grade: "B",
  compliance: "Cumplida",
  mistake: "",
  emotion: "Neutral",
  screenshotUrl: "",
  notes: "",
  lesson: ""
};

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatPlainPct(value, digits = 2) {
  const numeric = safeNumber(value, 0);
  return `${numeric.toFixed(digits)}%`;
}

function formatSignedCurrency(value, currency) {
  const numeric = safeNumber(value, 0);
  const formatted = formatCurrency(numeric, currency);
  return numeric > 0 ? `+${formatted}` : formatted;
}

function formatMetricRatio(value, digits = 2) {
  const numeric = safeNumber(value, NaN);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "—";
}

function normalizeUiTone(tone = "neutral") {
  if (tone === "warn") return "warning";
  if (tone === "ok") return "info";
  if (["profit", "loss", "warning", "risk", "info", "neutral"].includes(tone)) return tone;
  return "neutral";
}

function sampleQualityTone(label = "") {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("alta") || normalized.includes("robusta")) return "profit";
  if (normalized.includes("baja") || normalized.includes("peque") || normalized.includes("inmadura")) return "warning";
  return "info";
}

function formatShortDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || "—";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function journalDayKey(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function upsertEntry(entries, nextEntry) {
  const index = entries.findIndex((item) => item.id === nextEntry.id);
  if (index === -1) return [nextEntry, ...entries];
  const copy = [...entries];
  copy[index] = nextEntry;
  return copy;
}

function resolveRiskSnapshot(account) {
  const direct = safeObject(account?.riskSnapshot);
  if (Object.keys(direct).length) return direct;
  return safeObject(account?.dashboardPayload?.riskSnapshot);
}

function resolveProfessionalMetrics(account) {
  return safeObject(resolveRiskSnapshot(account).professional_metrics);
}

function riskStatusLabel(snapshot) {
  const status = String(snapshot?.status?.risk_status || "pending");
  if (status === "blocked" || status === "breach") return { label: "Protección", tone: "danger" };
  if (status === "warning") return { label: "Vigilancia", tone: "warn" };
  if (status === "active_monitoring" || status === "ok") return { label: "Operable", tone: "ok" };
  return { label: "Pendiente", tone: "neutral" };
}

function tradeReviewKey(trade = {}) {
  const day = trade.tradingDayKey || journalDayKey(trade.when || trade.date || trade.time || trade.closeTime);
  const symbol = String(trade.symbol || "").trim().toUpperCase();
  const setup = String(trade.setup || trade.strategyTag || trade.strategy_tag || "").trim().toLowerCase();
  return `${day}|${symbol}|${setup}`;
}

function entryReviewKey(entry = {}) {
  const day = journalDayKey(entry.date);
  const symbol = String(entry.symbol || "").trim().toUpperCase();
  const setup = String(entry.setup || "").trim().toLowerCase();
  return `${day}|${symbol}|${setup}`;
}

function groupLeak(trades = [], keyResolver, fallbackLabel = "Sin datos") {
  const groups = new Map();
  trades.forEach((trade) => {
    const key = String(keyResolver(trade) || "").trim() || fallbackLabel;
    const current = groups.get(key) || { label: key, pnl: 0, trades: 0 };
    current.pnl += safeNumber(trade.pnl, 0);
    current.trades += 1;
    groups.set(key, current);
  });
  const rows = [...groups.values()]
    .map((item) => ({ ...item, pnl: Math.round(item.pnl * 100) / 100 }))
    .sort((a, b) => a.pnl - b.pnl);
  return rows[0] || { label: fallbackLabel, pnl: 0, trades: 0 };
}

function buildJournalCockpit(account, accountEntries, authorityMeta) {
  const model = safeObject(account.model);
  const trades = safeArray(model.trades);
  const totals = safeObject(model.totals);
  const drawdown = safeObject(totals.drawdown);
  const riskSnapshot = resolveRiskSnapshot(account);
  const riskSummary = safeObject(riskSnapshot.summary);
  const policyEvaluation = safeObject(riskSnapshot.policy_evaluation);
  const professional = resolveProfessionalMetrics(account);
  const performance = safeObject(professional.performance);
  const riskAdjusted = safeObject(professional.risk_adjusted);
  const sizing = safeObject(professional.sizing);
  const sampleQuality = safeObject(performance.sample_quality);
  const reviewEntries = accountEntries.filter((entry) => entry.sourceType !== "external_ai_response");
  const externalAiResponses = accountEntries.filter((entry) => entry.sourceType === "external_ai_response");
  const reviewKeys = new Set(reviewEntries.map(entryReviewKey));
  const recentTrades = [...trades].slice(-12).reverse();
  const unreviewedTrades = recentTrades.filter((trade) => !reviewKeys.has(tradeReviewKey(trade)));
  const dayStats = safeArray(model.dayStats);
  const redDays = dayStats.filter((day) => safeNumber(day.pnl, 0) < 0);
  const policyIssues = safeArray(policyEvaluation.breaches).length + safeArray(policyEvaluation.warnings).length;
  const allowedSessions = safeArray(account.model?.riskProfile?.allowedSessions || account.riskProfile?.allowedSessions);
  const outOfSessionTrades = allowedSessions.length
    ? trades.filter((trade) => trade.session && !allowedSessions.includes(trade.session))
    : [];
  const setupLeak = groupLeak(trades, (trade) => trade.setup || trade.strategyTag || trade.strategy_tag, "Sin setup");
  const symbolLeak = groupLeak(trades, (trade) => trade.symbol, "Sin símbolo");
  const sessionLeak = groupLeak(trades, (trade) => trade.session, "Sin sesión");
  const directionLeak = groupLeak(trades, (trade) => trade.direction || trade.side || trade.type, "Sin dirección");
  const degradedSetups = [setupLeak].filter((item) => item.pnl < 0 && item.trades >= 2).length;
  const riskMeta = riskStatusLabel(riskSnapshot);
  const firstTrade = trades[0];
  const lastTrade = trades[trades.length - 1];
  const totalPnl = safeNumber(performance.net_pnl, safeNumber(totals.pnl, 0));
  const expectancy = safeNumber(performance.expectancy_amount, safeNumber(totals.expectancy, 0));
  const profitFactor = safeNumber(performance.profit_factor, safeNumber(totals.profitFactor, NaN));
  const winRate = safeNumber(performance.win_rate_pct, safeNumber(totals.winRate, 0));
  const maxDd = safeNumber(riskSummary.peak_to_equity_drawdown_pct, safeNumber(drawdown.maxPct, 0));
  const averageR = safeNumber(performance.expectancy_r, NaN);
  const reviewedPct = trades.length ? (reviewEntries.length / trades.length) * 100 : 0;
  const dailyRead = (() => {
    if (policyIssues > 0) {
      return {
        tone: "danger",
        title: "Riesgo pide revisión primero",
        body: `${policyIssues} señales de política están activas. Revisa límites y contexto antes de añadir notas nuevas.`
      };
    }
    if (unreviewedTrades.length > 0) {
      return {
        tone: "warn",
        title: "Cola de review abierta",
        body: `${unreviewedTrades.length} trades recientes no tienen entrada asociada. Empieza por ${unreviewedTrades[0]?.symbol || "el último trade"} y deja una lección concreta.`
      };
    }
    if (setupLeak.pnl < 0) {
      return {
        tone: "warn",
        title: "Leak principal detectado",
        body: `${setupLeak.label} arrastra ${formatSignedCurrency(setupLeak.pnl, model.account?.currency)} en ${setupLeak.trades} trades. Conviene revisar patrón, sesión y sizing.`
      };
    }
    return {
      tone: "ok",
      title: expectancy >= 0 ? "Proceso documentado" : "Edge bajo presión",
      body: expectancy >= 0
        ? `Expectancy ${formatSignedCurrency(expectancy, model.account?.currency)} con ${formatPlainPct(reviewedPct, 0)} de cobertura de review.`
        : `Expectancy negativa en la muestra. Usa el diario para aislar errores repetibles.`
    };
  })();
  const nextAction = (() => {
    if (policyIssues > 0) return {
      label: "Acción",
      title: "Revisar límites",
      detail: "Validar reglas antes de operar o documentar más.",
      tone: "danger"
    };
    if (unreviewedTrades.length > 0) return {
      label: "Acción",
      title: `Review ${unreviewedTrades[0]?.symbol || "último trade"}`,
      detail: "Asocia setup, error y lección al trade pendiente.",
      tone: "warn"
    };
    if (setupLeak.pnl < 0) return {
      label: "Acción",
      title: "Aislar leak",
      detail: `${setupLeak.label} necesita regla de entrada/salida más concreta.`,
      tone: "warn"
    };
    return {
      label: "Acción",
      title: "Mantener proceso",
      detail: "Seguir revisando cada cierre antes de subir sizing.",
      tone: "ok"
    };
  })();
  const decisionRows = [
    {
      label: "Estado",
      title: dailyRead.title,
      detail: riskMeta.label,
      tone: dailyRead.tone
    },
    {
      label: "Evidencia",
      title: `${unreviewedTrades.length} reviews · ${redDays.length} días rojos`,
      detail: setupLeak.pnl < 0
        ? `${setupLeak.label} ${formatSignedCurrency(setupLeak.pnl, model.account?.currency)}`
        : `PF ${formatMetricRatio(profitFactor)} · WR ${formatPlainPct(winRate)}`,
      tone: policyIssues ? "warn" : "neutral"
    },
    nextAction
  ];
  return {
    model,
    trades,
    totals,
    riskSnapshot,
    riskMeta,
    professional,
    performance,
    riskAdjusted,
    sizing,
    sampleQuality,
    reviewEntries,
    externalAiResponses,
    recentTrades,
    unreviewedTrades,
    redDays,
    policyIssues,
    outOfSessionTrades,
    degradedSetups,
    leaks: { setupLeak, symbolLeak, sessionLeak, directionLeak },
    periodLabel: trades.length ? `${formatShortDate(firstTrade?.when || firstTrade?.date)} - ${formatShortDate(lastTrade?.when || lastTrade?.date)}` : "Sin periodo",
    sourceLabel: authorityMeta.authority.payloadSource || account.sourceType || "workspace",
    totalPnl,
    expectancy,
    profitFactor,
    winRate,
    maxDd,
    averageR,
    reviewedPct,
    dailyRead,
    decisionRows
  };
}

function reviewQueueItem(label, value, detail, tone = "neutral") {
  return `
    <div class="journal-review-item journal-review-item--${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function journalSubpageMetricCard({ label, value, detail, tone = "neutral" } = {}) {
  return `
    <article class="journal-subpage-metric" data-tone="${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function journalSubpageHeroMarkup(activePage, cockpit, currency, latestEntry, state) {
  if (activePage === "journal-review") {
    const leak = cockpit.leaks.setupLeak;
    return `
      <section class="tl-section-card journal-subpage-hero journal-subpage-hero--review" aria-label="Resumen de revisión">
        <div class="journal-subpage-hero__copy">
          <span>Review desk</span>
          <h2>${cockpit.unreviewedTrades.length ? "Prioridad antes de volver a ejecutar" : "Cola limpia"}</h2>
          <p>${cockpit.unreviewedTrades.length ? "La revisión se ordena por trades sin review, días rojos, reglas violadas y leaks de setup." : "La muestra actual no muestra bloqueos de revisión críticos."}</p>
        </div>
        <div class="journal-subpage-hero__grid">
          ${journalSubpageMetricCard({
            label: "Sin review",
            value: String(cockpit.unreviewedTrades.length),
            detail: `${cockpit.reviewedPct.toFixed(0)}% cobertura`,
            tone: cockpit.unreviewedTrades.length ? "warning" : "profit",
          })}
          ${journalSubpageMetricCard({
            label: "Días rojos",
            value: String(cockpit.redDays.length),
            detail: cockpit.redDays.length ? "Revisar contexto y gestión" : "Sin presión diaria",
            tone: cockpit.redDays.length ? "loss" : "neutral",
          })}
          ${journalSubpageMetricCard({
            label: "Reglas",
            value: String(cockpit.policyIssues),
            detail: cockpit.policyIssues ? "Hay señales de política" : "Sin alertas activas",
            tone: cockpit.policyIssues ? "loss" : "profit",
          })}
          ${journalSubpageMetricCard({
            label: "Leak principal",
            value: leak.label,
            detail: `${formatSignedCurrency(leak.pnl, currency)} · ${leak.trades} trades`,
            tone: leak.pnl < 0 ? "loss" : leak.pnl > 0 ? "profit" : "neutral",
          })}
        </div>
      </section>
    `;
  }

  if (activePage === "journal-entries") {
    return `
      <section class="tl-section-card journal-subpage-hero journal-subpage-hero--entries" aria-label="Resumen de entradas">
        <div class="journal-subpage-hero__copy">
          <span>Trade log</span>
          <h2>${latestEntry ? `${escapeHtml(latestEntry.symbol)} · ${escapeHtml(latestEntry.grade)}` : "Sin entrada manual todavía"}</h2>
          <p>${latestEntry ? escapeHtml(latestEntry.lesson || latestEntry.notes || "Última revisión registrada.") : "La página separa captura rápida, sizing y tabla de evidencia."}</p>
        </div>
        <div class="journal-subpage-hero__grid">
          ${journalSubpageMetricCard({
            label: "Entradas",
            value: String(cockpit.reviewEntries.length),
            detail: `${cockpit.trades.length} trades detectados`,
            tone: cockpit.reviewEntries.length ? "info" : "neutral",
          })}
          ${journalSubpageMetricCard({
            label: "Cobertura",
            value: `${cockpit.reviewedPct.toFixed(0)}%`,
            detail: "Reviews sobre muestra",
            tone: cockpit.reviewedPct >= 70 ? "profit" : cockpit.reviewedPct >= 35 ? "warning" : "neutral",
          })}
          ${journalSubpageMetricCard({
            label: "R medio",
            value: Number.isFinite(cockpit.averageR) ? `${cockpit.averageR.toFixed(2)}R` : "—",
            detail: "Edge normalizado",
            tone: Number.isFinite(cockpit.averageR) ? (cockpit.averageR >= 0 ? "profit" : "warning") : "neutral",
          })}
          ${journalSubpageMetricCard({
            label: "Sizing",
            value: cockpit.sizing.recommended_fractional_kelly_pct != null ? formatPlainPct(cockpit.sizing.recommended_fractional_kelly_pct) : "—",
            detail: "Kelly fraccional",
            tone: cockpit.sizing.recommended_fractional_kelly_pct != null ? "info" : "neutral",
          })}
        </div>
      </section>
    `;
  }

  if (activePage === "journal-ai-review") {
    const backtestCount = safeArray(state.workspace?.strategies?.backtests).length;
    return `
      <section class="tl-section-card journal-subpage-hero journal-subpage-hero--ai" aria-label="Resumen de reporte externo">
        <div class="journal-subpage-hero__copy">
          <span>AI evidence report</span>
          <h2>Reporte externo listo para revisión</h2>
          <p>El dashboard genera evidencia estructurada; la interpretación se hace fuera y la respuesta se guarda manualmente.</p>
        </div>
        <div class="journal-subpage-hero__grid">
          ${journalSubpageMetricCard({
            label: "Trades",
            value: String(cockpit.trades.length),
            detail: "Incluidos en evidencia",
            tone: cockpit.trades.length ? "info" : "neutral",
          })}
          ${journalSubpageMetricCard({
            label: "Reviews",
            value: String(cockpit.reviewEntries.length),
            detail: "Contexto manual",
            tone: cockpit.reviewEntries.length ? "profit" : "warning",
          })}
          ${journalSubpageMetricCard({
            label: "Backtests",
            value: String(backtestCount),
            detail: backtestCount ? "Comparativa incluida" : "Sin dataset externo",
            tone: backtestCount ? "info" : "neutral",
          })}
          ${journalSubpageMetricCard({
            label: "Respuestas",
            value: String(cockpit.externalAiResponses.length),
            detail: "Guardadas fuera del motor",
            tone: cockpit.externalAiResponses.length ? "profit" : "neutral",
          })}
        </div>
      </section>
    `;
  }

  return "";
}

function leakItem(label, leak, currency) {
  const tone = leak.pnl < 0 ? "loss" : leak.pnl > 0 ? "profit" : "neutral";
  return `
    <div class="journal-leak-item journal-leak-item--${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(leak.label)}</strong>
      <small>${formatSignedCurrency(leak.pnl, currency)} · ${leak.trades} trades</small>
    </div>
  `;
}

function readPath(source, path, fallback = null) {
  return path.reduce((value, key) => {
    if (value && typeof value === "object" && key in value) return value[key];
    return fallback;
  }, source);
}

function markdownValue(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).replaceAll("|", "/").replace(/\s+/g, " ").trim() || fallback;
}

function markdownTable(headers, rows) {
  const safeHeaders = headers.map((header) => markdownValue(header));
  const safeRows = rows.length ? rows : [headers.map(() => "-")];
  return [
    `| ${safeHeaders.join(" | ")} |`,
    `| ${safeHeaders.map(() => "---").join(" | ")} |`,
    ...safeRows.map((row) => `| ${row.map((value) => markdownValue(value)).join(" | ")} |`)
  ].join("\n");
}

function markdownPct(value, digits = 2) {
  const numeric = safeNumber(value, NaN);
  return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}%` : "-";
}

function markdownCurrency(value, currency) {
  const numeric = safeNumber(value, NaN);
  return Number.isFinite(numeric) ? formatSignedCurrency(numeric, currency) : "-";
}

function markdownMetric(value, digits = 2) {
  const numeric = safeNumber(value, NaN);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "-";
}

function maskIdentifier(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 4) return "*".repeat(text.length);
  return `${"*".repeat(Math.max(3, text.length - 4))}${text.slice(-4)}`;
}

function sanitizeFilenamePart(value) {
  return String(value || "cuenta")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "cuenta";
}

function tradeNetPnl(trade = {}) {
  if ("net" in trade || "pnl" in trade) return safeNumber(trade.net ?? trade.pnl, 0);
  return safeNumber(trade.profit, 0) + safeNumber(trade.commission, 0) + safeNumber(trade.swap, 0);
}

function journalEntryToExportTrade(entry = {}) {
  return {
    time: entry.date || entry.time || "",
    symbol: entry.symbol || "",
    setup: entry.setup || "",
    strategy_tag: entry.strategy_tag || entry.strategyTag || entry.setup || "",
    type: entry.direction || entry.type || "",
    session: entry.session || "",
    profit: safeNumber(entry.pnl, 0),
    commission: safeNumber(entry.commission, 0),
    swap: safeNumber(entry.swap, 0),
    comment: entry.lesson || entry.notes || ""
  };
}

function resolveExportTrades(account, accountEntries) {
  const modelTrades = safeArray(account?.model?.trades);
  if (modelTrades.length) return modelTrades;
  const payloadTrades = safeArray(account?.dashboardPayload?.trades);
  if (payloadTrades.length) return payloadTrades;
  return accountEntries.map(journalEntryToExportTrade);
}

function buildStrategyExportRows(cockpit, currency) {
  const groups = safeArray(readPath(cockpit.professional, ["strategy_breakdown", "groups"], []));
  return groups.map((group) => {
    const performance = safeObject(group.performance);
    const score = safeObject(group.strategy_score);
    const discipline = safeObject(group.strategy_discipline);
    const ruin = safeObject(group.risk_of_ruin);
    const drawdown = safeObject(group.drawdown_path);
    return [
      group.strategy || "Sin estrategia",
      score.status || "unknown",
      markdownMetric(score.score),
      group.sample_size ?? performance.sample_size ?? "-",
      markdownCurrency(group.net_pnl ?? performance.net_pnl, currency),
      markdownMetric(score.profit_factor ?? performance.profit_factor),
      markdownPct(score.risk_of_ruin_pct ?? ruin.analytic_ruin_probability_pct),
      markdownPct(score.max_drawdown_pct ?? drawdown.max_drawdown_pct),
      score.discipline_score != null || discipline.discipline_score != null
        ? markdownMetric(score.discipline_score ?? discipline.discipline_score, 1)
        : "-",
      markdownPct(score.discipline_coverage_pct ?? discipline.coverage_pct, 1)
    ];
  });
}

function buildBacktestExportRows(report, currency) {
  return safeArray(report?.strategies).map((strategy) => [
    strategy.strategy,
    strategy.status,
    markdownMetric(strategy.backtest?.profit_factor),
    markdownMetric(strategy.real?.profit_factor),
    markdownCurrency(strategy.backtest?.expectancy_amount, currency),
    markdownCurrency(strategy.real?.expectancy_amount, currency),
    markdownPct(strategy.backtest?.max_drawdown_pct),
    markdownPct(strategy.real?.max_drawdown_pct),
    strategy.action
  ]);
}

function buildPatternExportRows(cockpit, currency) {
  return [
    ["Setup", cockpit.leaks.setupLeak],
    ["Símbolo", cockpit.leaks.symbolLeak],
    ["Sesión", cockpit.leaks.sessionLeak],
    ["Dirección", cockpit.leaks.directionLeak]
  ].map(([dimension, leak]) => [
    dimension,
    leak.label,
    markdownCurrency(leak.pnl, currency),
    leak.trades
  ]);
}

function buildTradeEvidenceRows(trades, currency) {
  return [...trades]
    .sort((a, b) => Math.abs(tradeNetPnl(b)) - Math.abs(tradeNetPnl(a)))
    .slice(0, 12)
    .map((trade) => [
      trade.time || trade.when || trade.date || trade.closeTime || "",
      trade.symbol || "UNKNOWN",
      trade.strategy_tag || trade.strategyTag || trade.setup || trade.magic || "Sin estrategia",
      trade.type || trade.side || trade.direction || "N/A",
      markdownCurrency(tradeNetPnl(trade), currency),
      trade.comment || ""
    ]);
}

function buildJournalEvidenceRows(accountEntries, currency) {
  return accountEntries.slice(0, 8).map((entry) => [
    entry.date,
    entry.symbol,
    entry.setup,
    markdownCurrency(entry.pnl, currency),
    entry.compliance || "-",
    entry.mistake || "-",
    entry.emotion || "-",
    entry.lesson || entry.notes || "-"
  ]);
}

function buildExternalAiEvidenceMarkdown(state) {
  const account = selectCurrentAccount(state);
  if (!account) throw new Error("No hay cuenta activa para exportar.");

  const authorityMeta = describeAccountAuthority(account, "workspace");
  const entries = safeArray(state.workspace?.journal?.entries);
  const accountEntries = entries.filter((entry) => entry.accountId === account.id);
  const cockpit = buildJournalCockpit(account, accountEntries, authorityMeta);
  const accountModel = safeObject(cockpit.model.account);
  const currency = accountModel.currency || account.currency || "USD";
  const professional = safeObject(cockpit.professional);
  const performance = safeObject(cockpit.performance);
  const tailRisk = safeObject(professional.tail_risk);
  const riskOfRuin = safeObject(professional.risk_of_ruin);
  const drawdownPath = safeObject(professional.drawdown_path);
  const propFirm = safeObject(professional.prop_firm);
  const trades = resolveExportTrades(account, accountEntries);
  const backtests = safeArray(state.workspace?.strategies?.backtests);
  const startingEquity = safeNumber(accountModel.equity ?? accountModel.balance ?? account.equity ?? account.balance, 100000);
  const backtestReport = backtests.length
    ? buildBacktestVsRealReport({
      backtests,
      realTrades: trades,
      startingEquity,
      minRealTrades: 2,
      minBacktestTrades: 30
    })
    : null;
  const generatedAt = new Date().toISOString();

  return [
    "# KMFX Edge - Reporte externo para IA",
    "",
    "Uso: copiar o adjuntar este Markdown en una IA externa. KMFX no envia estos datos a ningun proveedor.",
    "",
    "## Restricciones para la IA externa",
    "- No generar senales de compra o venta.",
    "- No inventar causalidad sin evidencia.",
    "- Separar datos observados, inferencias y dudas abiertas.",
    "- Marcar muestra insuficiente cuando aplique.",
    "- Proponer acciones de proceso, riesgo y disciplina, no predicciones.",
    "- Revisar manualmente datos sensibles antes de pegar el reporte.",
    "",
    "## Cuenta y muestra",
    markdownTable(
      ["Campo", "Valor"],
      [
        ["Generado", generatedAt],
        ["Cuenta", account.name || accountModel.name || "Cuenta"],
        ["Broker", account.broker || accountModel.broker || ""],
        ["Login", maskIdentifier(account.login || accountModel.login)],
        ["Moneda", currency],
        ["Periodo", cockpit.periodLabel],
        ["Trades", trades.length],
        ["Journal entries", accountEntries.length],
        ["Trade reviews", cockpit.reviewEntries.length],
        ["Respuestas IA externas", cockpit.externalAiResponses.length],
        ["Fuente", cockpit.sourceLabel],
        ["Calidad de muestra", cockpit.sampleQuality.label || "Muestra pendiente"]
      ]
    ),
    "",
    "## Snapshot profesional",
    markdownTable(
      ["Metrica", "Valor"],
      [
        ["P&L neto", markdownCurrency(performance.net_pnl ?? cockpit.totalPnl, currency)],
        ["Win rate", markdownPct(performance.win_rate_pct ?? cockpit.winRate)],
        ["Profit factor", markdownMetric(performance.profit_factor ?? cockpit.profitFactor)],
        ["Expectancy", markdownCurrency(performance.expectancy_amount ?? cockpit.expectancy, currency)],
        ["Expectancy R", markdownMetric(performance.expectancy_r ?? cockpit.averageR)],
        ["VaR 95", markdownCurrency(readPath(tailRisk, ["var_95", "var_amount"]), currency)],
        ["VaR 99", markdownCurrency(readPath(tailRisk, ["var_99", "var_amount"]), currency)],
        ["Risk of Ruin", markdownPct(riskOfRuin.analytic_ruin_probability_pct)],
        ["Max DD", markdownPct(drawdownPath.max_drawdown_pct ?? cockpit.maxDd)],
        ["Kelly 1/4 recomendado", markdownPct(readPath(professional, ["sizing", "recommended_fractional_kelly_pct"]))]
      ]
    ),
    "",
    "## Prop firm",
    markdownTable(
      ["Regla", "Valor"],
      [
        ["Daily DD buffer", markdownPct(propFirm.daily_dd_buffer_pct)],
        ["Max DD buffer", markdownPct(propFirm.max_dd_buffer_pct)],
        ["Target progress", markdownPct(propFirm.profit_target_progress_pct)],
        ["Risk allowed after open risk", markdownPct(propFirm.risk_allowed_after_open_risk_pct)],
        ["Consistency pass", propFirm.consistency_rule_pass],
        ["Minimum days remaining", propFirm.minimum_days_remaining],
        ["Pass probability", markdownPct(readPath(propFirm, ["pass_probability", "pass_probability_pct"]))],
        ["Payout ledger net", markdownCurrency(readPath(propFirm, ["payout_ledger", "net_cashflow_amount"]), currency)]
      ]
    ),
    "",
    "## Estrategias",
    markdownTable(
      ["Estrategia", "Estado", "Score", "Trades", "P&L", "PF", "RoR", "DD", "Disciplina", "Cobertura"],
      buildStrategyExportRows(cockpit, currency)
    ),
    "",
    "## Backtest vs Real",
    backtestReport
      ? markdownTable(
        ["Estrategia", "Estado", "BT PF", "Real PF", "BT Exp", "Real Exp", "BT DD", "Real DD", "Accion"],
        buildBacktestExportRows(backtestReport, currency)
      )
      : "Sin backtests importados en el workspace.",
    "",
    "## Peores patrones",
    markdownTable(["Dimension", "Patron", "P&L", "Trades"], buildPatternExportRows(cockpit, currency)),
    "",
    "## Review queue",
    markdownTable(
      ["Item", "Valor", "Detalle"],
      [
        ["Trades sin review", cockpit.unreviewedTrades.length, cockpit.unreviewedTrades[0] ? `${cockpit.unreviewedTrades[0].symbol || "Trade"} ${markdownCurrency(cockpit.unreviewedTrades[0].pnl, currency)}` : "Cola limpia"],
        ["Días rojos", cockpit.redDays.length, cockpit.redDays.length ? `Peor día ${markdownCurrency(Math.min(...cockpit.redDays.map((day) => safeNumber(day.pnl, 0))), currency)}` : "Sin días rojos"],
        ["Reglas violadas", cockpit.policyIssues, cockpit.policyIssues ? "Hay señales del motor de riesgo" : "Sin alertas"],
        ["Setups degradados", cockpit.degradedSetups, cockpit.leaks.setupLeak.pnl < 0 ? cockpit.leaks.setupLeak.label : "Sin degradación clara"],
        ["Fuera de horario", cockpit.outOfSessionTrades.length, cockpit.outOfSessionTrades.length ? "Trades fuera de sesiones permitidas" : "Dentro de sesiones configuradas"]
      ]
    ),
    "",
    "## Trades de evidencia",
    markdownTable(["Fecha", "Símbolo", "Estrategia", "Dirección", "P&L", "Comentario"], buildTradeEvidenceRows(trades, currency)),
    "",
    "## Journal",
    markdownTable(["Fecha", "Símbolo", "Setup", "P&L", "Cumplimiento", "Error", "Emoción", "Lección"], buildJournalEvidenceRows(accountEntries, currency)),
    "",
    "## Prompt sugerido",
    "Actua como analista de proceso y riesgo para trading. No des senales de compra o venta, no predigas mercado y no inventes causalidad. Usa solo la evidencia del reporte. Quiero que revises: estado general de la cuenta, peor patron operativo, estrategias que merecen capital/pausa/mas muestra, riesgos de fondeo y un plan de mejora de 7 dias. Formato: Estado / Causa probable / Evidencia / Accion."
  ].join("\n");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn("[KMFX][JOURNAL_AI_EXPORT] Clipboard API failed", error);
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  return copied;
}

function downloadMarkdownReport(markdown, filename) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function todayInputValue() {
  return new Date().toLocaleDateString("sv-SE");
}

function summarizeExternalAiResponse(response) {
  const firstLine = String(response || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Respuesta externa guardada para revisión manual.";
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

export function initJournal(store) {
  const root = document.getElementById("journalRoot");
  if (!root) return;

  function openJournalEditor(entryId = null) {
    const state = store.getState();
    const account = selectCurrentAccount(state);
    const item = entryId ? state.workspace.journal.entries.find((entry) => entry.id === entryId) : null;
    const complianceOptions = item
      ? [...new Set(["Cumplida", "Parcial", "Rota", item.compliance].filter(Boolean))]
      : ["Cumplida", "Parcial", "Rota"];
    const form = item ? {
      date: item.date,
      symbol: item.symbol,
      setup: item.setup,
      pnl: item.pnl,
      grade: item.grade,
      compliance: item.compliance || emptyForm.compliance,
      mistake: item.mistake || "",
      emotion: item.emotion || emptyForm.emotion,
      screenshotUrl: item.screenshotUrl || "",
      notes: item.notes,
      lesson: item.lesson
    } : {
      ...emptyForm,
      date: state.workspace.journal.form.date || emptyForm.date
    };

    openModal({
      title: item ? "Editar entrada de diario" : "Nueva entrada de diario",
      subtitle: `${account?.name || "Cuenta"} · flujo local estable`,
      content: `
        <form class="modal-form-shell" data-modal-form>
        <div class="form-grid-clean">
          <label class="form-stack"><span>Fecha</span><input type="date" name="date" value="${escapeHtml(form.date)}"></label>
          <label class="form-stack"><span>Símbolo</span><input type="text" name="symbol" value="${escapeHtml(form.symbol)}"></label>
          <label class="form-stack"><span>Setup</span><input type="text" name="setup" value="${escapeHtml(form.setup)}"></label>
          <label class="form-stack"><span>PnL</span><input type="number" name="pnl" value="${escapeHtml(form.pnl)}"></label>
          <label class="form-stack"><span>Grade</span><select name="grade">
            ${["A", "B", "C"].map((grade) => `<option value="${grade}" ${form.grade === grade ? "selected" : ""}>${grade}</option>`).join("")}
          </select></label>
          <label class="form-stack"><span>Cumplimiento</span><select name="compliance">
            ${complianceOptions.map((value) => `<option value="${value}" ${form.compliance === value ? "selected" : ""}>${value}</option>`).join("")}
          </select></label>
          <label class="form-stack"><span>Error principal</span><input type="text" name="mistake" value="${escapeHtml(form.mistake)}"></label>
          <label class="form-stack"><span>Emoción</span><select name="emotion">
            ${["Calma", "Confianza", "Duda", "Ansiedad", "Impulso", "Frustración", "Neutral"].map((value) => `<option value="${value}" ${form.emotion === value ? "selected" : ""}>${value}</option>`).join("")}
          </select></label>
          <label class="form-stack form-stack-wide"><span>Notas</span><textarea name="notes" rows="3">${escapeHtml(form.notes)}</textarea></label>
          <label class="form-stack form-stack-wide"><span>Lección</span><textarea name="lesson" rows="3">${escapeHtml(form.lesson)}</textarea></label>
          <label class="form-stack form-stack-wide"><span>Screenshot opcional</span><input type="url" name="screenshotUrl" value="${escapeHtml(form.screenshotUrl)}"></label>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
          <button class="btn-primary" type="button" data-journal-modal-save="true">${item ? "Guardar cambios" : "Guardar entrada"}</button>
        </div>
        </form>
      `,
      onMount(card) {
        card.querySelector("[data-journal-modal-save='true']")?.addEventListener("click", () => {
          const payload = Object.fromEntries(new FormData(card.querySelector("[data-modal-form]")).entries());
          store.setState((prev) => {
            const entry = {
              id: item?.id || `jr-${Date.now()}`,
              accountId: account?.id || prev.currentAccount,
              ...payload,
              pnl: Number(payload.pnl || 0)
            };
            return {
              ...prev,
              workspace: {
                ...prev.workspace,
                journal: {
                  entries: upsertEntry(prev.workspace.journal.entries, entry),
                  form: { ...emptyForm },
                  editingId: null
                }
              }
            };
          });
          closeModal();
        });
      }
    });
  }

  function openExternalAiResponseEditor() {
    const state = store.getState();
    const account = selectCurrentAccount(state);

    openModal({
      title: "Guardar respuesta IA externa",
      subtitle: `${account?.name || "Cuenta"} · pegado manual`,
      maxWidth: 720,
      content: `
        <form class="modal-form-shell" data-modal-form>
        <div class="form-grid-clean">
          <label class="form-stack"><span>Fecha</span><input type="date" name="date" value="${todayInputValue()}"></label>
          <label class="form-stack"><span>Grade</span><select name="grade">
            ${["A", "B", "C"].map((grade) => `<option value="${grade}" ${grade === "B" ? "selected" : ""}>${grade}</option>`).join("")}
          </select></label>
          <label class="form-stack form-stack-wide"><span>Respuesta de IA externa</span><textarea name="response" rows="9" placeholder="Pega aquí la respuesta externa."></textarea></label>
          <label class="form-stack form-stack-wide"><span>Acción o lección</span><textarea name="lesson" rows="3" placeholder="Convierte la respuesta en una acción concreta."></textarea></label>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" type="button" data-modal-dismiss="true">Cancelar</button>
          <button class="btn-primary" type="button" data-journal-ai-response-save="true">Guardar en journal</button>
        </div>
        </form>
      `,
      onMount(card) {
        card.querySelector("[data-journal-ai-response-save='true']")?.addEventListener("click", () => {
          const payload = Object.fromEntries(new FormData(card.querySelector("[data-modal-form]")).entries());
          const response = String(payload.response || "").trim();
          if (!response) {
            showToast("Pega una respuesta antes de guardarla.", "warning");
            return;
          }
          const lesson = String(payload.lesson || "").trim() || summarizeExternalAiResponse(response);
          store.setState((prev) => {
            const entry = {
              id: `ai-response-${Date.now()}`,
              accountId: account?.id || prev.currentAccount,
              date: payload.date || todayInputValue(),
              symbol: "IA externa",
              setup: "AI Evidence Review",
              pnl: 0,
              grade: payload.grade || "B",
              compliance: "Revisión externa",
              mistake: "",
              emotion: "Neutral",
              screenshotUrl: "",
              notes: response,
              lesson,
              sourceType: "external_ai_response",
              externalAiResponse: response,
              externalAiSavedAt: new Date().toISOString()
            };
            return {
              ...prev,
              workspace: {
                ...prev.workspace,
                journal: {
                  ...prev.workspace.journal,
                  entries: upsertEntry(prev.workspace.journal.entries, entry),
                  form: { ...emptyForm },
                  editingId: null
                }
              }
            };
          });
          closeModal();
          showToast("Respuesta externa guardada en journal.", "success");
        });
      }
    });
  }

  root.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-journal-action]");
    if (!action) return;

    const { journalAction, journalId } = action.dataset;

    if (journalAction === "copy-ai-report" || journalAction === "download-ai-report") {
      event.preventDefault();
      try {
        const state = store.getState();
        const account = selectCurrentAccount(state);
        const markdown = buildExternalAiEvidenceMarkdown(state);
        if (journalAction === "copy-ai-report") {
          const copied = await copyTextToClipboard(markdown);
          showToast(copied ? "Reporte externo copiado." : "No se pudo copiar el reporte.", copied ? "success" : "warning");
        } else {
          const date = new Date().toISOString().slice(0, 10);
          downloadMarkdownReport(markdown, `kmfx-ai-evidence-${sanitizeFilenamePart(account?.name)}-${date}.md`);
          showToast("Reporte externo descargado.", "success");
        }
      } catch (error) {
        console.error("[KMFX][JOURNAL_AI_EXPORT]", error);
        showToast("No se pudo generar el reporte externo.", "warning");
      }
      return;
    }

    if (journalAction === "save-ai-response") {
      event.preventDefault();
      openExternalAiResponseEditor();
      return;
    }

    if (journalAction === "new") openJournalEditor();

    if (journalAction === "edit") {
      openJournalEditor(journalId);
    }

    if (journalAction === "delete") {
      store.setState((state) => ({
        ...state,
        workspace: {
          ...state.workspace,
          journal: {
            ...state.workspace.journal,
            entries: state.workspace.journal.entries.filter((entry) => entry.id !== journalId),
            editingId: state.workspace.journal.editingId === journalId ? null : state.workspace.journal.editingId
          }
        }
      }));
    }

  });
}

export function renderJournal(root, state) {
  const account = selectCurrentAccount(state);
  if (!account) {
    root.innerHTML = "";
    return;
  }
  const authorityMeta = describeAccountAuthority(account, "workspace");
  console.info("[KMFX][JOURNAL_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authorityMeta.authority.payloadSource,
    tradeCount: authorityMeta.authority.tradeCount,
    sourceUsed: "workspace_journal",
  });

  const { entries } = state.workspace.journal;
  const accountEntries = entries.filter((entry) => entry.accountId === account.id);
  const cockpit = buildJournalCockpit(account, accountEntries, authorityMeta);
  const currency = cockpit.model.account?.currency;
  const latestEntry = accountEntries[0];
  const activePage = state.ui.activePage || "journal";
  const pageTitle = activePage === "journal-review"
    ? "Review Queue"
    : activePage === "journal-entries"
      ? "Entradas"
      : activePage === "journal-ai-review"
        ? "AI Review"
        : "Journal Cockpit";
  const pageDescription = activePage === "journal-review"
    ? "Cola de revisión, leaks y prioridades antes de volver a operar."
    : activePage === "journal-entries"
      ? "Registro manual de entradas, lecciones y evidencia post-trade."
      : activePage === "journal-ai-review"
        ? "Reporte Markdown para enviar fuera del dashboard a una IA externa."
        : "Centro diario de revisión, leaks y lectura profesional de la cuenta activa.";
  const showCockpit = activePage === "journal";
  const showReview = activePage === "journal" || activePage === "journal-review";
  const showEntries = activePage === "journal" || activePage === "journal-entries";
  const showAiExport = activePage === "journal-ai-review";
  const showLeaks = activePage === "journal" || activePage === "journal-review";
  const journalSubpageClass = showCockpit ? "" : ` kmfx-subpage-shell kmfx-subpage-shell--${activePage}`;
  const journalSubpageAttr = showCockpit ? "" : ` data-kmfx-subpage="${activePage}"`;

  root.innerHTML = `
    <div class="journal-page-stack${journalSubpageClass}"${journalSubpageAttr}>
    ${pageHeaderMarkup({
      title: pageTitle,
      description: pageDescription,
      className: "tl-page-header",
      titleClassName: "tl-page-title",
      descriptionClassName: "tl-page-sub",
      actionsClassName: "page-actions",
      actionsHtml: `
        ${kmfxBadgeMarkup({
          text: cockpit.sampleQuality.label || "Muestra pendiente",
          tone: sampleQualityTone(cockpit.sampleQuality.label),
          className: "journal-sample-badge"
        })}
        <button class="btn-primary" data-journal-action="new">Nueva entrada</button>
      `,
    })}

    ${renderAuthorityNotice(authorityMeta)}
    ${journalSubpageHeroMarkup(activePage, cockpit, currency, latestEntry, state)}

    <div class="journal-cockpit">
      ${showCockpit ? `
      <section class="tl-section-card journal-cockpit-hero journal-cockpit-hero--${cockpit.dailyRead.tone}">
        <div class="journal-cockpit-hero__copy">
          <span>Daily read</span>
          <h3>${escapeHtml(cockpit.dailyRead.title)}</h3>
          <p>${escapeHtml(cockpit.dailyRead.body)}</p>
          <div class="journal-cockpit-hero__ops">
            ${cockpit.decisionRows.map((row) => `
              <div class="journal-cockpit-hero__op-row journal-cockpit-hero__op-row--${escapeHtml(row.tone)}">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(row.title)}</strong>
                <small>${escapeHtml(row.detail)}</small>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="journal-cockpit-hero__meta">
          <div>
            <span>Cuenta</span>
            <strong>${escapeHtml(account.name)}</strong>
          </div>
          <div>
            <span>Periodo</span>
            <strong>${escapeHtml(cockpit.periodLabel)}</strong>
          </div>
          <div>
            <span>Trades</span>
            <strong>${cockpit.trades.length}</strong>
          </div>
          <div class="journal-risk-state journal-risk-state--${cockpit.riskMeta.tone}">
            <span>Riesgo</span>
            <strong>${escapeHtml(cockpit.riskMeta.label)}</strong>
          </div>
        </div>
      </section>
      ` : ""}

      ${showCockpit ? `
      <section class="journal-professional-strip">
        ${[
          { label: "P&L", value: formatSignedCurrency(cockpit.totalPnl, currency), tone: cockpit.totalPnl >= 0 ? "profit" : "loss", meta: "Neto sample" },
          { label: "Max DD", value: formatPlainPct(cockpit.maxDd), tone: cockpit.maxDd >= 6 ? "loss" : cockpit.maxDd >= 3 ? "warning" : "neutral", meta: "Presión curva" },
          { label: "Win rate", value: formatPlainPct(cockpit.winRate), tone: cockpit.winRate >= 50 ? "profit" : "warning", meta: "Eficiencia" },
          { label: "Profit factor", value: formatMetricRatio(cockpit.profitFactor), tone: Number.isFinite(cockpit.profitFactor) ? (cockpit.profitFactor >= 1.4 ? "profit" : cockpit.profitFactor >= 1 ? "warning" : "loss") : "neutral", meta: "Sostenibilidad" },
          { label: "Expectancy", value: formatSignedCurrency(cockpit.expectancy, currency), tone: cockpit.expectancy >= 0 ? "profit" : "loss", meta: "Por trade" },
          { label: "R medio", value: Number.isFinite(cockpit.averageR) ? `${cockpit.averageR.toFixed(2)}R` : "—", tone: Number.isFinite(cockpit.averageR) ? (cockpit.averageR >= 0 ? "profit" : "warning") : "neutral", meta: "Edge normalizado" },
          { label: "Revisados", value: `${cockpit.reviewEntries.length}/${cockpit.trades.length || 0}`, tone: cockpit.reviewedPct >= 70 ? "profit" : cockpit.reviewedPct >= 35 ? "warning" : "neutral", meta: "Cobertura journal" }
        ].map((item) => kpiCardMarkup({
          label: item.label,
          value: item.value,
          tone: normalizeUiTone(item.tone),
          meta: item.meta,
          className: "journal-kpi-card"
        })).join("")}
      </section>
      ` : ""}

      ${showReview || showEntries ? `
      <div class="journal-cockpit-grid">
        ${showReview ? `
        <article class="tl-section-card journal-review-queue">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">Review Queue</div>
              <div class="row-sub">Qué revisar primero antes de añadir más operativa.</div>
            </div>
          </div>
          <div class="journal-review-list">
            ${reviewQueueItem("Trades sin review", String(cockpit.unreviewedTrades.length), cockpit.unreviewedTrades[0] ? `${cockpit.unreviewedTrades[0].symbol || "Trade"} · ${formatSignedCurrency(cockpit.unreviewedTrades[0].pnl, currency)}` : "Cola limpia", cockpit.unreviewedTrades.length ? "warn" : "ok")}
            ${reviewQueueItem("Días rojos", String(cockpit.redDays.length), cockpit.redDays[0] ? `Peor día ${formatSignedCurrency(Math.min(...cockpit.redDays.map((day) => safeNumber(day.pnl, 0))), currency)}` : "Sin días rojos en muestra", cockpit.redDays.length ? "warn" : "ok")}
            ${reviewQueueItem("Reglas violadas", String(cockpit.policyIssues), cockpit.policyIssues ? "Hay señales del motor de riesgo" : "Sin alertas de política", cockpit.policyIssues ? "danger" : "ok")}
            ${reviewQueueItem("Setups degradados", String(cockpit.degradedSetups), cockpit.leaks.setupLeak.pnl < 0 ? cockpit.leaks.setupLeak.label : "Sin degradación clara", cockpit.degradedSetups ? "warn" : "ok")}
            ${reviewQueueItem("Fuera de horario", String(cockpit.outOfSessionTrades.length), cockpit.outOfSessionTrades.length ? "Trades fuera de sesiones permitidas" : "Dentro de sesiones configuradas", cockpit.outOfSessionTrades.length ? "warn" : "ok")}
          </div>
        </article>
        ` : ""}

        ${showEntries ? `
        <article class="tl-section-card journal-daily-panel">
          <div class="tl-section-header">
            <div>
              <div class="tl-section-title">Entrada rápida post-trade</div>
              <div class="row-sub">Captura decisión, error y lección sin convertir el diario en burocracia.</div>
            </div>
          </div>
          <div class="journal-quick-entry">
            <div>
              <span>Última entrada</span>
              <strong>${latestEntry ? `${escapeHtml(latestEntry.symbol)} · ${escapeHtml(latestEntry.grade)}` : "Sin entrada todavía"}</strong>
              <small>${latestEntry ? escapeHtml(latestEntry.lesson || latestEntry.notes || "Revisión guardada") : "Empieza por el trade más reciente sin review."}</small>
            </div>
            <button class="btn-secondary" data-journal-action="new">Abrir editor</button>
          </div>
          <div class="journal-sizing-read">
            <span>Supervivencia</span>
            <strong>${cockpit.sizing.recommended_fractional_kelly_pct != null ? `${formatPlainPct(cockpit.sizing.recommended_fractional_kelly_pct)} Kelly 1/4` : "Sizing pendiente"}</strong>
            <small>${cockpit.sizing.weekly_risk_budget_remaining_pct != null ? `${formatPlainPct(cockpit.sizing.weekly_risk_budget_remaining_pct)} margen hasta ruina` : "Esperando política de riesgo"}</small>
          </div>
        </article>
        ` : ""}
      </div>
      ` : ""}

      ${showAiExport ? `
      <article class="tl-section-card journal-ai-export-panel">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">AI Evidence Export</div>
            <div class="row-sub">Reporte Markdown para analizar fuera del dashboard, con riesgo, disciplina, journal y backtest si existe.</div>
          </div>
          <div class="journal-ai-export-actions">
            <button class="btn-secondary btn-inline" type="button" data-journal-action="copy-ai-report">Copiar report</button>
            <button class="btn-secondary btn-inline" type="button" data-journal-action="download-ai-report">Descargar .md</button>
            <button class="btn-secondary btn-inline" type="button" data-journal-action="save-ai-response">Pegar respuesta</button>
          </div>
        </div>
        <div class="journal-ai-export-grid">
          <div class="journal-ai-export-item">
            <span>Formato</span>
            <strong>Markdown</strong>
            <small>Listo para pegar en IA externa</small>
          </div>
          <div class="journal-ai-export-item">
            <span>Evidencia</span>
            <strong>${cockpit.trades.length} trades · ${cockpit.reviewEntries.length} reviews</strong>
            <small>${cockpit.externalAiResponses.length} respuestas externas guardadas</small>
          </div>
          <div class="journal-ai-export-item">
            <span>Backtest</span>
            <strong>${safeArray(state.workspace?.strategies?.backtests).length}</strong>
            <small>Comparativa incluida si existe dataset</small>
          </div>
        </div>
      </article>
      ` : ""}

      ${showLeaks ? `
      <article class="tl-section-card journal-leaks-panel">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Top leaks</div>
            <div class="row-sub">Mayor fuga por setup, símbolo, sesión y dirección.</div>
          </div>
        </div>
        <div class="journal-leaks-grid">
          ${leakItem("Setup", cockpit.leaks.setupLeak, currency)}
          ${leakItem("Símbolo", cockpit.leaks.symbolLeak, currency)}
          ${leakItem("Sesión", cockpit.leaks.sessionLeak, currency)}
          ${leakItem("Dirección", cockpit.leaks.directionLeak, currency)}
        </div>
      </article>
      ` : ""}

      ${showEntries ? `
      <article class="tl-section-card journal-recent-panel">
        <div class="tl-section-header">
          <div>
            <div class="tl-section-title">Entradas recientes</div>
            <div class="row-sub">Detalle secundario. El cockpit decide la prioridad.</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Símbolo</th><th>Setup</th><th>PnL</th><th>Grade</th><th>Lección</th><th>Acciones</th></tr></thead>
            <tbody>
              ${accountEntries.length ? accountEntries.map((entry) => `
                <tr>
                  <td>${escapeHtml(entry.date)}</td>
                  <td>${escapeHtml(entry.symbol)}</td>
                  <td>${escapeHtml(entry.setup)}</td>
                  <td class="${entry.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(entry.pnl, currency)}</td>
                  <td>${escapeHtml(entry.grade)}</td>
                  <td>${escapeHtml(entry.lesson)}</td>
                  <td>
                    <div class="table-actions">
                      <button class="btn-secondary btn-inline" data-journal-action="edit" data-journal-id="${escapeHtml(entry.id)}">Editar</button>
                      <button class="btn-secondary btn-inline" data-journal-action="delete" data-journal-id="${escapeHtml(entry.id)}">Borrar</button>
                    </div>
                  </td>
                </tr>
              `).join("") : `
                <tr>
                  <td colspan="7">
                    <div class="journal-empty-row">Sin entradas para esta cuenta. Crea la primera revisión desde el botón superior.</div>
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </article>
      ` : ""}
    </div>
    </div>
  `;
}
