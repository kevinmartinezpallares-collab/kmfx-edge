/**
 * KMFX Edge — createReturnHistogram()
 * ─────────────────────────────────────────────────────────────────────────────
 * Daily-return distribution histogram matching the KMFX Edge dark dashboard.
 *
 * VISUAL FEATURES
 * ───────────────
 * • Inactive bars  → dark vertical gradient (#2e2e42 → #1a1a28), pill top corners
 * • Negative bars  → solid #ff4466  (KMFX losing-trades red)
 * • Positive bars  → solid #00ff88  (KMFX winning-trades green)
 * • Count label    above each non-zero bar
 * • Floating tooltip matching dashboard card style
 * • Blue-dot + title header matching other KMFX analysis cards
 *
 * USAGE
 * ─────
 * 1. Add container in your HTML:
 *      <div id="returnHistogram"></div>
 *
 * 2. Initialise once when the section renders:
 *      createReturnHistogram('returnHistogram');
 *
 * 3. Feed live data from your WebSocket bridge:
 *      if (msg.type === 'daily_returns') {
 *        updateReturnHistogram(msg.data);  // number[] of daily % returns
 *      }
 *
 * DEPENDENCIES
 * ────────────
 * Chart.js must already be loaded globally (window.Chart).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Configuration ────────────────────────────────────────────────────────────

const HISTOGRAM_CONFIG = {
  bins:      18,
  minReturn: -3.0,
  maxReturn:  4.5,

  colors: {
    negative:     '#ff4466',
    positive:     '#00ff88',
    inactiveTop:  '#2e2e42',
    inactiveBot:  '#1a1a28',
    labelText:    '#666680',
    valueLabel:   '#ccccdd',
    tooltipBg:    '#1a1a2e',
    tooltipBorder:'#2a2a3e',
  },

  font: {
    family: "'Inter', 'Segoe UI', sans-serif",
    size:   11,
  },
};

// ─── Module state ─────────────────────────────────────────────────────────────

let _histChart    = null;
const _histCanvasId = '_kmfxHistCanvas';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * createReturnHistogram(containerId)
 * Injects card markup and initialises Chart.js.
 *
 * @param {string} containerId  id of the wrapper <div>
 */
function createReturnHistogram(containerId) {
  const wrapper = document.getElementById(containerId);
  if (!wrapper) {
    console.warn(`[KMFX Histogram] #${containerId} not found`);
    return;
  }

  wrapper.innerHTML = `
    <div class="kmfx-hist-card" style="
      background:#161616;
      border:1px solid rgba(255,255,255,0.07);
      border-radius:12px;
      padding:20px 24px 16px;
      position:relative;
    ">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;">
        <span style="
          width:8px;height:8px;border-radius:50%;
          background:#4488ff;display:inline-block;flex-shrink:0;
        "></span>
        <span style="
          font-size:14px;font-weight:600;color:#ffffff;
          letter-spacing:0.01em;
          font-family:'Inter','Segoe UI',sans-serif;
        ">Distribución de Rentabilidad Diaria</span>
      </div>

      <div style="position:relative;width:100%;height:260px;">
        <canvas id="${_histCanvasId}"></canvas>
      </div>

      <div style="
        text-align:center;font-size:11px;color:#444458;
        margin-top:10px;letter-spacing:0.05em;
        font-family:'Inter','Segoe UI',sans-serif;
      ">Rentabilidad diaria (%)</div>

      <div id="_kmfxHistTooltip" style="
        position:absolute;display:none;
        background:#1a1a2e;border:1px solid #2a2a3e;
        border-radius:8px;padding:10px 14px;
        font-size:12px;color:#fff;
        pointer-events:none;z-index:20;min-width:170px;
        box-shadow:0 4px 20px rgba(0,0,0,0.6);
        font-family:'Inter','Segoe UI',sans-serif;
      ">
        <div id="_kmfxHistTT1" style="color:#888;margin-bottom:4px;font-size:11px;"></div>
        <div id="_kmfxHistTT2" style="font-size:14px;font-weight:600;"></div>
      </div>
    </div>
  `;

  _buildChart([]);
}

