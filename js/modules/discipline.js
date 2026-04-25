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
    insight: "Mayor brecha: disciplina de SL (73%). Revisa trades de GBPUSD en las semanas 1 y 4."
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

function isIncompleteNote(note = "") {
  return /sin datos|sin historial|sin operaciones|pendiente|tracking EA/i.test(String(note));
}

function ruleTone(row = {}) {
  if (isIncompleteNote(row.note)) return "pending";
  return ruleColor(row.pct);
}

function scoreColor(score) {
  if (!Number.isFinite(Number(score))) return "pending";
  if (score >= 80) return "ok";
  if (score >= 65) return "warn";
  return "bad";
}

function scoreLabel(score) {
  if (!Number.isFinite(Number(score))) return "PENDIENTE";
  if (score >= 80) return "SÓLIDO";
  if (score >= 65) return "ACEPTABLE";
  if (score >= 45) return "DÉBIL";
  return "BAJO";
}

function precisionColor(value) {
  if (!Number.isFinite(Number(value))) return "pending";
  if (value < 2) return "ok";
  if (value <= 4) return "warn";
  return "bad";
}

function precisionTag(value) {
  if (!Number.isFinite(Number(value))) return "sin historial suficiente";
  if (value < 2) return "ideal";
  if (value <= 4) return "entrada tardía";
  return "persecución";
}

function translatePrecisionStatus(status = "") {
  const normalized = String(status).toLowerCase();
  if (normalized === "late entry") return "entrada tardía";
  if (normalized === "chasing") return "persecución";
  if (normalized === "ideal") return "ideal";
  if (normalized === "sin historial suficiente") return "sin historial suficiente";
  return status;
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
    { name: RULE_DEFINITIONS[0], pct: slFixed, note: slDistances.length ? "según histórico registrado" : "sin historial suficiente" },
    { name: RULE_DEFINITIONS[1], pct: oneTradeDay, note: activeDays.length ? "frecuencia frente al plan" : "sin historial suficiente" },
    { name: RULE_DEFINITIONS[2], pct: entryObOpen, note: entryDeviations.length ? "según entrada registrada" : "sin historial suficiente" },
    { name: RULE_DEFINITIONS[3], pct: beActivated, note: beValues.length ? "según break even registrado" : "sin datos suficientes" },
    { name: RULE_DEFINITIONS[4], pct: noPost17, note: recentTrades.length ? "según horario registrado" : "sin operaciones" },
    { name: RULE_DEFINITIONS[5], pct: validSetup, note: recentTrades.length ? "requiere validación del setup" : "sin operaciones" }
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
      label: "Cumplimiento de reglas",
      value: Number.isFinite(adherence) ? formatPct(adherence) : "Pendiente",
      subcopy: Number.isFinite(adherence) ? "últimos 30 días" : "estimación basada en histórico",
      badge: Number.isFinite(adherence) && Number.isFinite(previousAdherence) ? `+${Math.round(adherence - previousAdherence)}% vs mes anterior` : "datos parciales",
      tone: "neutral"
    },
    {
      label: "Precisión de entrada",
      value: Number.isFinite(entryAverage) ? formatPips(entryAverage) : "Pendiente",
      subcopy: Number.isFinite(entryAverage) ? "desviación media" : "pendiente de tracking EA",
      badge: Number.isFinite(entryAverage) ? "objetivo <2.0" : "sin datos suficientes",
      tone: Number.isFinite(entryAverage) && entryAverage > 2 ? precisionColor(entryAverage) : "neutral"
    },
    {
      label: "Violaciones de SL",
      value: Number.isFinite(slViolations) ? String(slViolations) : "Pendiente",
      subcopy: Number.isFinite(slViolations) ? "trades este mes" : "pendiente de tracking EA",
      badge: Number.isFinite(slViolations) && slViolations > 0 ? "violación confirmada" : "sin datos suficientes",
      tone: Number.isFinite(slViolations) ? (slViolations === 0 ? "ok" : "bad") : "warn"
    },
    {
      label: "Trades fuera de horario",
      value: String(Number.isFinite(outsideSchedule) ? outsideSchedule : fallback.kpis.offHoursTrades.value),
      subcopy: "violaciones",
      badge: outsideSchedule === 0 ? "100% en horario" : "violación confirmada",
      tone: outsideSchedule === 0 ? "ok" : "bad"
    }
  ];
}

