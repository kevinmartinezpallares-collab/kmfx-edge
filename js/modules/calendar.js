import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js?v=build-20260406-213500";
import { formatCurrency, formatDurationHuman, formatPercent, resolveAccountDataAuthority, selectCurrentAccount, selectCurrentModel } from "./utils.js?v=build-20260406-213500";
import { openFocusPanel } from "./modal-system.js?v=build-20260406-213500";
import { renderAdminTracePanel } from "./admin-mode.js?v=build-20260406-213500";
import { kpiCardMarkup, pageHeaderMarkup, pnlTextMarkup } from "./ui-primitives.js?v=build-20260406-213500";

const CALENDAR_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const CALENDAR_TOOLTIP_PERCENT_FORMATTER = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function toLocalDayKey(dateLike) {
  const date = new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalMonthKey(dateLike) {
  return toLocalDayKey(dateLike).slice(0, 7);
}

function buildDayCurve(dayTrades) {
  const ordered = [...dayTrades].sort((a, b) => a.when - b.when);
  if (!ordered.length) return [];
  let cumulative = 0;
  return ordered.map((trade) => {
    cumulative += Number(trade.pnl || 0);
    return {
      label: trade.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
      value: Number(cumulative.toFixed(2))
    };
  });
}

function formatCalendarTooltipDate(label) {
  const text = String(label || "").trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (!match) return text || "—";
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month)) return text;
  return new Date(2000, month - 1, day)
    .toLocaleDateString("es-ES", { day: "numeric", month: "short" })
    .replace(".", "");
}

function formatCalendarTooltipPercent(value) {
  const numericValue = Number(value) || 0;
  const sign = numericValue > 0 ? "+" : "";
  return `${sign}${CALENDAR_TOOLTIP_PERCENT_FORMATTER.format(numericValue)}%`;
}

function formatCalendarTooltipCurrency(value) {
  const numericValue = Number(value) || 0;
  if (numericValue === 0) return formatCurrency(0);
  return `${numericValue > 0 ? "+" : ""}${formatCurrency(numericValue)}`;
}

function buildDayMetrics(dayTrades) {
  const ordered = [...dayTrades].sort((a, b) => a.when - b.when);
  const wins = ordered.filter((trade) => trade.pnl > 0).length;
  const best = ordered.reduce((top, trade) => !top || trade.pnl > top.pnl ? trade : top, null);
  const totalFees = ordered.reduce((sum, trade) => sum + resolveTradeFees(trade), 0);
  const bestValueClass = best?.pnl > 0 ? "metric-positive" : best?.pnl < 0 ? "metric-negative" : "";
  return [
    { label: "Trades", value: String(ordered.length) },
    { label: "Win Rate", value: ordered.length ? `${Math.round((wins / ordered.length) * 100)}%` : "—" },
    {
      label: "Mejor trade",
      value: best ? pnlTextMarkup({ value: best.pnl, text: formatCurrency(best.pnl), className: bestValueClass }) : "—",
      valueClass: bestValueClass
    },
    {
      label: "Comisiones",
      value: ordered.length ? pnlTextMarkup({ value: totalFees, text: formatCurrency(totalFees), className: totalFees < 0 ? "metric-negative" : "" }) : "—",
      valueClass: totalFees < 0 ? "metric-negative" : ""
    }
  ];
}

function escapeCalendarStatText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCalendarDayStatBar(metrics, dayTrades) {
  const ordered = [...dayTrades].sort((a, b) => a.when - b.when);
  const wins = ordered.filter((trade) => trade.pnl > 0).length;
  const losses = ordered.filter((trade) => trade.pnl < 0).length;
  const best = ordered.reduce((top, trade) => !top || trade.pnl > top.pnl ? trade : top, null);
  const metaByLabel = new Map([
    ["Trades", "Cerrados"],
    ["Win Rate", ordered.length ? `${wins} ganadoras · ${losses} perdedoras` : ""],
    ["Mejor trade", best ? `${best.symbol || "—"} ${best.side || ""}`.trim() : ""],
    ["Comisiones", ordered.length ? `${ordered.length} trades` : ""]
  ]);

  return `
    <section class="calendar-day-stat-bar" aria-label="Resumen del día">
      ${metrics.map((metric) => `
        <article class="calendar-day-stat-bar__item">
          <span class="calendar-day-stat-bar__label">${escapeCalendarStatText(metric.label)}</span>
          <span class="calendar-day-stat-bar__value ${metric.valueClass || ""}">${metric.value}</span>
          ${metaByLabel.get(metric.label) ? `<span class="calendar-day-stat-bar__meta">${escapeCalendarStatText(metaByLabel.get(metric.label))}</span>` : ""}
        </article>
      `).join("")}
    </section>
  `;
}

function getTradePrimaryMoment(trade) {
  return new Date(trade?.entryTime || trade?.openTime || trade?.open_time || trade?.when || trade?.closeTime || trade?.date || 0);
}

function buildDayExecutiveRead(dayTrades) {
  const ordered = [...dayTrades].sort((a, b) => getTradePrimaryMoment(a) - getTradePrimaryMoment(b));
  const topTrade = ordered.reduce((top, trade) => {
    if (!top) return trade;
    return Math.abs(Number(trade?.pnl || 0)) > Math.abs(Number(top?.pnl || 0)) ? trade : top;
  }, null);
  if (!topTrade) {
    return { summary: "Sin operativa relevante en este día.", topTradeId: null };
  }

  const wins = ordered.filter((trade) => Number(trade?.pnl || 0) > 0).length;
  const losses = ordered.filter((trade) => Number(trade?.pnl || 0) < 0).length;
  const breakevens = ordered.filter((trade) => Number(trade?.pnl || 0) === 0).length;
  const topPnl = Number(topTrade.pnl || 0);
  const topDirection = topPnl > 0 ? "impulsó" : topPnl < 0 ? "arrastró" : "cerró en break-even";
  const partialNote = Array.isArray(topTrade.executions) && topTrade.executions.length > 1
    ? ` en ${topTrade.executions.length} cierres`
    : "";
  const balanceParts = [];
  if (wins) balanceParts.push(`${wins} ganadoras`);
  if (losses) balanceParts.push(`${losses} perdedoras`);
  if (breakevens) balanceParts.push(`${breakevens} en break-even`);
  const balanceNote = ordered.length > 1 && balanceParts.length
    ? `${balanceParts.join(", ")} completaron la sesión.`
    : "";
  const pnlText = topPnl === 0 ? "sin impacto neto" : formatCurrency(topPnl);

  return {
    summary: topPnl === 0
      ? `${topTrade.symbol} ${topTrade.side} ${topDirection}${partialNote}. ${balanceNote || "El día terminó sin impacto neto por ese trade."}`.trim()
      : `${topTrade.symbol} ${topTrade.side} ${topDirection} el resultado con ${pnlText}${partialNote}.${balanceNote ? ` ${balanceNote}` : ""}`.trim(),
    topTradeId: String(topTrade.id),
  };
}