/**
 * updateReturnHistogram(dailyReturns)
 * Recomputes bins and refreshes the chart.
 *
 * @param {number[]} dailyReturns  daily return values in %
 */
function updateReturnHistogram(dailyReturns) {
  if (!_histChart) {
    console.warn('[KMFX Histogram] Not initialised — call createReturnHistogram() first.');
    return;
  }

  const { bins } = HISTOGRAM_CONFIG;
  const { labels, counts, binEdges } = _computeBins(dailyReturns, bins);

  // null = draw gradient (inactive), string = active colour
  const bgColors = binEdges.map(([lo], i) => {
    if (counts[i] === 0) return null;
    return lo < 0
      ? HISTOGRAM_CONFIG.colors.negative
      : HISTOGRAM_CONFIG.colors.positive;
  });

  _histChart.data.labels                      = labels;
  _histChart.data.datasets[0].data            = counts;
  _histChart.data.datasets[0].backgroundColor = bgColors;
  _histChart.data.datasets[0]._binEdges       = binEdges;
  _histChart.update('active');
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _computeBins(values, numBins) {
  const { minReturn, maxReturn } = HISTOGRAM_CONFIG;
  const binWidth = (maxReturn - minReturn) / numBins;
  const counts   = new Array(numBins).fill(0);
  const binEdges = [];

  for (let i = 0; i < numBins; i++) {
    const lo = minReturn + i * binWidth;
    binEdges.push([lo, lo + binWidth]);
  }
  for (const v of values) {
    const idx = Math.min(Math.floor((v - minReturn) / binWidth), numBins - 1);
    if (idx >= 0 && idx < numBins) counts[idx]++;
  }

  const labels = binEdges.map(([lo, hi]) => ((lo + hi) / 2).toFixed(1) + '%');
  return { labels, counts, binEdges };
}

function _buildChart(initialReturns) {
  const canvas = document.getElementById(_histCanvasId);
  if (!canvas) return;
  if (_histChart) { _histChart.destroy(); _histChart = null; }

  const { bins, colors, font } = HISTOGRAM_CONFIG;
  const { labels, counts, binEdges } = _computeBins(initialReturns, bins);
  const bgColors = new Array(bins).fill(null);  // all inactive at start

  // ── Plugin: draw gradient inactive bars + solid active bars ───────────
  // We fully replace Chart.js bar drawing to get gradient + pill-top control.
  const gradientBarPlugin = {
    id: 'kmfxGradientBars',

    // Draw before Chart.js renders anything on the dataset
    beforeDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta     = chart.getDatasetMeta(0);
      const bottom   = chart.chartArea.bottom;

      meta.data.forEach((bar, i) => {
        const color  = chart.data.datasets[0].backgroundColor[i];
        const x      = bar.x - bar.width / 2;
        const y      = bar.y;
        const w      = bar.width;
        const h      = bottom - y;
        const radius = Math.min(5, w / 2, h);  // pill top corners

        if (h <= 0) return;  // skip zero-height bars

        ctx.save();

        // Rounded-top rectangle
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, bottom);
        ctx.lineTo(x, bottom);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        if (!color) {
          // Inactive bar — dark vertical gradient
          const grad = ctx.createLinearGradient(0, y, 0, y + h);
          grad.addColorStop(0, colors.inactiveTop);
          grad.addColorStop(1, colors.inactiveBot);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = color;
        }

        ctx.fill();
        ctx.restore();
      });
    },

    // Suppress Chart.js default bar rendering (we already drew everything)
    beforeDatasetDraw() {
      return false;
    },
  };

  // ── Plugin: value labels above bars ───────────────────────────────────
  const valueLabelPlugin = {
    id: 'kmfxValueLabels',
    afterDraw(chart) {
      const { ctx, data } = chart;
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const v = data.datasets[0].data[i];
        if (!v) return;
        ctx.save();
        ctx.fillStyle = colors.valueLabel;
        ctx.font      = `500 ${font.size}px ${font.family}`;
        ctx.textAlign = 'center';
        ctx.fillText(v, bar.x, bar.y - 6);
        ctx.restore();
      });
    },
  };

  // ── Plugin: floating tooltip ───────────────────────────────────────────
  const tooltipPlugin = {
    id: 'kmfxTooltip',
    afterEvent(chart, args) {
      const el  = document.getElementById('_kmfxHistTooltip');
      const tt1 = document.getElementById('_kmfxHistTT1');
      const tt2 = document.getElementById('_kmfxHistTT2');
      if (!el) return;

      const hits = chart.getElementsAtEventForMode(
        args.event.native, 'nearest', { intersect: true }, false
      );
      if (!hits.length) { el.style.display = 'none'; return; }

      const idx   = hits[0].index;
      const count = chart.data.datasets[0].data[idx];
      const edges = chart.data.datasets[0]._binEdges?.[idx];
      if (!edges) return;

      const [lo, hi] = edges;
      tt1.textContent = count === 1
        ? '1 día con retorno entre'
        : `${count} días con retorno entre`;
      tt2.textContent = `${lo.toFixed(2)}%  y  ${hi.toFixed(2)}%`;
      tt2.style.color = lo < 0 ? colors.negative : colors.positive;

      const card  = el.closest('.kmfx-hist-card');
      const cRect = card.getBoundingClientRect();
      const bar   = chart.getDatasetMeta(0).data[idx];
      const bRect = chart.canvas.getBoundingClientRect();
      const cx    = bar.x + bRect.left - cRect.left;
      const cy    = bar.y + bRect.top  - cRect.top;

      el.style.display = 'block';
      el.style.left    = Math.min(cx - 85, card.offsetWidth - 190) + 'px';
      el.style.top     = (cy - 90) + 'px';
    },
  };

  // ── Chart.js instance ─────────────────────────────────────────────────
  _histChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data:            counts,
        backgroundColor: bgColors,
        borderWidth:     0,
        borderSkipped:   false,
        _binEdges:       binEdges,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 500, easing: 'easeOutQuart' },
      layout:              { padding: { top: 22 } },
      plugins: {
        legend:  { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid:   { display: false },
          border: { display: false },
          ticks: {
            color:       colors.labelText,
            font:        { size: font.size, family: font.family },
            maxRotation: 0,
            autoSkip:    false,
            callback(val, i) {
              const showAt = [0, Math.floor(bins / 2), bins - 1];
              return showAt.includes(i) ? this.getLabelForValue(val) : '';
            },
          },
        },
        y: { display: false, grid: { display: false } },
      },
      onHover(e, els) {
        e.native.target.style.cursor = els.length ? 'crosshair' : 'default';
      },
    },
    plugins: [gradientBarPlugin, valueLabelPlugin, tooltipPlugin],
  });

  _histChart.data.datasets[0]._binEdges = binEdges;
}

// ─── WebSocket integration ────────────────────────────────────────────────────
/*
  ADD THIS BLOCK INSIDE YOUR EXISTING ws.onmessage HANDLER:

  ws.onmessage = function(event) {
    const msg = JSON.parse(event.data);

    // ... your existing handlers ...

    if (msg.type === 'daily_returns') {
      updateReturnHistogram(msg.data);
    }
  };


  PYTHON BRIDGE — emit once on connect and after each day closes:

    daily_returns = []
    for day in closed_days:
        pct = round((day['profit'] / starting_balance) * 100, 4)
        daily_returns.append(pct)

    await websocket.send(json.dumps({
        "type": "daily_returns",
        "data": daily_returns
    }))
*/