function buildExecutionHeatmap(recentTrades = [], fallback = disciplineData) {
  if (!recentTrades.length) {
    return fallback.calendar.map((days, index) => ({
      label: `S${index + 1}`,
      days: days.map(() => ({ state: "empty", label: "Sin datos", trades: 0, date: null, key: "" }))
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
        label = state === "clean" ? "Limpio" : state === "warn" ? "Advertencia" : "Violación";
      }
      days.push({ key, date, state, label, trades: bucket?.trades?.length || 0, pnl: bucket?.pnl || 0 });
    }
    weeks.push({ label: `S${week + 1}`, days });
  }
  return weeks;
}

function buildEntryPrecisionRows(recentTrades = [], fallback = disciplineData, useFallback = true) {
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
      width,
      tracked: Number.isFinite(deviation)
    };
  }) : useFallback ? fallback.entryPrecision.map((item) => ({
    date: item.date,
    pair: item.pair,
    deviation: item.dev,
    deviationLabel: `+${item.dev.toFixed(1)}p`,
    status: precisionTag(item.dev),
    tone: precisionColor(item.dev),
    width: clamp((item.dev / 6) * 100, 8, 100),
    tracked: false
  })) : [];
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
    { label: "Cumplimiento", value: compliance ?? fallback.score.breakdown.compliance },
    { label: "Precisión", value: precision },
    { label: "Consistencia", value: consistency ?? fallback.score.breakdown.consistency },
    { label: "Horario", value: timing },
    { label: "Psicológico", value: psychological ?? fallback.score.breakdown.psychological }
  ];
  const score = Math.round(average(subscores.map((item) => item.value)) ?? fallback.score.overall);
  return { score, tone: resolveScoreTone(score), subscores };
}

function renderRuleRows(rows) {
  const noteMap = {
    "según histórico registrado": "según histórico registrado",
    "sin historial suficiente": "sin historial suficiente",
    "frecuencia frente al plan": "frecuencia frente al plan",
    "según entrada registrada": "según entrada registrada",
    "según break even registrado": "según break even registrado",
    "sin datos suficientes": "sin datos suficientes",
    "según horario registrado": "según horario registrado",
    "sin operaciones": "sin operaciones",
    "requiere validación del setup": "requiere validación del setup"
  };
  return rows.map((row) => {
    const tone = ruleTone(row);
    const isIncomplete = isIncompleteNote(row.note);
    const width = !isIncomplete && Number.isFinite(Number(row.pct)) ? clamp(row.pct, 6, 100) : 0;
    return `
      <div class="execution-rule-row execution-tone-${tone}">
        <div class="execution-rule-row__head">
          <strong>${ruleDisplayName(row.name)}</strong>
          <span>${isIncomplete ? "Pendiente" : formatPct(row.pct)}</span>
        </div>
        <div class="execution-rule-row__track" aria-hidden="true">
          <span style="width:${width}%"></span>
        </div>
        <small>${noteMap[row.note] || row.note}</small>
      </div>
    `;
  }).join("");
}