function displayCalendarSetup(value) {
  const text = String(value || "").trim();
  if (!text || /mt5\s*sync/i.test(text)) return "—";
  return text;
}

function resolveTradeFees(trade) {
  const commission = Number.isFinite(Number(trade?.commission)) ? Number(trade.commission) : 0;
  const fees = Number.isFinite(Number(trade?.fees))
    ? Number(trade.fees)
    : Number.isFinite(Number(trade?.fee))
      ? Number(trade.fee)
      : 0;
  const swap = Number.isFinite(Number(trade?.swap)) ? Number(trade.swap) : 0;
  return commission + fees + swap;
}

function getTradeTimeRange(trade) {
  const closeTime = trade?.when instanceof Date ? trade.when : new Date(trade?.when || trade?.closeTime || trade?.date || "");
  const hasCloseTime = closeTime instanceof Date && !Number.isNaN(closeTime.getTime());
  const openSource = trade?.entryTime || trade?.openTime || trade?.open_time || trade?.date;
  const explicitOpenTime = openSource ? new Date(openSource) : null;
  const hasExplicitOpenTime = explicitOpenTime instanceof Date && !Number.isNaN(explicitOpenTime.getTime());
  const durationMin = Number.isFinite(Number(trade?.durationMin)) ? Number(trade.durationMin) : null;
  const openTime = hasExplicitOpenTime
    ? explicitOpenTime
    : hasCloseTime && durationMin != null
      ? new Date(closeTime.getTime() - durationMin * 60000)
      : closeTime;
  const format = (date) => date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return {
    entryTime: format(openTime),
    exitTime: format(closeTime)
  };
}

function getCalendarTradeDayKey(trade) {
  const source = trade?.closeTime || trade?.close_time || trade?.time || trade?.when || trade?.date || trade?.entryTime || trade?.openTime || trade?.open_time;
  return source ? toLocalDayKey(source) : "";
}

