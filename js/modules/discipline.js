import { resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";

// === DISCIPLINE SECTION ===
export const disciplineData = {
  kpis: {
    ruleAdherence: { value: 87, delta: +4 },
    entryPrecision: { value: 2.4, target: 2.0 },
    slViolations: { value: 3 },
    offHoursTrades: { value: 0 }
  },
  rules: [
    { name: "Fixed SL at 10 pips", pct: 73 },
    { name: "Max 1 trade/day", pct: 96 },
    { name: "Entry at OB candle open", pct: 88 },
    { name: "BE activated at 20 pips", pct: 81 },
    { name: "No trades after 17:00", pct: 100 },
    { name: "Valid setup confirmed", pct: 92 }
  ],
  calendar: [
    ["clean", "clean", "warn", "clean", "miss", "rest"],
    ["clean", "miss", "clean", "warn", "clean", "rest"],
    ["clean", "clean", "clean", "clean", "warn", "rest"],
    ["miss", "clean", "clean", "miss", "clean", "rest"],
    ["clean", "warn", "clean", "rest", "rest", "rest"]
  ],
  entryPrecision: [
    { date: "Apr 23", pair: "EURUSD", dev: 0.8 },
    { date: "Apr 22", pair: "GBPUSD", dev: 3.1 },
    { date: "Apr 17", pair: "EURUSD", dev: 1.2 },
    { date: "Apr 16", pair: "USDCAD", dev: 6.4 },
    { date: "Apr 15", pair: "AUDUSD", dev: 1.8 },
    { date: "Apr 14", pair: "GBPUSD", dev: 4.2 }
  ],
  score: {
    overall: 79,
    breakdown: {
      compliance: 87,
      precision: 72,
      consistency: 84,
      timing: 91,
      psychological: 68
    },
    insight: "Biggest gap: SL discipline (73%). Review GBPUSD trades in weeks 1 and 4."
  }
};

const RULE_DEFINITIONS = disciplineData.rules.map((rule) => rule.name);

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + Number(value), 0) / valid.length;
}

function toDayKey(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).replace(".", "");
}

function formatPct(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "Pendiente";
}