function renderHeatmap(weeks) {
  const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
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
            <span class="execution-heatmap__cell ${calendarCellClass(day.state, day.key === todayKey)}" title="${formatShortDate(day.date)} · ${day.label} · ${day.trades} operaciones"></span>
          `).join("")}
        </div>
      `).join("")}
      <div class="execution-heatmap__legend">
        <span><i class="execution-tone-ok"></i>Limpio</span>
        <span><i class="execution-tone-warn"></i>Advertencia</span>
        <span><i class="execution-tone-bad"></i>Violación</span>
        <span><i class="execution-tone-empty"></i>Sin trade</span>
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
      <em>${translatePrecisionStatus(row.status)}</em>
    </div>
  `).join("");
}

function hasEntryPrecisionTracking(rows = []) {
  return rows.some((row) => {
    const deviation = Number(row.deviation ?? row.dev);
    return row.tracked === true && Number.isFinite(deviation) && Math.abs(deviation) > 0.05;
  });
}

function renderEntryPrecisionEmpty() {
  return `
    <div class="execution-entry-empty">
      <strong>Precisión de entrada</strong>
      <p>Sin historial suficiente para evaluar desviación frente a la entrada ideal.</p>
      <small>Activa el tracking de entrada ideal desde el EA para medir chasing y entradas tardías.</small>
    </div>
  `;
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
  const label = scoreLabel(score);
  return `
    <div class="execution-score-gauge execution-tone-${scoreColor(score)}">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle class="execution-score-gauge__track" cx="70" cy="70" r="${radius}"></circle>
        <circle class="execution-score-gauge__arc" cx="70" cy="70" r="${radius}" stroke-dasharray="${dash} ${circumference}"></circle>
      </svg>
      <div>
        <strong>${score}</strong>
        <span>${label}</span>
      </div>
    </div>
  `;
}

function hasPartialExecutionData(rules = [], entryRows = [], kpis = []) {
  const hasIncompleteRules = rules.some((rule) => isIncompleteNote(rule.note) || !Number.isFinite(Number(rule.pct)));
  const hasEntryTracking = hasEntryPrecisionTracking(entryRows);
  const hasPendingKpis = kpis.some((kpi) => /pendiente|parcial|sin datos/i.test(`${kpi.value} ${kpi.subcopy} ${kpi.badge}`));
  return hasIncompleteRules || !hasEntryTracking || hasPendingKpis;
}

function ruleDisplayName(name = "") {
  if (/fixed sl|sl fijo|sl/i.test(name)) return "Disciplina de SL";
  if (/max 1 trade|trade\/day|frecuencia/i.test(name)) return "Frecuencia operativa";
  if (/entry/i.test(name)) return "Precisión de entrada";
  if (/be activated|be activado/i.test(name)) return "Gestión a break even";
  if (/17:00|hours|horario/i.test(name)) return "Disciplina horaria";
  if (/setup/i.test(name)) return "Validación de setup";
  return name || "Disciplina de ejecución";
}

function issueDescription(name = "") {
  if (/fixed sl|sl fijo|sl/i.test(name)) {
    return "El stop está siendo movido, ignorado o no queda suficientemente validado.";
  }
  if (/max 1 trade|trade\/day|frecuencia/i.test(name)) {
    return "La cantidad de trades se aleja del límite operativo definido.";
  }
  if (/17:00|hours|horario/i.test(name)) {
    return "Hay operaciones fuera de la ventana permitida.";
  }
  if (/entry/i.test(name)) {
    return "La entrada se aleja del punto técnico ideal.";
  }
  if (/setup/i.test(name)) {
    return "El setup no queda etiquetado o validado con suficiente consistencia.";
  }
  return "La ejecución se desvía del proceso y reduce la consistencia operativa.";
}

function isReliableRule(row = {}) {
  if (!Number.isFinite(Number(row.pct))) return false;
  return !/requires|pending|no trades|no traded days|sin datos|sin historial|sin operaciones|pendiente/i.test(String(row.note || ""));
}

function resolvePrincipalDeviation(rules = []) {
  const priority = [
    /fixed sl|sl fijo|sl/i,
    /max 1 trade|trade\/day|frecuencia/i,
    /17:00|hours|horario/i,
    /entry/i,
    /setup/i
  ];
  const reliableRules = rules.filter(isReliableRule);
  for (const matcher of priority) {
    const belowTarget = reliableRules.find((rule) => matcher.test(rule.name) && Number(rule.pct) < 90);
    if (belowTarget) return belowTarget;
  }
  for (const matcher of priority) {
    const available = reliableRules.find((rule) => matcher.test(rule.name));
    if (available) return available;
  }
  return { name: RULE_DEFINITIONS[0], pct: null, note: "sin historial suficiente" };
}

function renderExecutionHero(rules = []) {
  const principalRule = resolvePrincipalDeviation(rules);
  const issueName = ruleDisplayName(principalRule?.name || RULE_DEFINITIONS[0]);

  return `
    <section class="execution-hero">
      <div class="execution-hero__copy">
        <p class="execution-hero__eyebrow">CALIDAD DE EJECUCIÓN</p>
        <h3>Calidad de ejecución baja</h3>
        <p>Tu ejecución se degrada en momentos de presión.</p>
      </div>
      <div class="execution-hero__issue">
        <span>Principal desviación</span>
        <strong>${issueName}</strong>
        <p>${issueDescription(principalRule?.name || RULE_DEFINITIONS[0])}</p>
      </div>
    </section>
  `;
}

function buildEntryPattern(rows = []) {
  const byPair = rows.reduce((map, row) => {
    const deviation = Number(row.deviation ?? row.dev);
    if (!row.pair || !Number.isFinite(deviation)) return map;
    const bucket = map.get(row.pair) || { pair: row.pair, total: 0, count: 0 };
    bucket.total += deviation;
    bucket.count += 1;
    map.set(row.pair, bucket);
    return map;
  }, new Map());

  const weakestPair = [...byPair.values()]
    .filter((item) => item.count > 0)
    .map((item) => ({ ...item, avg: item.total / item.count }))
    .sort((a, b) => b.avg - a.avg)[0];

  if (!weakestPair) return "No hay suficiente historial para detectar un patrón claro.";
  return `Tiendes a entrar tarde en operaciones de ${weakestPair.pair}.`;
}

function renderScorePanel(scoreValue, breakdown, insight, { isPartial = false } = {}) {
  return `
    <article class="tl-section-card execution-panel execution-score-panel execution-tone-${scoreColor(scoreValue)}">
      <div class="tl-section-header execution-section-header">
        <div class="tl-section-title">Score de ejecución</div>
        ${isPartial ? `<span class="execution-data-pill">Datos parciales</span>` : ""}
      </div>
      <div class="execution-score-body">
        ${renderScoreGauge(scoreValue)}
        <div class="execution-subscore-list">${renderSubscores(breakdown)}</div>
        <div class="execution-score-reading">
          <span>Lectura</span>
          <p>La lectura actual es parcial hasta activar tracking completo desde el EA.</p>
        </div>
      </div>
      <div class="execution-system-insight">
        <strong>Insight</strong>
        <p>${insight}</p>
      </div>
    </article>
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
    entryPrecision: buildEntryPrecisionRows(recentTrades, disciplineData, false),
    score,
    insight: rules[0]?.pct == null
      ? "Mayor brecha: disciplina de SL. Revisa las operaciones donde el stop fue movido o ignorado."
      : `Mayor brecha: disciplina de SL (${Math.round(rules[0].pct)}%). Revisa las operaciones donde el stop fue movido o ignorado.`
  };
}