function renderTradeExecutions(trade) {
  const executions = Array.isArray(trade?.executions) ? trade.executions : [];
  if (executions.length <= 1) return "";
  return `
    <div class="focus-panel-executions">
      <div class="focus-panel-executions__head">
        <span>Hora</span>
        <span>Vol.</span>
        <span>Salida</span>
        <span>P&amp;L parcial</span>
        <span>Acumulado</span>
      </div>
      ${executions.map((execution) => `
        <div class="focus-panel-execution">
          <span>${execution.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
          <span>${execution.volume ?? "—"}</span>
          <span>${execution.exit ?? "—"}</span>
          ${pnlTextMarkup({ value: execution.pnl, text: formatCurrency(execution.pnl), className: execution.pnl >= 0 ? "metric-positive" : "metric-negative" })}
          ${pnlTextMarkup({ value: execution.cumulativePnl, text: formatCurrency(execution.cumulativePnl), className: execution.cumulativePnl >= 0 ? "metric-positive" : "metric-negative" })}
        </div>
      `).join("")}
    </div>
  `;
}

function renderDayTradeDisclosure(trade, options = {}) {
  const { entryTime, exitTime } = getTradeTimeRange(trade);
  const fees = resolveTradeFees(trade);
  const isPrimary = options.isPrimary === true;
  const pnlClass = trade.pnl > 0 ? "metric-positive" : trade.pnl < 0 ? "metric-negative" : "";
  return `
    <details class="focus-panel-disclosure calendar-day-trades__item ${isPrimary ? "focus-panel-disclosure--primary calendar-day-trades__item--primary" : ""}">
      <summary class="focus-panel-disclosure__summary">
        <div class="focus-panel-disclosure__grid">
          <div class="focus-panel-disclosure__cell focus-panel-disclosure__cell--symbol">
            <strong>${trade.symbol}</strong>
            ${isPrimary ? `<small class="calendar-day-primary-trade">Trade principal del día</small>` : ""}
          </div>
          <div class="focus-panel-disclosure__cell">
            <span class="focus-panel-trade-side focus-panel-trade-side--${String(trade.side).toLowerCase()}">${trade.side}</span>
          </div>
          <div class="focus-panel-disclosure__cell">${entryTime}</div>
          <div class="focus-panel-disclosure__cell">${exitTime}</div>
          <div class="focus-panel-disclosure__cell focus-panel-disclosure__cell--value ${pnlClass}">
            ${pnlTextMarkup({ value: trade.pnl, text: formatCurrency(trade.pnl), className: pnlClass })}
          </div>
        </div>
      </summary>
      <div class="focus-panel-disclosure__body">
        <div class="focus-panel-pairs focus-panel-pairs--plain">
          <div class="focus-panel-pair-row"><strong>Entrada</strong><span>${trade.entry ?? "—"}</span><strong>Salida</strong><span>${trade.exit ?? "—"}</span></div>
          <div class="focus-panel-pair-row"><strong>SL</strong><span>${trade.sl ?? "—"}</span><strong>TP</strong><span>${trade.tp ?? "—"}</span></div>
          <div class="focus-panel-pair-row"><strong>Volumen inicial</strong><span>${trade.volume ?? "—"}</span><strong>Duración</strong><span>${formatDurationHuman(trade.durationMin)}</span></div>
          <div class="focus-panel-pair-row"><strong>Comisiones</strong><span class="${fees < 0 ? "metric-negative" : ""}">${formatCurrency(fees)}</span><strong>Resultado</strong>${pnlTextMarkup({ value: trade.pnl, text: formatCurrency(trade.pnl), className: pnlClass })}</div>
          <div class="focus-panel-pair-row"><strong>Setup</strong><span>${displayCalendarSetup(trade.setup)}</span><strong>Sesión</strong><span>${trade.session || "—"}</span></div>
        </div>
        ${renderTradeExecutions(trade)}
      </div>
    </details>
  `;
}

function openCalendarDayFocus(root, state, model, key) {
  const dayTrades = (model?.trades || []).filter((trade) => getCalendarTradeDayKey(trade) === key);
  const dayPnl = dayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const orderedDayTrades = [...dayTrades].sort((a, b) => {
    const aTime = new Date(a.entryTime || a.openTime || a.when || a.closeTime || 0).getTime();
    const bTime = new Date(b.entryTime || b.openTime || b.when || b.closeTime || 0).getTime();
    return aTime - bTime;
  });
  const executiveRead = buildDayExecutiveRead(orderedDayTrades);
  const dayChartKey = `calendar-day-focus-${key}`;
  const firstTrade = orderedDayTrades[0];
  const lastTrade = orderedDayTrades.at(-1);
  const dayMetrics = buildDayMetrics(orderedDayTrades);
  const reviewPrompt = orderedDayTrades.length <= 1
    ? "Muestra limitada: registra más operaciones antes de sacar conclusiones."
    : dayPnl < 0
      ? "Siguiente paso: revisa el trade que más dañó el día y compara la ejecución."
      : "Siguiente paso: identifica qué trade sostuvo el resultado y compáralo con tu plan.";

  openFocusPanel({
    title: new Date(key).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
    meta: `${firstTrade?.when?.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) || "—"} · ${lastTrade?.when?.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) || "—"}`,
    pnl: pnlTextMarkup({ value: dayPnl, text: formatCurrency(dayPnl), className: dayPnl >= 0 ? "metric-positive" : "metric-negative" }),
    pnlClass: "calendar-day-panel__pnl",
    metrics: [],
    maxWidth: "84vw",
    content: `
      <div class="calendar-day-report">
        ${renderCalendarDayStatBar(dayMetrics, orderedDayTrades)}
        <section class="focus-panel-section focus-panel-section--lead calendar-day-report__read calendar-day-reading">
          <div class="focus-panel-read calendar-day-report__read-card calendar-day-reading__card">
            <span class="calendar-day-report__eyebrow calendar-day-reading__label">Lectura del día</span>
            <p class="focus-panel-read__summary">${executiveRead.summary}</p>
            <p class="calendar-day-report__action calendar-day-reading__action">${reviewPrompt}</p>
          </div>
        </section>
        <section class="focus-panel-section calendar-day-report__chart-section">
          <div class="focus-panel-section__head calendar-day-report__section-head">
            <div>
              <div class="focus-panel-section__title">Curva intradía</div>
              <div class="focus-panel-section__subtitle">Evolución acumulada de los cierres del día.</div>
            </div>
          </div>
          <div class="calendar-day-report__chart">
            ${chartCanvas(dayChartKey, 188, "kmfx-chart-shell--feature")}
          </div>
        </section>
        <section class="focus-panel-section calendar-day-trades">
          <div class="focus-panel-section__head calendar-day-report__section-head">
            <div>
              <div class="focus-panel-section__title">Trades del día</div>
              <div class="focus-panel-section__subtitle">Detalle técnico conservado para revisar aportes, daño y ejecución.</div>
            </div>
          </div>
          <div class="focus-panel-trades-head calendar-day-trades__head">
            <span>Símbolo</span>
            <span>Dirección</span>
            <span>Entrada</span>
            <span>Salida</span>
            <span>P&amp;L</span>
          </div>
          <div class="focus-panel-disclosures calendar-day-trades__list">
            ${orderedDayTrades.map((trade) => renderDayTradeDisclosure(trade, { isPrimary: String(trade.id) === executiveRead.topTradeId })).join("")}
          </div>
        </section>
      </div>
    `,
    onMount(card) {
      card?.classList.add("calendar-day-panel");
      mountCharts(card, [
        lineAreaSpec(dayChartKey, buildDayCurve(orderedDayTrades), {
          tone: dayPnl >= 0 ? "green" : "red",
          showXAxis: true,
          showYAxis: true,
          showYGrid: false,
          showAxisBorder: false,
          axisFontSize: 10,
          axisFontWeight: "600",
          xTickPadding: 10,
          yTickPadding: 10,
          maxXTicks: 5,
          maxYTicks: 4,
          borderWidth: 2.1,
          fill: true,
          fillAlphaStart: 0.12,
          fillAlphaEnd: 0,
          glowAlpha: 0,
          tension: 0.34,
          animation: false,
          tooltipCallbacks: {
            title: (items) => items[0]?.label || "—",
            label: (context) => `P&L acumulado: ${formatCalendarTooltipCurrency(context.parsed.y)}`
          }
        })
      ]);
    }
  });
}

function buildYearSummary(dayStats, calendarMonths, selectedYear) {
  const yearKey = String(selectedYear);
  const yearDays = (dayStats || []).filter((day) => day.key.startsWith(`${yearKey}-`));
  const yearMonths = (calendarMonths || []).filter((month) => month.key.startsWith(`${yearKey}-`));
  const activeMonths = yearMonths.filter((month) => Number(month.trades || 0) > 0).length;
  const activeDays = yearDays.filter((day) => Number(day.trades || 0) > 0).length;
  const winDays = yearDays.filter((day) => Number(day.pnl || 0) > 0).length;
  const lossDays = yearDays.filter((day) => Number(day.pnl || 0) < 0).length;
  const yearPnl = yearMonths.reduce((sum, month) => sum + Number(month.pnl || 0), 0);
  const tradeCount = yearMonths.reduce((sum, month) => sum + Number(month.trades || 0), 0);
  const startBalance = Number(yearMonths[0]?.startBalance || 0);
  const consistencyPct = activeDays ? (winDays / activeDays) * 100 : 0;

  return {
    yearPnl,
    tradeCount,
    activeDays,
    activeMonths,
    winDays,
    lossDays,
    yearReturnPct: startBalance ? (yearPnl / startBalance) * 100 : 0,
    consistencyPct,
    consistencyLabel: activeMonths
      ? winDays >= lossDays
        ? "Más días a favor que en contra"
        : "Año con presión operativa"
      : "Todavía sin muestra suficiente"
  };
}

function buildYearMonthCards(dayStats, calendarMonths, selectedYear, valueMode, selectedMonthKey, hasModel) {
  return calendarMonths
    .filter((month) => month.key.startsWith(`${selectedYear}-`))
    .map((monthRecord) => {
      const monthView = buildMonthView(dayStats, monthRecord.key);
      const tradeCount = Number(monthRecord.trades || monthView.cells.reduce((sum, cell) => sum + Number(cell.trades || 0), 0));
      const monthValue = valueMode === "percent"
        ? formatPercent(Number(monthRecord.returnPct || 0))
        : formatCurrency(Number(monthRecord.pnl || 0));
      const monthValueClass = Number(monthRecord.pnl || 0) > 0
        ? "metric-positive"
        : Number(monthRecord.pnl || 0) < 0
          ? "metric-negative"
          : "";
      const cardClasses = [
        "calendar-year-card",
        monthRecord.key === selectedMonthKey ? "is-selected-month" : "",
        tradeCount > 0 ? "has-trades" : "is-idle"
      ].filter(Boolean).join(" ");

      return `
        <article class="${cardClasses}">
          <div class="calendar-year-card__head">
            <button class="calendar-year-card__month" type="button" data-calendar-open-month="${monthRecord.key}">${monthKeyToDate(monthRecord.key).toLocaleDateString("es-ES", { month: "long" })}</button>
            <span class="calendar-year-card__badge ${monthValueClass}">
              ${hasModel ? pnlTextMarkup({ value: Number(monthRecord.pnl || 0), text: monthValue, className: monthValueClass }) : "—"}
            </span>
          </div>
          <div class="calendar-year-card__weekdays">
            ${CALENDAR_HEADERS.map((header) => `<span>${header.slice(0, 1)}</span>`).join("")}
          </div>
          <div class="calendar-year-card__grid">
            ${monthView.cells.map((cell) => {
              if (!cell.inMonth) {
                return `<span class="calendar-year-day calendar-year-day--empty" aria-hidden="true"></span>`;
              }
              const dayClasses = [
                "calendar-year-day",
                cell.trades ? "has-trades" : "is-idle",
                cell.state === "win" ? "is-win" : "",
                cell.state === "loss" ? "is-loss" : "",
                cell.isToday ? "is-today" : ""
              ].filter(Boolean).join(" ");
              if (cell.trades && hasModel) {
                return `<button class="${dayClasses}" type="button" data-calendar-day="${cell.key}" aria-label="${cell.date.getDate()} · ${cell.trades} trades">${cell.date.getDate()}</button>`;
              }
              return `<span class="${dayClasses}">${cell.date.getDate()}</span>`;
            }).join("")}
          </div>
          <div class="calendar-year-card__footer">${tradeCount ? `${tradeCount} trades` : "Sin operativa"}</div>
        </article>
      `;
    }).join("");
}

function formatCalendarDayLabel(dayKey) {
  if (!dayKey) return "—";
  const [year, month, day] = String(dayKey).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function formatCalendarSignedCurrency(value) {
  const numericValue = Number(value || 0);
  const formatted = formatCurrency(numericValue);
  return numericValue > 0 ? `+${formatted}` : formatted;
}

function buildCalendarKpiReading({
  viewMode,
  monthView,
  summary,
  selectedYear,
  dayStats,
  hasModel,
  hasTradingData,
}) {
  const isYearView = viewMode === "year";
  const periodPnl = Number((isYearView ? summary.yearPnl : summary.monthPnl) || 0);
  const periodTrades = Number(summary.tradeCount || 0);
  const activeDays = Number(summary.activeDays || 0);
  const winDays = Number(summary.winDays || 0);
  const lossDays = Number(summary.lossDays || 0);
  const periodDays = isYearView
    ? (dayStats || []).filter((day) => String(day.key || "").startsWith(`${selectedYear}-`) && Number(day.trades || 0) > 0)
    : monthView.cells.filter((cell) => cell.inMonth && Number(cell.trades || 0) > 0);
  const bestDay = periodDays.reduce((top, day) => !top || Number(day.pnl || 0) > Number(top.pnl || 0) ? day : top, null);
  const worstDay = periodDays.reduce((bottom, day) => !bottom || Number(day.pnl || 0) < Number(bottom.pnl || 0) ? day : bottom, null);
  const enoughSample = activeDays >= 3 && periodTrades >= 5;
  const materialWorstDay = worstDay && Number(worstDay.pnl || 0) < 0 && Math.abs(Number(worstDay.pnl || 0)) >= Math.max(Math.abs(periodPnl) * 0.55, 1);
  const periodUnderPressure = Boolean((periodPnl < 0 || materialWorstDay) && worstDay);
  const bestDayLabel = bestDay ? formatCalendarDayLabel(bestDay.key) : "";
  const worstDayLabel = worstDay ? formatCalendarDayLabel(worstDay.key) : "";
  const bestDayText = bestDay ? `${formatCalendarSignedCurrency(bestDay.pnl)}` : "—";
  const worstDayText = worstDay ? `${formatCalendarSignedCurrency(worstDay.pnl)}` : "—";
  const keyDayTitle = bestDay && worstDay
    ? `${bestDayLabel} / ${worstDayLabel}`
    : bestDay
      ? bestDayLabel
      : worstDay
        ? worstDayLabel
        : "Sin días clave";
  const bestWorstMeta = bestDay || worstDay
    ? `Mejor ${bestDayText} · Peor ${worstDayText}`
    : "Sin días operados para comparar";
  const reviewTitle = !hasModel || !hasTradingData || periodTrades === 0 || activeDays === 0
    ? "Sin operaciones"
    : !enoughSample
      ? "Sigue registrando"
      : worstDay
        ? `Revisa el ${worstDayLabel}`
        : "Mes estable";
  const reviewMeta = !hasModel || !hasTradingData || periodTrades === 0 || activeDays === 0
    ? "Selecciona un periodo con operaciones"
    : !enoughSample
      ? "Falta muestra para concluir"
      : worstDay
        ? periodUnderPressure
          ? "Concentró el mayor daño del periodo"
          : "Revisión ligera del día con menor aporte"
        : `${winDays} días positivos · ${lossDays} días negativos`;

  return {
    activeDays,
    bestDay,
    bestWorstMeta,
    keyDayTitle,
    periodUnderPressure,
    periodPnl,
    reviewMeta,
    reviewTitle,
    tradeCount: periodTrades,
  };
}

function getCalendarViewMode(root) {
  if (root.__calendarViewMode !== "year") {
    root.__calendarViewMode = "month";
  }
  return root.__calendarViewMode;
}

function getCalendarYear(root, years, preferredYear) {
  const fallbackYear = preferredYear || years[years.length - 1] || new Date().getFullYear();
  if (!root.__calendarYear || !years.includes(Number(root.__calendarYear))) {
    root.__calendarYear = fallbackYear;
  }
  return Number(root.__calendarYear);
}

export function renderCalendar(root, state) {
  const account = selectCurrentAccount(state);
  const model = selectCurrentModel(state);
  const authority = resolveAccountDataAuthority(account);
  const connection = account?.connection || {};

  const dayStats = Array.isArray(model?.dayStats) ? model.dayStats : [];
  const months = Array.isArray(model?.monthlyReturns) ? model.monthlyReturns : [];
  const hasModel = Boolean(model);
  const hasTradingData = dayStats.length > 0 && months.length > 0;
  const monthlyMatrix = Array.isArray(model?.monthlyMatrix) ? model.monthlyMatrix : [];
  const latestMonthKey = months[months.length - 1]?.key || buildFallbackMonthRecord().key;
  const currentMonthKey = toLocalMonthKey(new Date());
  const calendarMonths = months.length ? expandCalendarMonths(months) : [buildFallbackMonthRecord()];
  const initialMonthKey = calendarMonths.some((month) => month.key === currentMonthKey)
    ? currentMonthKey
    : latestMonthKey;
  const monthKey = getCalendarMonthKey(root, calendarMonths, initialMonthKey);
  const viewMode = getCalendarViewMode(root);
  const calendarYears = [...new Set(calendarMonths.map((month) => Number(month.key.slice(0, 4))))].sort((a, b) => a - b);
  const selectedYear = getCalendarYear(root, calendarYears, Number(monthKey.slice(0, 4)) || new Date().getFullYear());
  const selectedYearIndex = calendarYears.findIndex((year) => year === selectedYear);
  const monthIndex = calendarMonths.findIndex((month) => month.key === monthKey);
  const selectedMonth = calendarMonths[monthIndex] || calendarMonths[calendarMonths.length - 1];
  const valueMode = getCalendarValueMode(root);
  const monthView = buildMonthView(dayStats, monthKey);
  const summary = viewMode === "year"
    ? buildYearSummary(dayStats, calendarMonths, selectedYear)
    : buildMonthSummary(monthView, selectedMonth);
  const calendarKpiReading = buildCalendarKpiReading({
    viewMode,
    monthView,
    summary,
    selectedYear,
    dayStats,
    hasModel,
    hasTradingData,
  });
  const selectedDayKey = root.__calendarSelectedDay;
  const hasSelectedDay = monthView.cells.some((cell) => cell.key === selectedDayKey && cell.trades > 0);
  const cumulativeCurve = buildCalendarCurve(dayStats, selectedMonth);
  const tradedCells = monthView.cells.filter((cell) => cell.inMonth && (cell.trades > 0 || cell.pnl !== 0));
  const tradedSample = tradedCells.slice(0, 8).map((cell) => ({
    key: cell.key,
    trades: cell.trades,
    pnl: cell.pnl
  }));
  window.__KMFX_CALENDAR_DEBUG__ = {
    currentAccount: state?.currentAccount || account?.id || null,
    currentAccountName: account?.name || null,
    hasModel,
    dayStatsCount: dayStats.length,
    monthlyReturnsCount: months.length,
    selectedMonth: selectedMonth?.key || monthKey,
    valueMode,
    tradedDaysInSelectedMonth: tradedCells.length,
    cellsSample: tradedSample
  };
  console.info("[KMFX][Calendar Debug]", window.__KMFX_CALENDAR_DEBUG__);
  console.info("[KMFX][CALENDAR_AUTHORITY]", {
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
  const note = !hasModel
    ? connection.state === "error"
      ? {
          tone: "error",
          text: "No se pudo cargar la actividad diaria. Mostramos la estructura del calendario mientras se recupera la conexión."
        }
      : {
          tone: "loading",
          text: "Cargando actividad diaria y resumen mensual."
        }
    : !hasTradingData
      ? {
          tone: "empty",
          text: "Todavía no hay sesiones registradas. La vista queda preparada para cuando entren días operados."
        }
      : null;
  const adminTracePanel = renderAdminTracePanel(state, {
    title: "Calendario PnL authority",
    subtitle: "Fuente de agrupación diaria y mensual visible.",
    items: [
      { label: "account_id", value: account?.id || "" },
      { label: "payloadSource", value: authority.payloadSource || "" },
      { label: "sourceUsed", value: authority.sourceUsed || "" },
      { label: "selectedMonth", value: selectedMonth?.key || monthKey },
      { label: "dayStats", value: dayStats.length },
      { label: "monthlyReturns", value: months.length },
      { label: "visibleTradingDays", value: tradedCells.length },
      { label: "valueMode", value: valueMode },
    ],
  });

  if (!hasSelectedDay) root.__calendarSelectedDay = "";

  root.innerHTML = `
    <section class="calendar-screen">
      ${pageHeaderMarkup({
        eyebrow: "Calendario",
        title: "Calendario",
        description: `Consistencia operativa y resultado diario del mes de un vistazo. ${authority.firstTradeLabel ? `Ledger real desde ${authority.firstTradeLabel}.` : ""}`,
        className: "calendar-screen__header",
        contentClassName: "calendar-screen__copy",
        eyebrowClassName: "calendar-screen__eyebrow",
        titleClassName: "calendar-screen__title",
        descriptionClassName: "calendar-screen__subtitle",
        extraContentHtml: note ? `<p class="calendar-inline-note calendar-inline-note--${note.tone}">${note.text}</p>` : "",
        actionsClassName: "calendar-month-nav",
        actionsHtml: `
          <button class="calendar-month-nav__btn" type="button" ${viewMode === "year" ? `data-calendar-year-shift="-1" ${selectedYearIndex <= 0 ? "disabled" : ""}` : `data-calendar-shift="-1" ${monthIndex <= 0 ? "disabled" : ""}`}>‹</button>
          <div class="calendar-month-nav__label">
            <strong>${viewMode === "year" ? selectedYear : monthView.label}</strong>
            <span>${viewMode === "year" ? `${summary.activeMonths} meses operados` : `${summary.activeDays} días operados`}</span>
          </div>
          <div class="widget-segmented calendar-view-toggle" role="tablist" aria-label="Vista del calendario">
            <button class="widget-segmented-btn ${viewMode === "month" ? "active" : ""}" type="button" data-calendar-view-mode="month">Mes</button>
            <button class="widget-segmented-btn ${viewMode === "year" ? "active" : ""}" type="button" data-calendar-view-mode="year">Año</button>
          </div>
          <div class="widget-segmented calendar-value-toggle" role="tablist" aria-label="Unidad visible del calendario">
            <button class="widget-segmented-btn ${valueMode === "usd" ? "active" : ""}" type="button" data-calendar-value-mode="usd">USD</button>
            <button class="widget-segmented-btn ${valueMode === "percent" ? "active" : ""}" type="button" data-calendar-value-mode="percent">%</button>
          </div>
          <button class="calendar-month-nav__btn" type="button" ${viewMode === "year" ? `data-calendar-year-shift="1" ${selectedYearIndex >= calendarYears.length - 1 ? "disabled" : ""}` : `data-calendar-shift="1" ${monthIndex >= calendarMonths.length - 1 ? "disabled" : ""}`}>›</button>
        `,
      })}
      ${adminTracePanel}

      <section class="calendar-summary-strip" aria-label="Resumen del mes">
        ${kpiCardMarkup({
          label: viewMode === "year" ? "Resultado del año" : "Resultado del mes",
          valueHtml: hasModel ? pnlTextMarkup({
            value: viewMode === "year" ? summary.yearPnl : summary.monthPnl,
            text: formatCalendarValue(viewMode === "year" ? summary.yearPnl : summary.monthPnl, valueMode, viewMode === "year" ? calendarMonths.find((month) => month.key.startsWith(`${selectedYear}-`))?.startBalance : selectedMonth?.startBalance),
            className: (viewMode === "year" ? summary.yearPnl : summary.monthPnl) > 0 ? "metric-positive" : (viewMode === "year" ? summary.yearPnl : summary.monthPnl) < 0 ? "metric-negative" : ""
          }) : "—",
          meta: hasTradingData ? valueMode === "usd" ? `${formatPercent(viewMode === "year" ? summary.yearReturnPct : summary.monthReturnPct)} sobre balance inicial ${viewMode === "year" ? "del año" : "del mes"}` : `Rentabilidad ${viewMode === "year" ? "del año" : "del mes"} sobre balance inicial` : `Sin muestra ${viewMode === "year" ? "anual" : "mensual"} todavía`,
          tone: calendarKpiReading.periodPnl > 0 ? "profit" : calendarKpiReading.periodPnl < 0 ? "loss" : "neutral",
          className: "calendar-summary-card calendar-summary-card--primary calendar-kpi-card",
        })}

        ${kpiCardMarkup({
          label: "Actividad",
          value: hasModel ? String(viewMode === "year" ? summary.activeMonths : calendarKpiReading.activeDays) : "—",
          meta: hasTradingData ? `${calendarKpiReading.tradeCount} trades cerrados` : "Actividad pendiente de cargar",
          tone: "neutral",
          className: "calendar-summary-card calendar-kpi-card",
        })}

        ${kpiCardMarkup({
          label: "Días clave",
          value: hasModel ? calendarKpiReading.keyDayTitle : "Sin días clave",
          meta: hasTradingData ? calendarKpiReading.bestWorstMeta : "Sin sesiones para clasificar",
          tone: hasTradingData ? "info" : "neutral",
          className: "calendar-summary-card calendar-kpi-card calendar-kpi-card--days",
        })}

        ${kpiCardMarkup({
          label: "Revisión sugerida",
          value: hasModel ? calendarKpiReading.reviewTitle : "Sin operaciones",
          meta: hasModel ? calendarKpiReading.reviewMeta : "Actividad pendiente de cargar",
          tone: calendarKpiReading.periodUnderPressure ? "warning" : calendarKpiReading.reviewTitle === "Sigue registrando" ? "info" : "neutral",
          className: "calendar-summary-card calendar-kpi-card calendar-kpi-card--review",
        })}
      </section>

      ${viewMode === "year"
        ? `
          <section class="tl-section-card calendar-month-panel calendar-year-panel">
            <div class="calendar-month-panel__head">
              <div>
                <div class="calendar-month-panel__title">${selectedYear} · vista anual</div>
                <div class="calendar-month-panel__sub">Lee el año entero de un vistazo: meses fuertes, baches y días que merecen revisión sin salir del sistema KMFX.</div>
              </div>

              <div class="calendar-month-panel__legend" aria-label="Leyenda">
                <span><i class="calendar-legend-dot calendar-legend-dot--win"></i>Positivo</span>
                <span><i class="calendar-legend-dot calendar-legend-dot--loss"></i>Negativo</span>
                <span><i class="calendar-legend-dot calendar-legend-dot--idle"></i>Sin operativa</span>
                <span><i class="calendar-legend-dot calendar-legend-dot--today"></i>Hoy</span>
              </div>
            </div>
            <div class="calendar-year-grid">
              ${buildYearMonthCards(dayStats, calendarMonths, selectedYear, valueMode, monthKey, hasModel)}
            </div>
          </section>
        `
        : `
          <section class="tl-section-card calendar-month-panel">
            <div class="calendar-month-panel__head">
              <div>
                <div class="calendar-month-panel__title">${monthView.label}</div>
                <div class="calendar-month-panel__sub">El foco es el ritmo diario: qué días ejecutaste, cómo cerraron y qué semanas sostuvieron la curva.</div>
              </div>

              <div class="calendar-month-panel__legend" aria-label="Leyenda">
                <span><i class="calendar-legend-dot calendar-legend-dot--win"></i>Positivo</span>
                <span><i class="calendar-legend-dot calendar-legend-dot--loss"></i>Negativo</span>
                <span><i class="calendar-legend-dot calendar-legend-dot--idle"></i>Sin operativa</span>
                <span><i class="calendar-legend-dot calendar-legend-dot--today"></i>Hoy</span>
              </div>
            </div>

            <div class="calendar-month-grid ${!hasModel ? "calendar-month-grid--loading" : ""}">
              ${CALENDAR_HEADERS.map((header) => `<div class="calendar-month-grid__head">${header}</div>`).join("")}
              ${monthView.cells.map((cell) => {
                const intensityClass = cell.trades ? getCalendarIntensityClass(cell.pnl, monthView.maxAbsPnl) : "";
                const classes = [
                  "calendar-day",
                  !hasModel ? "calendar-day--skeleton skeleton" : "",
                  cell.inMonth ? "is-current-month" : "is-outside-month",
                  cell.trades ? "has-trades" : "is-idle",
                  cell.state === "win" ? "is-win" : "",
                  cell.state === "loss" ? "is-loss" : "",
                  intensityClass,
                  cell.isToday ? "is-today" : "",
                  root.__calendarSelectedDay === cell.key ? "is-selected" : ""
                ].filter(Boolean).join(" ");
                const tradesLabel = cell.trades === 1 ? "1 trade" : `${cell.trades} trades`;
                return `
                  <button class="${classes}" type="button" ${cell.trades && hasModel ? `data-calendar-day="${cell.key}"` : "disabled"}>
                    <div class="calendar-day__top">
                      <span class="calendar-day__date">${cell.date.getDate()}</span>
                    </div>
                    <div class="calendar-day__body">
                      ${cell.trades && hasModel
                        ? `<div class="calendar-day__pnl ${cell.pnl >= 0 ? "metric-positive" : "metric-negative"}">${pnlTextMarkup({ value: cell.pnl, text: formatCalendarValue(cell.pnl, valueMode, selectedMonth?.startBalance), className: cell.pnl >= 0 ? "metric-positive" : "metric-negative" })}</div>
                           <div class="calendar-day__meta">${tradesLabel}</div>`
                        : `<div class="calendar-day__meta">${!hasModel ? "Cargando" : cell.inMonth ? "Sin operativa" : "Fuera de mes"}</div>`}
                    </div>
                  </button>
                `;
              }).join("")}
            </div>

            ${monthView.weeks.length
              ? `
                <div class="calendar-week-strip">
                  ${monthView.weeks.map((week) => `
                    <article class="calendar-week-chip">
                      <div class="calendar-week-chip__label">${week.label}</div>
                      <div class="calendar-week-chip__value ${week.pnl >= 0 ? "metric-positive" : week.pnl < 0 ? "metric-negative" : ""}">
                        ${pnlTextMarkup({ value: week.pnl, text: formatCurrency(week.pnl), className: week.pnl >= 0 ? "metric-positive" : week.pnl < 0 ? "metric-negative" : "" })}
                      </div>
                      <div class="calendar-week-chip__meta">${week.activeDays} días · ${week.trades} trades</div>
                    </article>
                  `).join("")}
                </div>
              `
              : ""}
          </section>

          <section class="calendar-analytics-stack">
            <article class="tl-section-card chart-card calendar-chart-panel calendar-cumulative">
              <div class="calendar-panel-head">
                <div>
                  <div class="calendar-panel-title">Rentabilidad acumulada</div>
                  <div class="calendar-panel-sub">${hasTradingData ? "Lectura acumulada para seguir la tracción del año sin competir con la vista mensual." : "La curva aparecerá aquí cuando entren cierres diarios."}</div>
                </div>
              </div>
              <div class="calendar-chart-wrap calendar-cumulative__chart">
                ${chartCanvas("calendar-cumulative-return", 220, "kmfx-chart-shell--feature")}
              </div>
            </article>

            <article class="tl-section-card table-card calendar-returns-panel calendar-returns-table">
              <div class="calendar-panel-head">
                <div>
                  <div class="calendar-panel-title">Tabla de rentabilidad</div>
                  <div class="calendar-panel-sub">${hasTradingData ? "Visión mensual y anual para leer progreso, baches y cierre del año de un vistazo." : "La matriz anual aparecerá aquí cuando existan meses cerrados."}</div>
                </div>
              </div>
              <div class="table-wrap calendar-returns-table__wrap">
                <table class="calendar-returns-table__table">
                  <thead>
                    <tr>
                      <th>Año</th>
                      <th>Ene</th>
                      <th>Feb</th>
                      <th>Mar</th>
                      <th>Abr</th>
                      <th>May</th>
                      <th>Jun</th>
                      <th>Jul</th>
                      <th>Ago</th>
                      <th>Sep</th>
                      <th>Oct</th>
                      <th>Nov</th>
                      <th>Dic</th>
                      <th>Total año</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildMonthlyMatrixRows(monthlyMatrix, hasModel, selectedMonth?.key)}
                  </tbody>
                  ${buildMonthlyMatrixFooter(monthlyMatrix, hasModel)}
                </table>
              </div>
            </article>
          </section>
        `}
    </section>
  `;

  root.querySelectorAll("[data-calendar-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      const offset = Number(button.dataset.calendarShift);
      const nextKey = shiftMonthKey(calendarMonths, monthKey, offset);
      if (!nextKey) return;
      root.__calendarMonthKey = nextKey;
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-year-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      const offset = Number(button.dataset.calendarYearShift);
      const nextYear = calendarYears[selectedYearIndex + offset];
      if (!nextYear) return;
      root.__calendarYear = nextYear;
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      root.__calendarViewMode = button.dataset.calendarViewMode === "year" ? "year" : "month";
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-value-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.calendarValueMode === "percent" ? "percent" : "usd";
      root.__calendarValueMode = nextMode;
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-open-month]").forEach((button) => {
    button.addEventListener("click", () => {
      root.__calendarMonthKey = button.dataset.calendarOpenMonth;
      root.__calendarViewMode = "month";
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.calendarDay;
      root.__calendarSelectedDay = key;
      renderCalendar(root, state);
      openCalendarDayFocus(root, state, model, key);
    });
  });

  if (hasModel) {
    mountCharts(root, [
      lineAreaSpec("calendar-cumulative-return", cumulativeCurve, {
        tone: "blue",
        showXAxis: true,
        showYAxis: true,
        showYGrid: false,
        showAxisBorder: false,
        axisFontSize: 10,
        axisFontWeight: "600",
        xTickPadding: 6,
        yTickPadding: 10,
        maxXTicks: 6,
        maxYTicks: 4,
        borderWidth: 2.3,
        fill: true,
        fillAlphaStart: 0.16,
        fillAlphaEnd: 0,
        glowAlpha: 0.08,
        tension: 0.42,
        yHeadroomRatio: 0.1,
        yBottomPaddingRatio: 0.06,
        axisFormatter: (value) => `${Number(value).toFixed(1)}%`,
        tooltipCallbacks: {
          title: (items) => formatCalendarTooltipDate(items[0]?.label),
          label: (context) => `Rentabilidad: ${formatCalendarTooltipPercent(context.parsed.y)}`
        }
      })
    ]);
  }
}

function buildMonthView(dayStats, monthKey) {
  const anchorDate = monthKeyToDate(monthKey);
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));
  const todayKey = toLocalDayKey(new Date());
  const dayMap = new Map(dayStats.map((entry) => [entry.key, entry]));

  const cells = [];
  const weeks = [];
  let maxAbsPnl = 0;
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    const key = toLocalDayKey(current);
    const day = dayMap.get(key);
    maxAbsPnl = Math.max(maxAbsPnl, Math.abs(day?.pnl || 0));
    cells.push({
      key,
      inMonth: current.getMonth() === anchorDate.getMonth(),
      date: new Date(current),
      pnl: day?.pnl || 0,
      trades: day?.trades || 0,
      isToday: key === todayKey,
      state: !day?.trades ? "idle" : day.pnl >= 0 ? "win" : "loss"
    });
  }

  for (let index = 0; index < cells.length; index += 7) {
    const slice = cells.slice(index, index + 7);
    const inMonthSlice = slice.filter((cell) => cell.inMonth);
    const trades = inMonthSlice.reduce((sum, cell) => sum + cell.trades, 0);
    const activeDays = inMonthSlice.filter((cell) => cell.trades > 0).length;
    if (!inMonthSlice.length) continue;
    weeks.push({
      label: `Sem ${weeks.length + 1}`,
      pnl: inMonthSlice.reduce((sum, cell) => sum + cell.pnl, 0),
      trades,
      activeDays
    });
  }

  return {
    key: monthKey,
    label: anchorDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
    cells,
    weeks,
    maxAbsPnl
  };
}