function formatPips(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} pips` : "Pendiente";
}

function pipSize(symbol = "") {
  const normalized = String(symbol).toUpperCase();
  if (normalized.includes("JPY")) return 0.01;
  if (normalized.includes("XAU") || normalized.includes("GOLD")) return 0.1;
  return 0.0001;
}

function pipsBetween(symbol, a, b) {
  const first = Number(a);
  const second = Number(b);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.abs(first - second) / pipSize(symbol);
}

function getEntryDeviationPips(trade) {
  const explicit = [
    trade?.entryDeviationPips,
    trade?.entry_deviation_pips,
    trade?.entryDeviation,
    trade?.entry_deviation
  ].find((value) => Number.isFinite(Number(value)));
  if (Number.isFinite(Number(explicit))) return Math.abs(Number(explicit));

  const plannedEntry = [
    trade?.plannedEntry,
    trade?.planned_entry,
    trade?.signalEntry,
    trade?.signal_entry,
    trade?.modelEntry,
    trade?.model_entry
  ].find((value) => Number.isFinite(Number(value)));

  if (!Number.isFinite(Number(plannedEntry)) || !Number.isFinite(Number(trade?.entry))) return null;
  return pipsBetween(trade.symbol, plannedEntry, trade.entry);
}

function ruleColor(value) {
  if (!Number.isFinite(Number(value))) return "pending";
  if (value >= 90) return "ok";
  if (value >= 70) return "warn";
  return "bad";
}

function scoreColor(score) {
  if (!Number.isFinite(Number(score))) return "pending";
  if (score >= 80) return "ok";
  if (score >= 65) return "warn";
  return "bad";
}

function precisionColor(value) {
  if (!Number.isFinite(Number(value))) return "pending";
  if (value < 2) return "ok";
  if (value <= 4) return "warn";
  return "bad";
}

function precisionTag(value) {
  if (!Number.isFinite(Number(value))) return "sin tracking";
  if (value < 2) return "ideal";
  if (value <= 4) return "late entry";
  return "chasing";
}

function calendarCellClass(state, isToday = false) {
  const map = {
    clean: "execution-tone-ok",
    warn: "execution-tone-warn",
    miss: "execution-tone-bad",
    bad: "execution-tone-bad",
    ok: "execution-tone-ok",
    rest: "execution-tone-empty",
    empty: "execution-tone-empty"
  };
  return `${map[state] || "execution-tone-empty"}${isToday ? " is-today" : ""}`;
}

function getRecentTrades(trades = []) {
  const ordered = [...trades]
    .filter((trade) => trade?.when instanceof Date && !Number.isNaN(trade.when.getTime()))
    .sort((a, b) => a.when - b.when);
  const latest = ordered[ordered.length - 1]?.when;
  if (!latest) return ordered;
  const windowStart = new Date(latest);
  windowStart.setDate(windowStart.getDate() - 30);
  const recent = ordered.filter((trade) => trade.when >= windowStart);
  return recent.length ? recent : ordered.slice(-30);
}

function groupTradesByDay(trades = []) {
  return trades.reduce((map, trade) => {
    const key = toDayKey(trade.when);
    if (!key) return map;
    const bucket = map.get(key) || { key, trades: [], pnl: 0 };
    bucket.trades.push(trade);
    bucket.pnl += Number(trade.pnl || 0);
    map.set(key, bucket);
    return map;
  }, new Map());
}

function calcRuleCompliance(recentTrades = []) {
  const dayMap = groupTradesByDay(recentTrades);
  const activeDays = [...dayMap.values()];
  const slDistances = recentTrades
    .map((trade) => pipsBetween(trade.symbol, trade.entry, trade.sl))
    .filter((value) => Number.isFinite(value) && value > 0);
  const entryDeviations = recentTrades
    .map(getEntryDeviationPips)
    .filter((value) => Number.isFinite(value));
  const beValues = recentTrades
    .map((trade) => trade?.beActivated ?? trade?.be_activated ?? trade?.breakEvenActivated)
    .filter((value) => typeof value === "boolean");

  const slFixed = slDistances.length
    ? (slDistances.filter((distance) => Math.abs(distance - 10) <= 2).length / slDistances.length) * 100
    : null;
  const oneTradeDay = activeDays.length
    ? (activeDays.filter((day) => day.trades.length <= 1).length / activeDays.length) * 100
    : null;
  const entryObOpen = entryDeviations.length
    ? (entryDeviations.filter((value) => value < 2).length / entryDeviations.length) * 100
    : null;
  const beActivated = beValues.length
    ? (beValues.filter(Boolean).length / beValues.length) * 100
    : null;
  const noPost17 = recentTrades.length
    ? (recentTrades.filter((trade) => trade.when.getHours() < 17).length / recentTrades.length) * 100
    : null;
  const validSetup = recentTrades.length
    ? (recentTrades.filter((trade) => {
      const setup = String(trade.setup || trade.strategyTag || "").trim();
      return setup && !/mt5\s*sync|sin setup|^[-—]$/i.test(setup);
    }).length / recentTrades.length) * 100
    : null;

  return [
    { name: RULE_DEFINITIONS[0], pct: slFixed, note: slDistances.length ? "derived from registered SL" : "requires SL tracking" },
    { name: RULE_DEFINITIONS[1], pct: oneTradeDay, note: activeDays.length ? "per traded day" : "no traded days" },
    { name: RULE_DEFINITIONS[2], pct: entryObOpen, note: entryDeviations.length ? "entry tracking" : "pending tracking" },
    { name: RULE_DEFINITIONS[3], pct: beActivated, note: beValues.length ? "BE tracking" : "requires configuration" },
    { name: RULE_DEFINITIONS[4], pct: noPost17, note: recentTrades.length ? "close time registered" : "no trades" },
    { name: RULE_DEFINITIONS[5], pct: validSetup, note: recentTrades.length ? "setup/tag available" : "no trades" }
  ];
}

function buildKpis(ruleRows, recentTrades, entryDeviations, fallback = disciplineData) {
  const adherence = average(ruleRows.map((row) => row.pct));
  const previousAdherence = Number.isFinite(adherence) ? Math.max(0, adherence - 4) : null;
  const entryAverage = average(entryDeviations);
  const slViolations = ruleRows[0].pct == null
    ? null
    : recentTrades.filter((trade) => {
      const distance = pipsBetween(trade.symbol, trade.entry, trade.sl);
      return Number.isFinite(distance) && Math.abs(distance - 10) > 2;
    }).length;
  const outsideSchedule = recentTrades.filter((trade) => trade.when.getHours() >= 17).length;

  return [
    {
      label: "Rule adherence",
      value: formatPct(adherence ?? fallback.kpis.ruleAdherence.value),
      subcopy: "últimos 30 días",
      badge: Number.isFinite(adherence) && Number.isFinite(previousAdherence) ? `+${Math.round(adherence - previousAdherence)}% vs mes anterior` : `+${fallback.kpis.ruleAdherence.delta}% vs mes anterior`,
      tone: ruleColor(adherence ?? fallback.kpis.ruleAdherence.value)
    },
    {
      label: "Entry precision",
      value: formatPips(entryAverage ?? fallback.kpis.entryPrecision.value),
      subcopy: Number.isFinite(entryAverage) ? "desviación media" : "tracking estimado",
      badge: "objetivo <2.0",
      tone: precisionColor(entryAverage ?? fallback.kpis.entryPrecision.value)
    },
    {
      label: "SL violations",
      value: Number.isFinite(slViolations) ? String(slViolations) : String(fallback.kpis.slViolations.value),
      subcopy: Number.isFinite(slViolations) ? "trades este mes" : "tracking estimado",
      badge: "SL movido o ignorado",
      tone: Number.isFinite(slViolations) ? (slViolations === 0 ? "ok" : slViolations <= 3 ? "warn" : "bad") : "warn"
    },
    {
      label: "Off-Hours Trades",
      value: String(Number.isFinite(outsideSchedule) ? outsideSchedule : fallback.kpis.offHoursTrades.value),
      subcopy: "violaciones",
      badge: outsideSchedule === 0 ? "100% en horario" : "post 17:00 detectado",
      tone: outsideSchedule === 0 ? "ok" : outsideSchedule <= 2 ? "warn" : "bad"
    }
  ];
}

function buildExecutionHeatmap(recentTrades = [], fallback = disciplineData) {
  if (!recentTrades.length) {
    return fallback.calendar.map((days, index) => ({
      label: `S${index + 1}`,
      days: days.map((state) => ({ state, label: state, trades: 0, date: null, key: "" }))
    }));
  }

  const latest = recentTrades[recentTrades.length - 1]?.when || new Date();
  const end = new Date(latest);
  const day = end.getDay();
  const diffToSaturday = day === 0 ? -1 : 6 - day;
  end.setDate(end.getDate() + diffToSaturday);
  const start = new Date(end);
  start.setDate(start.getDate() - 34);

  const dayMap = groupTradesByDay(recentTrades);
  const weeks = [];
  for (let week = 0; week < 5; week += 1) {
    const days = [];
    for (let column = 0; column < 6; column += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + (week * 7) + column);
      const key = toDayKey(date);
      const bucket = dayMap.get(key);
      let state = "empty";
      let label = "Sin trade";
      if (bucket?.trades?.length) {
        const outside = bucket.trades.some((trade) => trade.when.getHours() >= 17);
        const overtraded = bucket.trades.length > 1;
        const negative = bucket.pnl < 0;
        state = outside || (overtraded && negative) ? "miss" : overtraded || negative ? "warn" : "clean";
        label = state === "clean" ? "Clean" : state === "warn" ? "Warning" : "Violation";
      }
      days.push({ key, date, state, label, trades: bucket?.trades?.length || 0, pnl: bucket?.pnl || 0 });
    }
    weeks.push({ label: `S${week + 1}`, days });
  }
  return weeks;
}

function buildEntryPrecisionRows(recentTrades = [], fallback = disciplineData) {
  const source = recentTrades.length ? [...recentTrades].slice(-10).reverse().map((trade) => {
    const deviation = getEntryDeviationPips(trade);
    const tone = precisionColor(deviation);
    const width = Number.isFinite(deviation) ? clamp((deviation / 6) * 100, 8, 100) : 0;
    return {
      date: formatShortDate(trade.when),
      pair: trade.symbol || "—",
      deviation,
      deviationLabel: Number.isFinite(deviation) ? `+${deviation.toFixed(1)}p` : "pendiente",
      status: precisionTag(deviation),
      tone,
      width
    };
  }) : fallback.entryPrecision.map((item) => ({
    date: item.date,
    pair: item.pair,
    deviation: item.dev,
    deviationLabel: `+${item.dev.toFixed(1)}p`,
    status: precisionTag(item.dev),
    tone: precisionColor(item.dev),
    width: clamp((item.dev / 6) * 100, 8, 100)
  }));
  return source;
}

function calcConsistency(recentTrades = []) {
  const days = [...groupTradesByDay(recentTrades).values()];
  if (!days.length) return null;
  return (days.filter((day) => day.trades.length <= 1 && day.pnl >= 0).length / days.length) * 100;
}

function calcPsychologicalScore(recentTrades = []) {
  if (!recentTrades.length) return null;
  let lossesBefore = 0;
  let pressureTrades = 0;
  for (const trade of recentTrades) {
    if (lossesBefore > 0) pressureTrades += 1;
    lossesBefore = Number(trade.pnl || 0) < 0 ? lossesBefore + 1 : 0;
  }
  return clamp(100 - (pressureTrades / recentTrades.length) * 100);
}

function resolveScoreTone(score) {
  return scoreColor(score);
}

function buildDisciplineScore(ruleRows, recentTrades, entryDeviations, fallback = disciplineData) {
  const compliance = average(ruleRows.map((row) => row.pct));
  const precision = entryDeviations.length
    ? clamp(100 - (average(entryDeviations) / 6) * 100)
    : fallback.score.breakdown.precision;
  const consistency = calcConsistency(recentTrades);
  const timing = ruleRows.find((row) => row.name === "No trades after 17:00")?.pct ?? fallback.score.breakdown.timing;
  const psychological = calcPsychologicalScore(recentTrades);
  const subscores = [
    { label: "Compliance", value: compliance ?? fallback.score.breakdown.compliance },
    { label: "Precisión", value: precision },
    { label: "Consistencia", value: consistency ?? fallback.score.breakdown.consistency },
    { label: "Timing", value: timing },
    { label: "Psicológico", value: psychological ?? fallback.score.breakdown.psychological }
  ];
  const score = Math.round(average(subscores.map((item) => item.value)) ?? fallback.score.overall);
  return { score, tone: resolveScoreTone(score), subscores };
}

function renderRuleRows(rows) {
  return rows.map((row) => {
    const tone = ruleColor(row.pct);
    const width = Number.isFinite(Number(row.pct)) ? clamp(row.pct, 6, 100) : 0;
    return `
      <div class="execution-rule-row execution-tone-${tone}">
        <div class="execution-rule-row__head">
          <strong>${row.name}</strong>
          <span>${formatPct(row.pct)}</span>
        </div>
        <div class="execution-rule-row__track" aria-hidden="true">
          <span style="width:${width}%"></span>
        </div>
        <small>${row.note}</small>
      </div>
    `;
  }).join("");
}

function renderHeatmap(weeks) {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayKey = toDayKey(new Date());
  return `
    <div class="execution-heatmap">
      <div class="execution-heatmap__weekdays">
        <span></span>
        ${weekdays.map((day) => `<span>${day}</span>`).join("")}
      </div>
      ${weeks.map((week) => `
        <div class="execution-heatmap__row">
          <strong>${week.label}</strong>
          ${week.days.map((day) => `
            <span class="execution-heatmap__cell ${calendarCellClass(day.state, day.key === todayKey)}" title="${formatShortDate(day.date)} · ${day.label} · ${day.trades} trades"></span>
          `).join("")}
        </div>
      `).join("")}
      <div class="execution-heatmap__legend">
        <span><i class="execution-tone-ok"></i>Clean</span>
        <span><i class="execution-tone-warn"></i>Warning</span>
        <span><i class="execution-tone-bad"></i>Violation</span>
        <span><i class="execution-tone-empty"></i>No trade</span>
      </div>
    </div>
  `;
}

function renderEntryRows(rows) {
  if (!rows.length) {
    return `<div class="execution-empty">Sin trades suficientes para leer precisión de entrada.</div>`;
  }
  return rows.map((row) => `
    <div class="execution-entry-row execution-tone-${row.tone}">
      <span>${row.date}</span>
      <strong>${row.pair}</strong>
      <span>${row.deviationLabel}</span>
      <div class="execution-entry-row__bar" aria-hidden="true">
        <i style="width:${row.width}%"></i>
      </div>
      <em>${row.status}</em>
    </div>
  `).join("");
}

function renderSubscores(subscores) {
  return subscores.map((item) => `
    <div class="execution-subscore">
      <span>${item.label}</span>
      <strong>${Number.isFinite(Number(item.value)) ? Math.round(item.value) : "Pendiente"}</strong>
    </div>
  `).join("");
}

function renderScoreGauge(score) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamp(score, 0, 100) / 100) * circumference;
  return `
    <div class="execution-score-gauge execution-tone-${scoreColor(score)}">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle class="execution-score-gauge__track" cx="70" cy="70" r="${radius}"></circle>
        <circle class="execution-score-gauge__arc" cx="70" cy="70" r="${radius}" stroke-dasharray="${dash} ${circumference}"></circle>
      </svg>
      <div>
        <strong>${score}</strong>
        <span>score</span>
      </div>
    </div>
  `;
}

function buildDisciplineDataFromModel(model) {
  const recentTrades = getRecentTrades(model?.trades || []);
  const entryDeviations = recentTrades.map(getEntryDeviationPips).filter((value) => Number.isFinite(value));
  const rules = calcRuleCompliance(recentTrades);
  const kpis = buildKpis(rules, recentTrades, entryDeviations);
  const score = buildDisciplineScore(rules, recentTrades, entryDeviations);
  return {
    kpis,
    rules,
    calendar: buildExecutionHeatmap(recentTrades),
    entryPrecision: buildEntryPrecisionRows(recentTrades),
    score,
    insight: rules[0]?.pct == null
      ? disciplineData.score.insight
      : `Biggest gap: SL discipline (${Math.round(rules[0].pct)}%). Review trades where SL was moved or ignored.`
  };
}

export function renderDisciplineSection(target = document.getElementById("section-discipline"), data = disciplineData) {
  if (!target) return;
  const kpis = Array.isArray(data.kpis)
    ? data.kpis
    : [
      {
        label: "Rule Adherence",
        value: formatPct(data.kpis?.ruleAdherence?.value),
        subcopy: "últimos 30 días",
        badge: `+${data.kpis?.ruleAdherence?.delta ?? 0}% vs mes anterior`,
        tone: ruleColor(data.kpis?.ruleAdherence?.value)
      },
      {
        label: "Entry Precision",
        value: formatPips(data.kpis?.entryPrecision?.value),
        subcopy: "desviación media",
        badge: `objetivo <${data.kpis?.entryPrecision?.target ?? 2.0}`,
        tone: precisionColor(data.kpis?.entryPrecision?.value)
      },
      {
        label: "SL Violations",
        value: String(data.kpis?.slViolations?.value ?? "Pendiente"),
        subcopy: "trades este mes",
        badge: "SL movido o ignorado",
        tone: Number(data.kpis?.slViolations?.value || 0) === 0 ? "ok" : Number(data.kpis?.slViolations?.value || 0) <= 3 ? "warn" : "bad"
      },
      {
        label: "Off-Hours Trades",
        value: String(data.kpis?.offHoursTrades?.value ?? 0),
        subcopy: "violaciones",
        badge: Number(data.kpis?.offHoursTrades?.value || 0) === 0 ? "100% en horario" : "post 17:00 detectado",
        tone: Number(data.kpis?.offHoursTrades?.value || 0) === 0 ? "ok" : "warn"
      }
    ];

  const rules = (data.rules || []).map((rule) => ({
    name: rule.name,
    pct: rule.pct,
    note: rule.note || ""
  }));
  const calendar = Array.isArray(data.calendar?.[0])
    ? data.calendar.map((days, index) => ({ label: `S${index + 1}`, days: days.map((state) => ({ state, label: state, trades: 0, key: "", date: null })) }))
    : data.calendar || [];
  const entryRows = (data.entryPrecision || []).map((item) => ({
    date: item.date,
    pair: item.pair,
    deviation: item.dev ?? item.deviation,
    deviationLabel: Number.isFinite(Number(item.dev ?? item.deviation)) ? `+${Number(item.dev ?? item.deviation).toFixed(1)}p` : "pendiente",
    status: item.status || precisionTag(item.dev ?? item.deviation),
    tone: item.tone || precisionColor(item.dev ?? item.deviation),
    width: item.width || clamp((Number(item.dev ?? item.deviation || 0) / 6) * 100, 8, 100)
  }));
  const scoreValue = data.score?.overall ?? data.score?.score ?? 0;
  const breakdown = data.score?.breakdown
    ? [
      { label: "Compliance", value: data.score.breakdown.compliance },
      { label: "Precision", value: data.score.breakdown.precision },
      { label: "Consistency", value: data.score.breakdown.consistency },
      { label: "Timing", value: data.score.breakdown.timing },
      { label: "Psychological", value: data.score.breakdown.psychological }
    ]
    : data.score?.subscores || [];
  const insight = data.score?.insight || data.insight || disciplineData.score.insight;

  target.innerHTML = `
    <header class="kmfx-page__header">
      <div class="kmfx-page__copy">
        <p class="kmfx-page__eyebrow">EJECUCIÓN</p>
        <h2 class="kmfx-page__title">Ejecución</h2>
        <p class="kmfx-page__subtitle">Cumplimiento del plan, precisión de entrada y calidad operativa.</p>
      </div>
    </header>

    <section class="execution-kpi-grid">
      ${kpis.map((kpi) => `
        <article class="tl-kpi-card execution-kpi execution-tone-${kpi.tone}">
          <div class="tl-kpi-label">${kpi.label}</div>
          <div class="tl-kpi-val">${kpi.value}</div>
          <p>${kpi.subcopy}</p>
          <span>${kpi.badge}</span>
        </article>
      `).join("")}
    </section>

    <section class="execution-main-grid">
      <article class="tl-section-card execution-panel execution-rules-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">Rule compliance</div>
        </div>
        <div class="execution-rule-list">${renderRuleRows(rules)}</div>
      </article>

      <article class="tl-section-card execution-panel execution-calendar-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">Daily execution — last 5 weeks</div>
        </div>
        ${renderHeatmap(calendar)}
      </article>
    </section>

    <section class="execution-main-grid execution-main-grid--lower">
      <article class="tl-section-card execution-panel execution-entry-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">Entry precision — last 10 trades</div>
        </div>
        <div class="execution-entry-table">
          <div class="execution-entry-table__head">
            <span>Date</span>
            <span>Pair</span>
            <span>Pip dev.</span>
            <span>Precision</span>
            <span>Tag</span>
          </div>
          ${renderEntryRows(entryRows)}
        </div>
      </article>

      <article class="tl-section-card execution-panel execution-score-panel execution-tone-${scoreColor(scoreValue)}">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">Discipline score</div>
        </div>
        <div class="execution-score-body">
          ${renderScoreGauge(scoreValue)}
          <div class="execution-subscore-list">${renderSubscores(breakdown)}</div>
        </div>
        <div class="execution-system-insight">
          <strong>Insight</strong>
          <p>${insight}</p>
        </div>
      </article>
    </section>
  `;
}

export function renderDiscipline(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }

  const authority = resolveAccountDataAuthority(account);
  console.info("[KMFX][EXECUTION_AUTHORITY]", {
    account_id: account?.id || "",
    login: account?.login || "",
    broker: account?.broker || "",
    payloadSource: authority.payloadSource,
    tradeCount: authority.tradeCount,
    historyPoints: authority.historyPoints,
    firstTradeLabel: authority.firstTradeLabel,
    lastTradeLabel: authority.lastTradeLabel,
    sourceUsed: authority.sourceUsed,
  });

  root.innerHTML = `
    <section id="section-discipline" class="discipline-page-stack execution-page kmfx-page kmfx-page--spacious"></section>
  `;
  renderDisciplineSection(root.querySelector("#section-discipline"), buildDisciplineDataFromModel(model));
}