export function renderDisciplineSection(target, data = disciplineData) {
  if (!target) return;
  const kpis = Array.isArray(data.kpis)
    ? data.kpis
    : [
      {
        label: "Cumplimiento de reglas",
        value: formatPct(data.kpis?.ruleAdherence?.value),
        subcopy: "últimos 30 días",
        badge: `+${data.kpis?.ruleAdherence?.delta ?? 0}% vs mes anterior`,
        tone: "neutral"
      },
      {
        label: "Precisión de entrada",
        value: formatPips(data.kpis?.entryPrecision?.value),
        subcopy: "estimación basada en histórico",
        badge: `objetivo <${data.kpis?.entryPrecision?.target ?? 2.0}`,
        tone: "neutral"
      },
      {
        label: "Violaciones de SL",
        value: String(data.kpis?.slViolations?.value ?? "Pendiente"),
        subcopy: "trades este mes",
        badge: "SL movido o ignorado",
        tone: Number(data.kpis?.slViolations?.value || 0) === 0 ? "ok" : "bad"
      },
      {
        label: "Trades fuera de horario",
        value: String(data.kpis?.offHoursTrades?.value ?? 0),
        subcopy: "violaciones",
        badge: Number(data.kpis?.offHoursTrades?.value || 0) === 0 ? "100% en horario" : "violación confirmada",
        tone: Number(data.kpis?.offHoursTrades?.value || 0) === 0 ? "ok" : "bad"
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
    width: item.width || clamp((Number(item.dev ?? item.deviation ?? 0) / 6) * 100, 8, 100),
    tracked: item.tracked === true || item.hasTracking === true
  }));
  const scoreValue = data.score?.overall ?? data.score?.score ?? 0;
  const breakdown = data.score?.breakdown
    ? [
      { label: "Cumplimiento", value: data.score.breakdown.compliance },
      { label: "Precisión", value: data.score.breakdown.precision },
      { label: "Consistencia", value: data.score.breakdown.consistency },
      { label: "Horario", value: data.score.breakdown.timing },
      { label: "Psicológico", value: data.score.breakdown.psychological }
    ]
    : data.score?.subscores || [];
  const insight = data.score?.insight || data.insight || disciplineData.score.insight;
  const hasEntryTracking = hasEntryPrecisionTracking(entryRows);
  const isPartialData = hasPartialExecutionData(rules, entryRows, kpis);
  const entryPattern = hasEntryTracking ? buildEntryPattern(entryRows) : "No hay suficiente historial para detectar un patrón claro.";

  target.innerHTML = `
    <header class="kmfx-page__header">
      <div class="kmfx-page__copy">
        <p class="kmfx-page__eyebrow">EJECUCIÓN</p>
        <h2 class="kmfx-page__title">Ejecución</h2>
        <p class="kmfx-page__subtitle">Cumplimiento del plan, precisión de entrada y calidad operativa.</p>
      </div>
    </header>

    ${renderExecutionHero(rules)}

    <section class="execution-score-row">
      ${renderScorePanel(scoreValue, breakdown, insight, { isPartial: isPartialData })}
    </section>

    <section class="execution-main-grid">
      <article class="tl-section-card execution-panel execution-rules-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">Cumplimiento de reglas</div>
        </div>
        <div class="execution-rule-list">${renderRuleRows(rules)}</div>
      </article>

      <article class="tl-section-card execution-panel execution-calendar-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">Ejecución diaria — últimas 5 semanas</div>
        </div>
        ${renderHeatmap(calendar)}
      </article>
    </section>

    <section class="execution-kpi-grid">
      ${kpis.map((kpi) => `
        <article class="tl-kpi-card execution-kpi execution-kpi--${kpi.label === "Violaciones de SL" || kpi.label === "Trades fuera de horario" ? "critical" : "support"} execution-tone-${kpi.tone}">
          <div class="tl-kpi-label">${kpi.label}</div>
          <div class="tl-kpi-val">${kpi.value}</div>
          <p>${kpi.subcopy}</p>
          <span>${kpi.badge}</span>
        </article>
      `).join("")}
    </section>

    <section class="execution-main-grid execution-main-grid--lower">
      <article class="tl-section-card execution-panel execution-entry-panel">
        <div class="tl-section-header execution-section-header">
          <div class="tl-section-title">${hasEntryTracking ? "Precisión de entrada — últimos 10 trades" : "Precisión de entrada"}</div>
        </div>
        <div class="execution-entry-pattern">
          <span>Patrón de ejecución</span>
          <p>${entryPattern}</p>
        </div>
        ${hasEntryTracking ? `<div class="execution-entry-table">
          <div class="execution-entry-table__head">
            <span>Fecha</span>
            <span>Par</span>
            <span>Desv. pips</span>
            <span>Precisión</span>
            <span>Estado</span>
          </div>
          ${renderEntryRows(entryRows)}
        </div>` : renderEntryPrecisionEmpty()}
      </article>
    </section>
  `;
}

export function renderDiscipline(root, state) {
  if (!root) return;
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