function buildMonthSummary(monthView, monthRecord) {
  const inMonthCells = monthView.cells.filter((cell) => cell.inMonth);
  const tradedDays = inMonthCells.filter((cell) => cell.trades > 0);
  const winDays = tradedDays.filter((cell) => cell.pnl > 0).length;
  const lossDays = tradedDays.filter((cell) => cell.pnl < 0).length;
  const monthPnl = tradedDays.reduce((sum, cell) => sum + cell.pnl, 0);
  const tradeCount = tradedDays.reduce((sum, cell) => sum + cell.trades, 0);
  const base = monthRecord?.startBalance || 0;
  const activeDays = tradedDays.length;
  const consistencyPct = activeDays ? (winDays / activeDays) * 100 : 0;

  return {
    monthPnl,
    tradeCount,
    activeDays,
    winDays,
    lossDays,
    monthReturnPct: base ? (monthPnl / base) * 100 : 0,
    consistencyPct,
    consistencyLabel: activeDays
      ? winDays >= lossDays
        ? "Más días a favor que en contra"
        : "Mes con presión operativa"
      : "Todavía sin muestra suficiente"
  };
}

function buildCalendarCurve(dayStats, selectedMonth) {
  const monthKey = selectedMonth?.key || toLocalMonthKey(new Date());
  const monthDays = dayStats
    .filter((day) => day.key.startsWith(monthKey))
    .sort((a, b) => a.key.localeCompare(b.key));

  if (!monthDays.length) {
    return buildEmptyCurve(monthKey);
  }

  let runningPnl = 0;
  const base = Number(selectedMonth?.startBalance || 0);
  return monthDays.map((day) => {
    runningPnl += Number(day.pnl || 0);
    return {
      label: new Date(day.key).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      value: base ? (runningPnl / base) * 100 : 0
    };
  });
}

