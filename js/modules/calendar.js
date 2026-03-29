import { formatCurrency, formatPercent, selectCurrentModel } from "./utils.js";
import { chartCanvas, lineAreaSpec, mountCharts } from "./chart-system.js";
import { openModal } from "./modal-system.js?v=build-20260329-193532";

function smoothPath(points, width = 760, height = 190, padding = 24) {
  if (!points.length) return { line: "", area: "" };
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = max - min || 1;
  const mapped = points.map((point, index) => ({
    x: padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((point.value - min) / range) * (height - padding * 2)
  }));

  let line = `M ${mapped[0].x.toFixed(1)} ${mapped[0].y.toFixed(1)}`;
  for (let index = 1; index < mapped.length; index += 1) {
    const prev = mapped[index - 1];
    const curr = mapped[index];
    const xc = ((prev.x + curr.x) / 2).toFixed(1);
    line += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${xc} ${((prev.y + curr.y) / 2).toFixed(1)}`;
    if (index === mapped.length - 1) {
      line += ` T ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
  }

  const area = `${line} L ${mapped[mapped.length - 1].x.toFixed(1)} ${(height - padding / 2).toFixed(1)} L ${mapped[0].x.toFixed(1)} ${(height - padding / 2).toFixed(1)} Z`;
  return { line, area };
}