function buildMonthlyMatrixRows(monthlyMatrix, hasModel, selectedMonthKey) {
  if (!hasModel) {
    return Array.from({ length: 2 }, () => `
      <tr>
        <td colspan="14"><div class="calendar-table-placeholder skeleton"></div></td>
      </tr>
    `).join("");
  }

  if (!monthlyMatrix.length) {
    return `
      <tr class="calendar-table-empty">
        <td colspan="14">Todavía no hay meses cerrados para mostrar rentabilidad.</td>
      </tr>
    `;
  }

  return monthlyMatrix.map((year) => `
    <tr>
      <td>${year.year}</td>
      ${year.months.map((monthCell, index) => {
        const monthKey = `${year.year}-${String(index + 1).padStart(2, "0")}`;
        const classes = [
          monthCell.pnl == null ? "" : monthCell.pnl >= 0 ? "metric-positive" : "metric-negative",
          monthKey === selectedMonthKey ? "calendar-matrix-cell--active" : ""
        ].filter(Boolean).join(" ");
        return `
        <td class="${classes}">
          ${monthCell.pnl == null ? "—" : formatPercent(monthCell.returnPct)}
        </td>
      `;
      }).join("")}
      <td class="${year.totalPnl >= 0 ? "metric-positive" : "metric-negative"}">${formatPercent(year.totalReturnPct)}</td>
    </tr>
  `).join("");
}

function buildMonthlyMatrixFooter(monthlyMatrix, hasModel) {
  if (!hasModel || !monthlyMatrix.length) return "";
  const grandTotal = monthlyMatrix.reduce((sum, year) => sum + Number(year.totalPnl || 0), 0);
  return `
    <tfoot>
      <tr>
        <th colspan="13">Grand Total</th>
        <th class="${grandTotal >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(grandTotal)}</th>
      </tr>
    </tfoot>
  `;
}

function buildFallbackMonthRecord() {
  const date = new Date();
  return {
    key: toLocalMonthKey(date),
    label: date.toLocaleDateString("es-ES", { month: "short", year: "numeric" }),
    pnl: 0,
    trades: 0,
    startBalance: 0,
    returnPct: 0
  };
}

function expandCalendarMonths(months) {
  if (!months.length) return [buildFallbackMonthRecord()];

  const byKey = new Map(months.map((month) => [month.key, month]));
  const years = [...new Set(months.map((month) => Number(month.key.slice(0, 4))))].sort((a, b) => a - b);
  const expanded = [];
  let runningBalance = Number(months[0]?.startBalance || 0);

  years.forEach((year) => {
    for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
      const key = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const existing = byKey.get(key);
      if (existing) {
        runningBalance = Number(existing.startBalance || runningBalance) + Number(existing.pnl || 0);
        expanded.push(existing);
        continue;
      }

      const date = new Date(year, monthNumber - 1, 1);
      expanded.push({
        key,
        label: date.toLocaleDateString("es-ES", { month: "short", year: "numeric" }),
        pnl: 0,
        trades: 0,
        startBalance: runningBalance,
        returnPct: 0
      });
    }
  });

  return expanded;
}