export function renderCalendar(root, state) {
  const model = selectCurrentModel(state);
  if (!model) {
    root.innerHTML = "";
    return;
  }
  const range = getCalendarRange(root);
  const month = model.monthlyReturns[model.monthlyReturns.length - 1];
  const bestDay = [...model.calendar.cells].sort((a, b) => b.pnl - a.pnl)[0];
  const worstDay = [...model.calendar.cells].sort((a, b) => a.pnl - b.pnl)[0];
  const activeDays = model.calendar.cells.filter((cell) => cell.trades).length;
  const winDays = model.calendar.cells.filter((cell) => cell.pnl > 0).length;
  const monthReturn = month.returnPct || 0;
  const cumulativeView = getCumulativeView(model, range);
  const axisLine = getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-line").trim() || undefined;
  const totalReturnColor = cumulativeView.totalPct >= 0 ? "metric-positive" : "metric-negative";
  const weeklySummary = [];

  for (let index = 0; index < model.calendar.cells.length; index += 7) {
    const slice = model.calendar.cells.slice(index, index + 7);
    const inMonthCells = slice.filter((cell) => cell.inMonth);
    const weekPnl = inMonthCells.reduce((sum, cell) => sum + (cell.pnl || 0), 0);
    const weekTrades = inMonthCells.reduce((sum, cell) => sum + (cell.trades || 0), 0);
    weeklySummary.push({
      label: `Sem ${weeklySummary.length + 1}`,
      pnl: weekPnl,
      returnPct: month.startBalance ? (weekPnl / month.startBalance) * 100 : 0,
      trades: weekTrades
    });
  }

  const grandTotal = model.monthlyMatrix.reduce((sum, year) => sum + year.totalPnl, 0);
  const calendarRows = [];

  for (let index = 0; index < model.calendar.cells.length; index += 7) {
    const slice = model.calendar.cells.slice(index, index + 7);
    const week = weeklySummary[Math.floor(index / 7)];
    calendarRows.push(...slice.map((cell) => `
      <button class="calendar-cell ${cell.inMonth ? "" : "muted"} ${cell.pnl > 0 ? "win" : cell.pnl < 0 ? "loss" : ""}" type="button" ${cell.trades ? `data-calendar-day="${cell.key}"` : "disabled"}>
        <div class="calendar-date">${cell.date.getDate()}</div>
        <div class="calendar-pnl ${cell.pnl >= 0 ? "metric-positive" : "metric-negative"}">${cell.trades ? formatCurrency(cell.pnl) : "—"}</div>
        <div class="calendar-trades">${cell.trades ? `${cell.trades} ops.` : "Sin actividad"}</div>
      </button>
    `));
    if (week) {
      calendarRows.push(`
        <div class="calendar-week-summary calendar-week-summary--side">
          <div class="calendar-week-summary-title">${week.label}</div>
          <div class="calendar-week-summary-value ${week.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(week.pnl)}</div>
          <div class="calendar-week-summary-meta">${week.trades} ops.</div>
          <div class="calendar-week-summary-value ${week.returnPct >= 0 ? "metric-positive" : "metric-negative"}">${formatPercent(week.returnPct)}</div>
        </div>
      `);
    }
  }

  root.innerHTML = `
    <div class="pnlcal-nav">
      <button class="pnlcal-nav-btn" type="button">‹</button>
      <div class="pnlcal-nav-title">${model.calendar.monthLabel}</div>
      <button class="pnlcal-nav-btn" type="button">›</button>
    </div>

    <div class="pnlcal-kpi-strip">
      <div class="pnlcal-kpi"><div class="pnlcal-kpi-label">P&L neto</div><div class="pnlcal-kpi-val ${month.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(month.pnl)}</div></div>
      <div class="pnlcal-kpi"><div class="pnlcal-kpi-label">Retorno</div><div class="pnlcal-kpi-val">${formatPercent(monthReturn)}</div></div>
      <div class="pnlcal-kpi"><div class="pnlcal-kpi-label">Trades</div><div class="pnlcal-kpi-val">${month.trades}</div></div>
      <div class="pnlcal-kpi"><div class="pnlcal-kpi-label">Días activos</div><div class="pnlcal-kpi-val">${activeDays}</div></div>
      <div class="pnlcal-kpi"><div class="pnlcal-kpi-label">Días ganadores</div><div class="pnlcal-kpi-val metric-positive">${winDays}</div></div>
      <div class="pnlcal-kpi"><div class="pnlcal-kpi-label">Mejor día</div><div class="pnlcal-kpi-val metric-positive">${formatCurrency(bestDay?.pnl || 0)}</div></div>
      <div class="pnlcal-kpi"><div class="pnlcal-kpi-label">Peor día</div><div class="pnlcal-kpi-val metric-negative">${formatCurrency(worstDay?.pnl || 0)}</div></div>
      <div class="pnlcal-kpi"><div class="pnlcal-kpi-label">Win rate</div><div class="pnlcal-kpi-val">${formatPercent(model.totals.winRate)}</div></div>
    </div>

    <div class="pnlcal-legend-row">
      <span><span class="legend-dot legend-dot--win"></span>Día ganador</span>
      <span><span class="legend-dot legend-dot--loss"></span>Día perdedor</span>
      <span><span class="legend-dot legend-dot--current"></span>Mes actual</span>
    </div>

    <div class="pnlcal-layout">
      <div class="pnlcal-card pnlcal-month-card">
        <div class="calendar-grid">
          ${model.calendar.headers.map((head) => `<div class="calendar-head">${head}</div>`).join("")}
          <div class="calendar-head calendar-head--summary">Sem</div>
          ${calendarRows.join("")}
        </div>
      </div>
    </div>

    <div class="tl-section-card" style="margin-top:16px">
      <div class="tl-section-header"><div class="tl-section-title">Tabla de Rentabilidad</div></div>
      <div class="table-wrap">
        <table>
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
            ${model.monthlyMatrix.map((year) => `
              <tr>
                <td>${year.year}</td>
                ${year.months.map((monthCell) => `<td class="${monthCell.pnl == null ? "" : monthCell.pnl >= 0 ? "metric-positive" : "metric-negative"}">${monthCell.pnl == null ? "—" : formatPercent(monthCell.returnPct)}</td>`).join("")}
                <td class="${year.totalPnl >= 0 ? "metric-positive" : "metric-negative"}">${formatPercent(year.totalReturnPct)}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="13">Grand Total</th>
              <th class="${grandTotal >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(grandTotal)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="tl-section-card" style="margin-top:16px">
      <div class="tl-section-header">
        <div class="tl-section-title">Rentabilidad Acumulada</div>
        <div class="pnlcal-range-switch">
          ${["YTD", "6M", "1A", "TOTAL"].map((option) => `
            <button class="pnlcal-range-btn ${range === option ? "active" : ""}" type="button" data-cumulative-range="${option}">${option}</button>
          `).join("")}
        </div>
      </div>
      <div class="trades-kpi-row">
        <div><div class="tl-kpi-label">Rentabilidad total</div><div class="metric-large ${totalReturnColor}">${formatPercent(cumulativeView.totalPct)}</div></div>
        <div><div class="tl-kpi-label">P&L neto</div><div class="metric-large ${cumulativeView.totalUsd >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(cumulativeView.totalUsd)}</div></div>
        <div><div class="tl-kpi-label">Última act.</div><div class="metric-large" style="font-size:16px">${cumulativeView.lastUpdate ? cumulativeView.lastUpdate.toLocaleDateString("es-ES") : "—"}</div></div>
        <div><div class="tl-kpi-label">Rango</div><div class="metric-large" style="font-size:16px">${range}</div></div>
      </div>
      ${chartCanvas("calendar-cumulative-return", 220, "kmfx-chart-shell--feature kmfx-chart-shell--blended-card")}
    </div>
  `;

  root.querySelectorAll("[data-cumulative-range]").forEach((button) => {
    button.addEventListener("click", () => {
      root.__calendarRange = button.dataset.cumulativeRange;
      renderCalendar(root, state);
    });
  });

  root.querySelectorAll("[data-calendar-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.calendarDay;
      const dayTrades = model.trades.filter((trade) => trade.when.toISOString().slice(0, 10) === key);
      const dayPnl = dayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
      openModal({
        title: `Detalle del ${new Date(key).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}`,
        subtitle: `${dayTrades.length} trades · ${formatCurrency(dayPnl)}`,
        maxWidth: 820,
        content: `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Símbolo</th>
                  <th>Dir</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>P&L $</th>
                  <th>Setup</th>
                  <th>Sesión</th>
                </tr>
              </thead>
              <tbody>
                ${dayTrades.map((trade) => `
                  <tr>
                    <td>${trade.when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>${trade.symbol}</td>
                    <td>${trade.side}</td>
                    <td>${trade.entry}</td>
                    <td>${trade.exit}</td>
                    <td class="${trade.pnl >= 0 ? "metric-positive" : "metric-negative"}">${formatCurrency(trade.pnl)}</td>
                    <td>${trade.setup}</td>
                    <td>${trade.session}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
      });
    });
  });

  mountCharts(root, [
    lineAreaSpec("calendar-cumulative-return", cumulativeView.curve, {
      tone: "blue",
      showAxisBorder: true,
      axisBorderColor: axisLine,
      axisBorderWidth: 1,
      formatter: (value, context) => {
        const point = cumulativeView.curve[context.dataIndex];
        return `${formatPercent(value)} · ${formatCurrency(point.pnl)}`;
      },
      axisFormatter: (value) => `${Number(value).toFixed(1)}%`,
      fillAlphaStart: 0.18
    })
  ]);
}

function getCalendarRange(root) {
  if (!root.__calendarRange) root.__calendarRange = "TOTAL";
  return root.__calendarRange;
}

function getCumulativeView(model, range) {
  const curve = model.cumulative.curve || [];
  if (!curve.length) return { curve: [], totalPct: 0, totalUsd: 0, lastUpdate: null };
  const datedCurve = curve.map((point, index) => ({
    ...point,
    when: model.trades[index]?.when || null
  }));
  const lastDate = datedCurve[datedCurve.length - 1]?.when || model.cumulative.lastUpdate || new Date();
  let filtered = datedCurve;

  if (range === "YTD") {
    filtered = datedCurve.filter((point) => point.when && point.when.getFullYear() === lastDate.getFullYear());
  } else if (range === "6M") {
    const cutoff = new Date(lastDate);
    cutoff.setMonth(cutoff.getMonth() - 6);
    filtered = datedCurve.filter((point) => point.when && point.when >= cutoff);
  } else if (range === "1A") {
    const cutoff = new Date(lastDate);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    filtered = datedCurve.filter((point) => point.when && point.when >= cutoff);
  }

  if (!filtered.length) filtered = datedCurve;
  const firstPnl = filtered[0]?.pnl || 0;
  const normalized = filtered.map((point, index) => ({
    ...point,
    value: Number((point.value - (filtered[0]?.value || 0)).toFixed(2)),
    pnl: point.pnl - firstPnl,
    label: point.label || `P${index + 1}`
  }));

  return {
    curve: normalized,
    totalPct: normalized[normalized.length - 1]?.value || 0,
    totalUsd: normalized[normalized.length - 1]?.pnl || 0,
    lastUpdate: lastDate
  };
}