function buildEmptyCurve(monthKey) {
  const anchor = monthKeyToDate(monthKey || toLocalMonthKey(new Date()));
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return [1, 8, 15, 22, lastDay].map((day) => {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    return {
      label: date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      value: 0
    };
  });
}

function getCalendarIntensityClass(pnl, maxAbsPnl) {
  const abs = Math.abs(Number(pnl || 0));
  if (!abs || !maxAbsPnl) return "";
  const ratio = abs / maxAbsPnl;
  if (ratio >= 0.72) return "is-heat-3";
  if (ratio >= 0.38) return "is-heat-2";
  return "is-heat-1";
}

function getCalendarMonthKey(root, months, preferredKey) {
  const latest = preferredKey || months[months.length - 1]?.key || toLocalMonthKey(new Date());
  if (!root.__calendarMonthKey || !months.some((month) => month.key === root.__calendarMonthKey)) {
    root.__calendarMonthKey = latest;
  }
  return root.__calendarMonthKey;
}

function getCalendarValueMode(root) {
  if (root.__calendarValueMode !== "percent") {
    root.__calendarValueMode = "usd";
  }
  return root.__calendarValueMode;
}

function formatCalendarValue(value, mode, baseAmount) {
  if (mode === "percent") {
    const base = Number(baseAmount || 0);
    const pct = base ? (Number(value || 0) / base) * 100 : 0;
    return formatPercent(pct);
  }
  return formatCurrency(value);
}

function shiftMonthKey(months, currentKey, offset) {
  const index = months.findIndex((month) => month.key === currentKey);
  if (index === -1) return null;
  const next = months[index + offset];
  return next?.key || null;
}

function monthKeyToDate(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1);
}
