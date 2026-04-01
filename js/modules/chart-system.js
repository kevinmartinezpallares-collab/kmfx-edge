const chartRegistry = new WeakMap();
const chartRoots = new Set();
const rootResizeObservers = new WeakMap();
let lifecycleHooksBound = false;

const CHART_COLORS_LIGHT = {
  primary: "#2f6bff",
  primaryFill: "rgba(47,107,255,0.08)",
  positive: "#21a36a",
  negative: "#d95b72",
  neutral: "rgba(0,0,0,0.12)",
  gridLine: "rgba(0,0,0,0.06)",
  axisText: "rgba(0,0,0,0.40)",
  baseline: "rgba(0,0,0,0.15)"
};

function isDarkThemeActive() {
  return document.documentElement.matches("[data-theme=\"dark\"]")
    || document.body?.matches?.("[data-theme=\"dark\"]");
}

function isRenderable(element) {
  if (!element || !element.isConnected) return false;
  const rect = element.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function refreshChartInstance(chart) {
  if (!chart?.canvas || !isRenderable(chart.canvas)) return;
  chart.resize();
  chart.update("none");
}

function refreshChartsForRoot(root, attempt = 0) {
  const charts = chartRegistry.get(root) || [];
  if (!charts.length) return;
  const rootVisible = isRenderable(root);
  const allVisible = rootVisible && charts.every((chart) => isRenderable(chart.canvas));
  if (!allVisible && attempt < 8) {
    window.setTimeout(() => refreshChartsForRoot(root, attempt + 1), attempt < 2 ? 60 : 120);
    return;
  }

  requestAnimationFrame(() => {
    charts.forEach(refreshChartInstance);
    requestAnimationFrame(() => {
      charts.forEach(refreshChartInstance);
    });
  });
}

function refreshAllCharts() {
  chartRoots.forEach((root) => refreshChartsForRoot(root));
}

function observeRootLayout(root) {
  if (typeof ResizeObserver === "undefined" || rootResizeObservers.has(root)) return;
  const observer = new ResizeObserver(() => {
    refreshChartsForRoot(root);
  });
  observer.observe(root);
  rootResizeObservers.set(root, observer);
}

function bindLifecycleHooks() {
  if (lifecycleHooksBound || typeof window === "undefined") return;
  lifecycleHooksBound = true;

  const scheduleGlobalRefresh = () => {
    requestAnimationFrame(() => {
      refreshAllCharts();
    });
  };

  window.addEventListener("resize", scheduleGlobalRefresh, { passive: true });
  window.addEventListener("orientationchange", scheduleGlobalRefresh, { passive: true });
  window.addEventListener("kmfx:layout-change", scheduleGlobalRefresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleGlobalRefresh();
  });
  if (document.fonts?.ready) {
    document.fonts.ready.then(scheduleGlobalRefresh).catch(() => {});
  }
  const themeObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.attributeName === "data-theme")) {
      scheduleGlobalRefresh();
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

function ensureTooltipEl(chart) {
  const host = chart.canvas.parentNode;
  if (!host) return null;
  let tooltipEl = host.querySelector(".kmfx-chart-tooltip");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "kmfx-chart-tooltip";
    tooltipEl.innerHTML = '<div class="kmfx-chart-tooltip-title"></div><div class="kmfx-chart-tooltip-body"></div>';
    host.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function hideTooltipEl(chart) {
  const tooltipEl = ensureTooltipEl(chart);
  if (!tooltipEl) return;
  tooltipEl.classList.remove("is-visible", "is-bar-chart", "is-proof-bar-chart", "is-literal-bar-chart", "has-title");
}

function showTooltipEl(chart, { title = "", body = "", left = 0, top = 0, isBarChart = false, isProofBarChart = false, isLiteralBarChart = false }) {
  const tooltipEl = ensureTooltipEl(chart);
  if (!tooltipEl) return;
  tooltipEl.classList.toggle("is-bar-chart", isBarChart);
  tooltipEl.classList.toggle("is-proof-bar-chart", isProofBarChart);
  tooltipEl.classList.toggle("is-literal-bar-chart", isLiteralBarChart);
  tooltipEl.classList.toggle("is-minimal", false);
  tooltipEl.classList.toggle("has-title", Boolean(title));
  tooltipEl.querySelector(".kmfx-chart-tooltip-title").textContent = title;
  tooltipEl.querySelector(".kmfx-chart-tooltip-body").textContent = body;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.classList.add("is-visible");
}

function externalTooltipHandler(context) {
  const { chart, tooltip } = context;
  if (chart?.config?.options?.plugins?.kmfxLiteralHistogram) return;
  const tooltipEl = ensureTooltipEl(chart);
  if (!tooltipEl) return;

  if (!tooltip || tooltip.opacity === 0) {
    tooltipEl.classList.remove("is-visible");
    return;
  }

  const title = tooltip.title?.[0] || "";
  const body = tooltip.body?.map((item) => item.lines.join(" ")).join(" ") || "";
  const isBarChart = chart?.config?.type === "bar";
  const isProofBarChart = chart?.config?.options?.plugins?.tooltip?.kmfxProof === true;
  tooltipEl.classList.toggle("is-minimal", chart?.config?.options?.plugins?.tooltip?.kmfxMinimal === true);
  tooltipEl.classList.toggle("has-title", Boolean(title));
  tooltipEl.classList.toggle("is-bar-chart", isBarChart);
  tooltipEl.classList.toggle("is-proof-bar-chart", isProofBarChart);
  tooltipEl.querySelector(".kmfx-chart-tooltip-title").textContent = title;
  tooltipEl.querySelector(".kmfx-chart-tooltip-body").textContent = body;

  const host = chart.canvas.parentNode;
  const positionX = chart.canvas.offsetLeft;
  const positionY = chart.canvas.offsetTop;
  const clientWidth = host?.clientWidth || chart.canvas.clientWidth;
  const clientHeight = host?.clientHeight || chart.canvas.clientHeight;
  const tooltipWidth = tooltipEl.offsetWidth || 136;
  const tooltipHeight = tooltipEl.offsetHeight || 48;
  const activeIndex = tooltip?.dataPoints?.[0]?.dataIndex ?? -1;
  const referenceColumn = isBarChart && activeIndex >= 0 ? chart?.$kmfxReferenceColumns?.[activeIndex] : null;
  const rawLeft = referenceColumn
    ? positionX + referenceColumn.centerX - (tooltipWidth / 2)
    : positionX + tooltip.caretX - (tooltipWidth / 2);
  const rawTop = referenceColumn
    ? positionY + referenceColumn.top - tooltipHeight - (isProofBarChart ? 18 : 10)
    : positionY + tooltip.caretY - tooltipHeight - (isProofBarChart ? 20 : 14);
  const left = Math.max(8, Math.min(rawLeft, clientWidth - tooltipWidth - 8));
  const top = Math.max(8, rawTop);

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.classList.add("is-visible");
}

function getChartLib() {
  return window.Chart || null;
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
}

function hexToRgb(value) {
  const hex = value.replace("#", "").trim();
  if (hex.length !== 6) return { r: 0, g: 99, b: 245 };
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toneColors(tone) {
  const isDarkTheme = isDarkThemeActive();
  if (tone === "violet") {
    return { start: getCssVar("--chart-violet-a"), end: getCssVar("--chart-violet-b") };
  }
  if (tone === "green") {
    return isDarkTheme
      ? { start: getCssVar("--green"), end: "#7ef0b0" }
      : { start: CHART_COLORS_LIGHT.positive, end: CHART_COLORS_LIGHT.positive };
  }
  if (tone === "red") {
    return isDarkTheme
      ? { start: getCssVar("--red"), end: "#ff8ca7" }
      : { start: CHART_COLORS_LIGHT.negative, end: CHART_COLORS_LIGHT.negative };
  }
  if (tone === "gold") {
    return { start: getCssVar("--gold"), end: "#f8dd78" };
  }
  return isDarkTheme
    ? { start: getCssVar("--chart-blue-a"), end: getCssVar("--chart-blue-b") }
    : { start: CHART_COLORS_LIGHT.primary, end: CHART_COLORS_LIGHT.primary };
}

function createGradient(context, area, tone, alphaStart = 0.16, alphaEnd = 0.01, horizontal = false) {
  const { start, end } = toneColors(tone);
  const gradient = horizontal
    ? context.createLinearGradient(area.left, area.top, area.right, area.top)
    : context.createLinearGradient(area.left, area.top, area.left, area.bottom);
  gradient.addColorStop(0, withAlpha(start, alphaStart));
  gradient.addColorStop(1, withAlpha(end, alphaEnd));
  return gradient;
}

function createBarSurfaceGradient(context, area, tone, hover = false) {
  const { start, end } = toneColors(tone);
  const gradient = context.createLinearGradient(area.left, area.top, area.left, area.bottom);
  gradient.addColorStop(0, withAlpha(end, hover ? 0.84 : 0.76));
  gradient.addColorStop(0.2, withAlpha(end, hover ? 0.8 : 0.72));
  gradient.addColorStop(0.52, withAlpha(start, hover ? 0.78 : 0.68));
  gradient.addColorStop(1, withAlpha(start, hover ? 0.66 : 0.58));
  return gradient;
}

function solidToneColor(tone, value = null) {
  const isDarkTheme = isDarkThemeActive();
  if (tone === "red") return "#B23030";
  if (tone === "green") return isDarkTheme ? "#B2E600" : CHART_COLORS_LIGHT.positive;
  if (tone === "blue" || tone === "violet") return isDarkTheme ? "#B2E600" : CHART_COLORS_LIGHT.primary;
  if (value != null) return value >= 0 ? (isDarkTheme ? "#B2E600" : CHART_COLORS_LIGHT.positive) : "#B23030";
  return isDarkTheme ? "#B2E600" : CHART_COLORS_LIGHT.primary;
}

function solidToneHoverColor(tone, value = null) {
  const isDarkTheme = isDarkThemeActive();
  if (tone === "red") return "#B23030";
  if (tone === "green") return isDarkTheme ? "#B2E600" : CHART_COLORS_LIGHT.positive;
  if (tone === "blue" || tone === "violet") return isDarkTheme ? "#B2E600" : CHART_COLORS_LIGHT.primary;
  if (value != null) return value >= 0 ? (isDarkTheme ? "#B2E600" : CHART_COLORS_LIGHT.positive) : "#B23030";
  return isDarkTheme ? "#B2E600" : CHART_COLORS_LIGHT.primary;
}

function resolveBarTone(spec, point, index, value) {
  const semanticValue = point?.rawValue ?? value;
  if (Array.isArray(spec.pointTones) && spec.pointTones[index]) return spec.pointTones[index];
  if (typeof spec.pointTone === "function") {
    const resolved = spec.pointTone(point, index, semanticValue);
    if (resolved) return resolved;
  }
  if (spec.positiveNegative) return semanticValue >= 0 ? "green" : "red";
  return spec.tone || "blue";
}

function createTrackGradient(ctx, rect, active = false) {
  const gradient = ctx.createLinearGradient(rect.left, rect.top, rect.left, rect.bottom);
  const topColor = withAlpha(getCssVar("--text-muted") || "#94A3B8", active ? 0.2 : 0.14);
  const bottomColor = withAlpha(getCssVar("--text-muted") || "#94A3B8", active ? 0.1 : 0.07);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  return gradient;
}

function createProofTrackGradient(ctx, rect, active = false) {
  const gradient = ctx.createLinearGradient(rect.left, rect.top, rect.left, rect.bottom);
  gradient.addColorStop(0, withAlpha("#6b7280", active ? 0.24 : 0.18));
  gradient.addColorStop(1, withAlpha("#374151", active ? 0.18 : 0.13));
  return gradient;
}

function createInactiveTrackGradient(ctx, rect, pluginOptions) {
  const isDarkTheme = isDarkThemeActive();
  const gradient = ctx.createLinearGradient(rect.left, rect.top, rect.left, rect.bottom);
  gradient.addColorStop(0, pluginOptions?.inactiveTop || (isDarkTheme ? "rgba(255,255,255,0.028)" : CHART_COLORS_LIGHT.neutral));
  gradient.addColorStop(1, pluginOptions?.inactiveBottom || (isDarkTheme ? "rgba(255,255,255,0.016)" : "rgba(0,0,0,0.06)"));
  return gradient;
}

function getBarSlotWidth(meta, index, chartArea) {
  const current = meta.data[index];
  const prev = index > 0 ? meta.data[index - 1] : null;
  const next = index < meta.data.length - 1 ? meta.data[index + 1] : null;
  const leftGap = prev ? current.x - prev.x : next ? next.x - current.x : (chartArea.right - chartArea.left) / Math.max(meta.data.length, 1);
  const rightGap = next ? next.x - current.x : prev ? current.x - prev.x : leftGap;
  return Math.min(leftGap, rightGap);
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function directionalBarPath(ctx, x, y, width, height, radius, { roundTop = false, roundBottom = false } = {}) {
  const rTop = roundTop ? Math.max(0, Math.min(radius, width / 2, height / 2)) : 0;
  const rBottom = roundBottom ? Math.max(0, Math.min(radius, width / 2, height / 2)) : 0;
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  if (rBottom > 0) {
    ctx.lineTo(x, y + rTop);
  } else {
    ctx.lineTo(x, y);
  }
  if (rTop > 0) {
    ctx.lineTo(x, y + rTop);
    ctx.quadraticCurveTo(x, y, x + rTop, y);
    ctx.lineTo(x + width - rTop, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + rTop);
  } else {
    ctx.lineTo(x + width, y);
  }
  if (rBottom > 0) {
    ctx.lineTo(x + width, y + height - rBottom);
    ctx.quadraticCurveTo(x + width, y + height, x + width - rBottom, y + height);
    ctx.lineTo(x + rBottom, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - rBottom);
  } else {
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
  }
  ctx.closePath();
}

function buildBaseOptions(spec) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 480,
      easing: "easeOutQuart"
    },
    interaction: {
      mode: spec.interactionMode || "index",
      intersect: false
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        external: spec.tooltip === false ? undefined : externalTooltipHandler,
        callbacks: spec.tooltipCallbacks || {},
        kmfxMinimal: spec.minimalTooltip === true
      }
    }
  };
}

function collectNumericValues(spec) {
  const values = [];
  (spec.points || []).forEach((point) => {
    const value = Number(point?.value);
    if (Number.isFinite(value)) values.push(value);
  });
  (spec.extraDatasets || []).forEach((dataset) => {
    (dataset.points || []).forEach((point) => {
      const value = Number(point?.value);
      if (Number.isFinite(value)) values.push(value);
    });
  });
  return values;
}

function computeYHeadroom(spec) {
  const values = collectNumericValues(spec);
  if (!values.length) return {};

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.abs(max), 1);
  const topPad = span * (spec.yHeadroomRatio ?? 0.12);
  const bottomPad = span * (spec.yBottomPaddingRatio ?? 0.04);

  if (min >= 0) {
    return {
      suggestedMin: Math.max(0, min - bottomPad),
      suggestedMax: max + topPad
    };
  }

  return {
    suggestedMin: min - bottomPad,
    suggestedMax: max + topPad
  };
}

const glowLinePlugin = {
  id: "kmfxGlowLine",
  beforeDatasetDraw(chart, args, pluginOptions) {
    const dataset = chart.data.datasets[args.index];
    if (!dataset || !dataset.glowColor) return;
    const { ctx } = chart;
    ctx.save();
    ctx.shadowColor = dataset.glowColor;
    ctx.shadowBlur = pluginOptions?.blur || 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  },
  afterDatasetDraw(chart, args) {
    const dataset = chart.data.datasets[args.index];
    if (!dataset || !dataset.glowColor) return;
    chart.ctx.restore();
  }
};

const areaMaskPlugin = {
  id: "kmfxAreaMask",
  afterDatasetsDraw(chart, args, pluginOptions) {
    if (pluginOptions === false || !pluginOptions) return;
    const { ctx, chartArea } = chart;
    if (!ctx || !chartArea) return;

    const left = chartArea.left;
    const top = chartArea.top;
    const width = chartArea.right - chartArea.left;
    const height = chartArea.bottom - chartArea.top;
    if (width <= 0 || height <= 0) return;

    const innerStart = pluginOptions.innerStart ?? 0.08;
    const innerEnd = pluginOptions.innerEnd ?? 0.92;
    const gradient = ctx.createLinearGradient(left, 0, left + width, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(innerStart, "rgba(0,0,0,1)");
    gradient.addColorStop(innerEnd, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, width, height);
    ctx.restore();
  }
};

const crosshairPlugin = {
  id: "kmfxCrosshair",
  afterDatasetsDraw(chart, args, pluginOptions) {
    const active = chart.tooltip?.getActiveElements?.() || [];
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const element = active[0].element;
    if (!element) return;
    ctx.save();
    ctx.strokeStyle = pluginOptions?.color || withAlpha(getCssVar("--border") || "#334155", 0.16);
    ctx.lineWidth = pluginOptions?.lineWidth || 0.85;
    ctx.setLineDash(pluginOptions?.dash || []);
    ctx.beginPath();
    ctx.moveTo(element.x, chartArea.top + 8);
    ctx.lineTo(element.x, chartArea.bottom - 6);
    ctx.stroke();
    ctx.restore();
  }
};

const barTrackPlugin = {
  id: "kmfxBarTracks",
  beforeDatasetsDraw(chart, args, pluginOptions) {
    if (chart.config.type !== "bar" || pluginOptions === false) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;
    const { ctx, chartArea } = chart;
    const top = chartArea.top + (pluginOptions?.topInset ?? 8);
    const bottom = chartArea.bottom - (pluginOptions?.bottomInset ?? 2);
    const height = Math.max(0, bottom - top);
    if (!height) return;

    ctx.save();
    meta.data.forEach((element, index) => {
      const width = Math.max(
        pluginOptions?.minWidth ?? 10,
        Math.min(pluginOptions?.maxWidth ?? 16, element.width || pluginOptions?.width || 12)
      );
      const x = element.x - width / 2;
      const active = chart.tooltip?.getActiveElements?.().some((item) => item.datasetIndex === 0 && item.index === index);
      const tone = active
        ? withAlpha(getCssVar("--chart-blue-a") || "#2f6bff", pluginOptions?.activeAlpha ?? 0.14)
        : withAlpha(getCssVar("--border") || "#334155", pluginOptions?.alpha ?? 0.12);
      roundedRectPath(ctx, x, top, width, height, width / 2);
      ctx.fillStyle = tone;
      ctx.fill();
    });
    ctx.restore();
  }
};

const referencePillBarPlugin = {
  id: "kmfxReferencePillBars",
  afterDatasetsDraw(chart, args, pluginOptions) {
    if (chart.config.type !== "bar" || pluginOptions === false) return;
    const meta = chart.getDatasetMeta(0);
    const dataset = chart.data.datasets?.[0];
    if (!meta?.data?.length || !dataset) return;

    const { ctx, chartArea } = chart;
    const yScale = chart.scales?.y;
    if (!yScale) return;

    const top = chartArea.top + (pluginOptions?.topInset ?? 6);
    const bottom = chartArea.bottom - (pluginOptions?.bottomInset ?? 2);
    const trackHeight = Math.max(0, bottom - top);
    if (!trackHeight) return;

    const activeIndex = chart.tooltip?.getActiveElements?.()?.[0]?.index ?? -1;
    const fallbackTone = pluginOptions?.tone || "blue";
    const referenceColumns = [];

    ctx.save();

    meta.data.forEach((element, index) => {
      const value = Number(dataset.data[index] ?? 0);
      const slotWidth = getBarSlotWidth(meta, index, chartArea);
      const trackWidth = Math.max(
        pluginOptions?.minWidth ?? 18,
        Math.min(pluginOptions?.maxWidth ?? 26, slotWidth * (pluginOptions?.trackWidthRatio ?? 0.82))
      );
      const fillInset = pluginOptions?.fillInset ?? Math.max(1, Math.min(2.5, trackWidth * 0.06));
      const fillWidth = Math.max(4, trackWidth - fillInset * 2);
      const x = element.x - trackWidth / 2;
      const isActive = index === activeIndex;
      referenceColumns.push({ centerX: element.x, top, bottom, left: x, width: trackWidth });

      const trackRect = { left: x, right: x + trackWidth, top, bottom };
      roundedRectPath(ctx, x, top, trackWidth, trackHeight, trackWidth / 2);
      ctx.fillStyle = pluginOptions?.proofMode ? createProofTrackGradient(ctx, trackRect, isActive) : createTrackGradient(ctx, trackRect, isActive);
      ctx.fill();

      const barTop = Math.min(element.y, element.base);
      const barBottom = Math.max(element.y, element.base);
      const barHeight = Math.max(0, barBottom - barTop);
      if (!barHeight) return;

      const point = chart.config.data.labels?.[index] != null
        ? { label: chart.config.data.labels[index], value }
        : { value };
      const tone = resolveBarTone(pluginOptions, point, index, value) || fallbackTone;

      const barGradient = createBarSurfaceGradient(
        ctx,
        { left: x + fillInset, right: x + fillInset + fillWidth, top: barTop, bottom: barBottom },
        tone,
        isActive
      );
      roundedRectPath(ctx, x + fillInset, barTop, fillWidth, barHeight, fillWidth / 2);
      ctx.fillStyle = pluginOptions?.solid === true ? solidToneColor(tone, value) : barGradient;
      ctx.fill();

      const capHeight = Math.max(4, Math.min(7, fillWidth * 0.26));
      const capInset = Math.max(1.2, fillWidth * 0.06);
      roundedRectPath(ctx, x + fillInset + capInset, barTop + 1, fillWidth - capInset * 2, capHeight, (fillWidth - capInset * 2) / 2);
      ctx.fillStyle = withAlpha("#ffffff", isActive ? 0.18 : 0.12);
      ctx.fill();

      if (pluginOptions?.showValueLabels) {
        const labelText = typeof pluginOptions.valueLabelFormatter === "function"
          ? pluginOptions.valueLabelFormatter(value, point, index)
          : `${value}`;
        if (labelText) {
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = withAlpha(getCssVar("--text") || "#F3F5F7", 0.95);
          ctx.font = "700 11px Avenir Next, Nunito Sans, SF Pro Display, sans-serif";
          const labelY = barHeight > 0 ? Math.max(chartArea.top + 12, barTop - 8) : chartArea.bottom - 10;
          ctx.fillText(labelText, element.x, labelY);
          ctx.restore();
        }
      }
    });

    ctx.restore();
    chart.$kmfxReferenceColumns = referenceColumns;
  }
};

const literalHistogramBarPlugin = {
  id: "kmfxLiteralHistogram",
  beforeDatasetDraw(chart, args, pluginOptions) {
    if (chart.config.type !== "bar" || pluginOptions === false || args.index !== 0) return;
    const meta = chart.getDatasetMeta(0);
    const dataset = chart.data.datasets?.[0];
    if (!meta?.data?.length || !dataset) return false;

    const { ctx, chartArea } = chart;
    const top = chartArea.top + (pluginOptions?.topInset ?? 6);
    const bottom = chartArea.bottom - (pluginOptions?.bottomInset ?? 2);
    const trackHeight = Math.max(0, bottom - top);
    const activeIndex = chart.$kmfxLiteralHoverIndex ?? -1;
    const columns = [];

    ctx.save();

    meta.data.forEach((element, index) => {
      const value = Number(dataset.data[index] ?? 0);
      const point = pluginOptions.points?.[index] || { label: chart.data.labels?.[index], value };
      const slotWidth = getBarSlotWidth(meta, index, chartArea);
      const trackWidth = Math.max(
        pluginOptions?.minWidth ?? 22,
        Math.min(pluginOptions?.maxWidth ?? 42, slotWidth * (pluginOptions?.trackWidthRatio ?? 0.9))
      );
      const fillInset = pluginOptions?.fillInset ?? 1;
      const fillWidth = Math.max(4, trackWidth - fillInset * 2);
      const x = element.x - trackWidth / 2;
      const isActive = index === activeIndex;

      const trackRect = { left: x, right: x + trackWidth, top, bottom };
      directionalBarPath(
        ctx,
        x,
        top,
        trackWidth,
        trackHeight,
        Math.min(8, trackWidth / 2),
        { roundTop: true, roundBottom: false }
      );
      ctx.fillStyle = createInactiveTrackGradient(ctx, trackRect, pluginOptions);
      ctx.fill();

      const barTop = Math.min(element.y, element.base);
      const barBottom = Math.max(element.y, element.base);
      const barHeight = Math.max(0, barBottom - barTop);
      const tone = resolveBarTone(pluginOptions, point, index, value);

      if (barHeight > 0) {
        const baseY = element.base;
        const roundTop = element.y < baseY;
        directionalBarPath(
          ctx,
          x + fillInset,
          barTop,
          fillWidth,
          barHeight,
          Math.min(8, fillWidth / 2),
          { roundTop, roundBottom: false }
        );
        ctx.fillStyle = pluginOptions?.solid === true
          ? solidToneColor(tone, value)
          : createBarSurfaceGradient(ctx, { left: x + fillInset, right: x + fillInset + fillWidth, top: barTop, bottom: barBottom }, tone, isActive);
        ctx.fill();
      }

      columns.push({
        centerX: element.x,
        left: x,
        width: trackWidth,
        top,
        bottom,
        fillTop: barHeight > 0 ? barTop : bottom,
        fillBottom: barHeight > 0 ? barBottom : bottom,
        point,
        value,
        tone
      });
    });

    chart.$kmfxReferenceColumns = columns;
    chart.$kmfxLiteralColumns = columns;

    ctx.restore();
    return false;
  },
  afterDatasetsDraw(chart, args, pluginOptions) {
    if (chart.config.type !== "bar" || pluginOptions === false) return;
    const columns = chart.$kmfxLiteralColumns || [];
    if (!columns.length) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    columns.forEach((column, index) => {
      if (!column.value) return;
      const labelText = typeof pluginOptions.valueLabelFormatter === "function"
        ? pluginOptions.valueLabelFormatter(column.value, column.point, index)
        : `${column.value}`;
      if (!labelText) return;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = pluginOptions?.labelColor || withAlpha(getCssVar("--text") || "#F3F5F7", 0.95);
      ctx.font = pluginOptions?.labelFont || "700 11px Inter, 'Segoe UI', sans-serif";
      const labelY = Math.max(chartArea.top + 12, column.fillTop - 8);
      ctx.fillText(labelText, column.centerX, labelY);
    });
    ctx.restore();
  },
  afterEvent(chart, args, pluginOptions) {
    if (chart.config.type !== "bar" || pluginOptions === false) return;
    const nativeEvent = args.event?.native;
    const hits = nativeEvent
      ? chart.getElementsAtEventForMode(nativeEvent, "nearest", { intersect: true }, false)
      : [];
    if (!hits.length) {
      chart.$kmfxLiteralHoverIndex = -1;
      hideTooltipEl(chart);
      return;
    }

    const idx = hits[0].index;
    chart.$kmfxLiteralHoverIndex = idx;
    const column = chart.$kmfxLiteralColumns?.[idx];
    if (!column) return;

    const tooltipWidth = 188;
    const tooltipHeight = 58;
    const host = chart.canvas.parentNode;
    const positionX = chart.canvas.offsetLeft;
    const positionY = chart.canvas.offsetTop;
    const clientWidth = host?.clientWidth || chart.canvas.clientWidth;
    const left = Math.max(10, Math.min(positionX + column.centerX - tooltipWidth / 2, clientWidth - tooltipWidth - 10));
    const top = Math.max(10, positionY + column.fillTop - tooltipHeight - 16);

    const title = typeof pluginOptions.tooltipTitleFormatter === "function"
      ? pluginOptions.tooltipTitleFormatter(column, idx)
      : (column.point?.label || "");
    const body = typeof pluginOptions.tooltipBodyFormatter === "function"
      ? pluginOptions.tooltipBodyFormatter(column, idx)
      : `${column.value}`;

    showTooltipEl(chart, {
      title,
      body,
      left,
      top,
      isBarChart: true,
      isLiteralBarChart: true
    });
  }
};

const zeroDividerPlugin = {
  id: "kmfxZeroDivider",
  afterDatasetsDraw(chart, args, pluginOptions) {
    if (chart.config.type !== "bar" || pluginOptions === false) return;
    const yScale = chart.scales?.y;
    const { chartArea, ctx } = chart;
    if (!yScale || !chartArea) return;
    const zeroY = yScale.getPixelForValue(0);
    if (!Number.isFinite(zeroY) || zeroY < chartArea.top || zeroY > chartArea.bottom) return;
    ctx.save();
    ctx.strokeStyle = pluginOptions?.color || withAlpha(getCssVar("--border-subtle") || getCssVar("--border") || "#94A3B8", pluginOptions?.alpha ?? 0.65);
    ctx.lineWidth = pluginOptions?.lineWidth || 1;
    ctx.beginPath();
    ctx.moveTo(chartArea.left + 4, zeroY + 0.5);
    ctx.lineTo(chartArea.right - 4, zeroY + 0.5);
    ctx.stroke();
    ctx.restore();
  }
};

const literalAxesPlugin = {
  id: "kmfxLiteralAxes",
  afterDatasetsDraw(chart, args, pluginOptions) {
    if (chart.config.type !== "bar" || pluginOptions === false) return;
    const { ctx, chartArea, scales } = chart;
    const xScale = scales?.x;
    const yScale = scales?.y;
    if (!ctx || !chartArea || !xScale || !yScale) return;
    const axisColor = pluginOptions?.color || getCssVar("--chart-axis-line") || withAlpha(getCssVar("--border") || "#334155", 0.14);
    const lineWidth = pluginOptions?.lineWidth || 1;
    const left = Math.round(chartArea.left) + 0.5;
    const right = Math.round(chartArea.right) - 0.5;
    const top = Math.round(chartArea.top) + 0.5;
    const bottom = Math.round(chartArea.bottom) - 0.5;

    ctx.save();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.restore();
  }
};

const doughnutCenterPlugin = {
  id: "kmfxDoughnutCenter",
  afterDraw(chart) {
    const options = chart.config.options.plugins.kmfxDoughnutCenter;
    if (!options?.text) return;
    const { ctx, chartArea } = chart;
    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;
    const radius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) * 0.19;
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = options.backdropColor || withAlpha(getCssVar("--surface") || "#0f1115", 0.985);
    ctx.strokeStyle = withAlpha(getCssVar("--border") || "#334155", 0.26);
    ctx.lineWidth = 1;
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = getCssVar("--text");
    ctx.font = "700 30px Avenir Next, Nunito Sans, SF Pro Display, sans-serif";
    ctx.fillText(options.text, centerX, centerY - 3);
    if (options.subtext) {
      ctx.fillStyle = getCssVar("--text3");
      ctx.font = "600 10px Avenir Next, Nunito Sans, SF Pro Display, sans-serif";
      ctx.fillText(options.subtext, centerX, centerY + 14);
    }
    ctx.restore();
  }
};

function ensureDefaults(ChartLib) {
  if (ChartLib.__kmfxDefaultsApplied) return;
  ChartLib.defaults.font.family = "Avenir Next, Nunito Sans, SF Pro Display, sans-serif";
  ChartLib.defaults.color = getCssVar("--chart-axis-text") || getCssVar("--text3");
  ChartLib.defaults.borderColor = getCssVar("--chart-axis-line") || withAlpha(getCssVar("--border") || "#334155", 0.42);
  ChartLib.defaults.scale.grid.color = getCssVar("--chart-grid") || withAlpha(getCssVar("--border") || "#334155", 0.24);
  ChartLib.defaults.plugins.legend.display = false;
  ChartLib.register(glowLinePlugin, areaMaskPlugin, crosshairPlugin, doughnutCenterPlugin, barTrackPlugin, referencePillBarPlugin, literalHistogramBarPlugin, zeroDividerPlugin, literalAxesPlugin);
  ChartLib.__kmfxDefaultsApplied = true;
}

function createSparklineChart(ChartLib, canvas, spec) {
  const { start, end } = toneColors(spec.tone || "blue");
  return new ChartLib(canvas, {
    type: "line",
    data: {
      labels: spec.points.map((point) => point.label),
      datasets: [{
        data: spec.points.map((point) => spec.absoluteBars === true ? Math.abs(point.value) : point.value),
        borderColor(context) {
          const area = context.chart.chartArea;
          if (!area) return start;
          return createGradient(context.chart.ctx, area, spec.tone || "blue", 1, 1, true);
        },
        backgroundColor(context) {
          const area = context.chart.chartArea;
          if (!area) return withAlpha(start, 0.18);
          return createGradient(context.chart.ctx, area, spec.tone || "blue", 0.24, 0.01, false);
        },
        fill: true,
        cubicInterpolationMode: "monotone",
        tension: 0.34,
        pointRadius: 0,
        pointHoverRadius: 2.25,
        pointHoverBorderWidth: 0,
        borderWidth: 1.8,
        glowColor: withAlpha(end, 0.1)
      }]
    },
    options: {
      ...buildBaseOptions(spec),
      interaction: { mode: "index", intersect: false },
      layout: { padding: { left: 0, right: 0, top: 2, bottom: 0 } },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      plugins: {
        ...buildBaseOptions(spec).plugins,
        kmfxCrosshair: false,
        tooltip: {
          ...buildBaseOptions(spec).plugins.tooltip,
          callbacks: {
            title: (items) => items[0]?.label || "",
            label: (context) => spec.formatter ? spec.formatter(context.parsed.y, context) : `${context.parsed.y}`
          }
        }
      }
    }
  });
}

function createLineAreaChart(ChartLib, canvas, spec) {
  const mobile = isMobileViewport();
  const { start, end } = toneColors(spec.tone || "blue");
  const datasets = [{
    data: spec.points.map((point) => point.value),
    borderColor(context) {
      const area = context.chart.chartArea;
      if (!area) return start;
      return createGradient(context.chart.ctx, area, spec.tone || "blue", 1, 1, true);
    },
    backgroundColor(context) {
      const area = context.chart.chartArea;
      if (!area) return withAlpha(start, 0.16);
      return createGradient(context.chart.ctx, area, spec.tone || "blue", spec.fillAlphaStart || 0.16, spec.fillAlphaEnd || 0.01);
    },
    fill: spec.fill !== false,
    cubicInterpolationMode: "monotone",
    tension: spec.tension || 0.34,
    pointRadius: spec.pointRadius ?? 0,
    pointHoverRadius: spec.pointHoverRadius ?? 2.25,
    pointHitRadius: spec.pointHitRadius ?? 16,
    pointHoverBackgroundColor: withAlpha("#ffffff", 0.98),
    pointBackgroundColor: withAlpha("#ffffff", 0.95),
    pointBorderColor: start,
    pointBorderWidth: 1.1,
    borderWidth: spec.borderWidth || 2.05,
    borderCapStyle: "round",
    borderJoinStyle: "round",
    glowColor: withAlpha(end, spec.glowAlpha ?? 0.05)
  }];

  (spec.extraDatasets || []).forEach((datasetSpec) => {
    const overlayTone = datasetSpec.tone || "violet";
    const overlayColors = toneColors(overlayTone);
    datasets.push({
      label: datasetSpec.label || "",
      data: datasetSpec.points.map((point) => point.value),
      borderColor(context) {
        const area = context.chart.chartArea;
        if (!area) return overlayColors.start;
        return createGradient(context.chart.ctx, area, overlayTone, 0.9, 0.9, true);
      },
      backgroundColor: "transparent",
      fill: false,
      cubicInterpolationMode: "monotone",
      tension: datasetSpec.tension ?? spec.tension ?? 0.34,
      pointRadius: datasetSpec.pointRadius ?? 0,
      pointHoverRadius: datasetSpec.pointHoverRadius ?? 0,
      pointHitRadius: datasetSpec.pointHitRadius ?? 10,
      borderWidth: datasetSpec.borderWidth ?? 1.55,
      borderCapStyle: "round",
      borderJoinStyle: "round",
      borderDash: datasetSpec.borderDash || [6, 5],
      glowColor: null
    });
  });
  return new ChartLib(canvas, {
    type: "line",
    data: {
      labels: spec.points.map((point) => point.label),
      datasets
    },
    options: {
      ...buildBaseOptions(spec),
      layout: {
        padding: {
          left: spec.layoutPaddingLeft ?? 0,
          right: spec.layoutPaddingRight ?? 0,
          top: spec.layoutPaddingTop ?? 0,
          bottom: spec.layoutPaddingBottom ?? 0
        }
      },
      scales: {
        x: {
          display: spec.showXAxis ?? (spec.showAxes ?? true),
          border: {
            display: spec.showAxisBorder ?? false,
            color: spec.axisBorderColor || getCssVar("--chart-axis-line") || withAlpha(getCssVar("--border") || "#334155", 0.14),
            width: spec.axisBorderWidth ?? 1
          },
          ticks: {
            color: spec.axisColor || getCssVar("--chart-axis-text") || withAlpha(getCssVar("--text4") || "#94a3b8", 0.9),
            font: { size: spec.axisFontSize || 10, weight: spec.axisFontWeight || "500" },
            padding: spec.xTickPadding ?? 10,
            autoSkip: mobile,
            maxRotation: 0,
            minRotation: 0,
            maxTicksLimit: spec.maxXTicks || (mobile ? 4 : undefined)
          },
          grid: {
            display: spec.showXGrid ?? false,
            drawBorder: false,
            color: getCssVar("--chart-grid") || withAlpha(getCssVar("--border") || "#334155", spec.xGridAlpha ?? 0.03)
          }
        },
        y: {
          display: spec.showYAxis ?? (spec.showAxes ?? true),
          ...computeYHeadroom(spec),
          border: {
            display: spec.showAxisBorder ?? false,
            color: spec.axisBorderColor || getCssVar("--chart-axis-line") || withAlpha(getCssVar("--border") || "#334155", 0.14),
            width: spec.axisBorderWidth ?? 1
          },
          ticks: {
            color: spec.axisColor || getCssVar("--chart-axis-text") || withAlpha(getCssVar("--text4") || "#94a3b8", 0.88),
            font: { size: spec.axisFontSize || 10, weight: spec.axisFontWeight || "500" },
            padding: spec.yTickPadding ?? 12,
            maxTicksLimit: spec.maxYTicks || (mobile ? 3 : 4),
            callback: spec.axisFormatter || ((value) => value)
          },
          grid: {
            display: spec.showYGrid ?? false,
            color: getCssVar("--chart-grid") || withAlpha(getCssVar("--border") || "#334155", spec.gridAlpha ?? 0.035),
            drawBorder: false
          }
        }
      },
      plugins: {
        ...buildBaseOptions(spec).plugins,
        kmfxAreaMask: spec.areaSideFade === true
          ? {
              innerStart: spec.areaSideFadeStart ?? 0.08,
              innerEnd: spec.areaSideFadeEnd ?? 0.92
            }
          : false,
        kmfxCrosshair: spec.crosshair === false ? false : { color: withAlpha(start, spec.crosshairAlpha ?? 0.12), lineWidth: 0.85 },
        tooltip: {
          ...buildBaseOptions(spec).plugins.tooltip,
          callbacks: spec.tooltipCallbacks || {
            title: (items) => items[0]?.label || "",
            label: (context) => {
              if (context.datasetIndex > 0) {
                const overlayFormatter = spec.extraDatasets?.[context.datasetIndex - 1]?.formatter;
                const overlayLabel = context.dataset.label ? `${context.dataset.label}: ` : "";
                const overlayValue = overlayFormatter ? overlayFormatter(context.parsed.y, context) : `${context.parsed.y}`;
                return `${overlayLabel}${overlayValue}`;
              }
              return spec.formatter ? spec.formatter(context.parsed.y, context) : `${context.parsed.y}`;
            }
          }
        }
      }
    }
  });
}

function createBarChart(ChartLib, canvas, spec) {
  const mobile = isMobileViewport();
  const { start, end } = toneColors(spec.tone || "blue");
  const useReferencePillBars = spec.referencePillBars === true;
  const useLiteralHistogramBars = spec.literalHistogramBars === true;
  const focusIndex = spec.focusIndex ?? spec.points.reduce((best, point, index, list) => {
    if (best === -1) return index;
    return Math.abs(point.value) > Math.abs(list[best].value) ? index : best;
  }, -1);
  return new ChartLib(canvas, {
    type: "bar",
    data: {
      labels: spec.points.map((point) => point.label),
      datasets: [{
        data: spec.points.map((point) => point.value),
        borderRadius: 999,
        borderSkipped: false,
        hoverBorderWidth: 0,
        glowColor: spec.positiveNegative ? null : withAlpha(end, spec.glowAlpha ?? 0.12),
        barThickness: spec.barThickness ?? Math.min(spec.maxBarThickness || 24, mobile ? 18 : 26),
        maxBarThickness: Math.min(spec.maxBarThickness || 28, mobile ? 22 : 30),
        categoryPercentage: spec.categoryPercentage || 0.72,
        barPercentage: spec.barPercentage || 0.86,
        backgroundColor(context) {
          if (useLiteralHistogramBars) return "rgba(0,0,0,0)";
          if (useReferencePillBars) return "rgba(0,0,0,0)";
          const value = context.raw;
          const point = spec.points[context.dataIndex];
          const tone = resolveBarTone(spec, point, context.dataIndex, value);
          if (spec.focusBarStyle) {
            if (context.dataIndex !== focusIndex) {
              return withAlpha(getCssVar("--text4") || "#94a3b8", spec.neutralAlpha ?? 0.12);
            }
            const area = context.chart.chartArea;
            if (!area) return start;
            return createBarSurfaceGradient(context.chart.ctx, area, tone, false);
          }
          if (spec.solidBars) {
            const area = context.chart.chartArea;
            if (!area) return solidToneColor(tone, value);
            return createBarSurfaceGradient(context.chart.ctx, area, tone, false);
          }
          const area = context.chart.chartArea;
          if (!area) return start;
          return createBarSurfaceGradient(context.chart.ctx, area, tone, false);
        },
        hoverBackgroundColor(context) {
          if (useLiteralHistogramBars) return "rgba(0,0,0,0)";
          if (useReferencePillBars) return "rgba(0,0,0,0)";
          const value = context.raw;
          const point = spec.points[context.dataIndex];
          const tone = resolveBarTone(spec, point, context.dataIndex, value);
          if (spec.focusBarStyle) {
            if (context.dataIndex !== focusIndex) {
              return withAlpha(getCssVar("--text4") || "#94a3b8", spec.neutralAlpha ?? 0.12);
            }
            const area = context.chart.chartArea;
            if (!area) return end;
            return createBarSurfaceGradient(context.chart.ctx, area, tone, true);
          }
          if (spec.solidBars) {
            const area = context.chart.chartArea;
            if (!area) return solidToneHoverColor(tone, value);
            return createBarSurfaceGradient(context.chart.ctx, area, tone, true);
          }
          const area = context.chart.chartArea;
          if (!area) return end;
          return createBarSurfaceGradient(context.chart.ctx, area, tone, true);
        },
        borderColor(context) {
          if (useLiteralHistogramBars) return "rgba(0,0,0,0)";
          if (useReferencePillBars) return "rgba(0,0,0,0)";
          if (spec.focusBarStyle && context.dataIndex !== focusIndex) {
            return withAlpha(getCssVar("--border") || "#334155", 0.08);
          }
          return "transparent";
        },
        borderWidth: spec.focusBarStyle ? 1 : 0
      }]
    },
    options: {
      ...buildBaseOptions(spec),
      layout: {
        padding: {
          left: spec.layoutPaddingLeft ?? 0,
          right: spec.layoutPaddingRight ?? 0,
          top: spec.layoutPaddingTop ?? 6,
          bottom: spec.layoutPaddingBottom ?? 0
        }
      },
      scales: {
        x: {
          offset: spec.xOffset ?? true,
          ticks: {
            color: getCssVar("--chart-axis-text") || withAlpha(getCssVar("--text4") || "#94a3b8", 0.84),
            font: { size: 10, weight: "500" },
            padding: spec.xTickPadding ?? 8,
            autoSkip: spec.autoSkipXTicks ?? mobile,
            maxRotation: 0,
            minRotation: 0,
            maxTicksLimit: spec.maxXTicks || (mobile ? 4 : undefined),
            callback(value, index, ticks) {
              const point = spec.points?.[index];
              const label = this.getLabelForValue ? this.getLabelForValue(value) : `${value}`;
              if (typeof spec.xAxisFormatter === "function") {
                return spec.xAxisFormatter(label, index, point, ticks, this);
              }
              return label;
            }
          },
          grid: { display: false, drawBorder: false }
        },
        y: {
          ...computeYHeadroom(spec),
          ticks: {
            color: getCssVar("--chart-axis-text") || withAlpha(getCssVar("--text4") || "#94a3b8", 0.76),
            font: { size: 10, weight: "500" },
            padding: spec.yTickPadding ?? 8,
            maxTicksLimit: spec.maxYTicks || (mobile ? 3 : 4),
            callback: spec.axisFormatter || ((value) => value)
          },
          grid: {
            display: spec.showYGrid ?? false,
            color: getCssVar("--chart-grid") || withAlpha(getCssVar("--border") || "#334155", spec.gridAlpha ?? 0.025),
            drawBorder: false
          }
        }
      },
      plugins: {
        ...buildBaseOptions(spec).plugins,
        kmfxBarTracks: spec.barTracks
          ? {
              alpha: spec.trackAlpha ?? 0.1,
              activeAlpha: spec.trackActiveAlpha ?? 0.14,
              minWidth: spec.trackMinWidth ?? (mobile ? 18 : 26),
              maxWidth: spec.trackMaxWidth ?? (mobile ? 18 : 26),
              topInset: spec.trackTopInset ?? 6,
              bottomInset: spec.trackBottomInset ?? 2
            }
          : false,
        kmfxReferencePillBars: useReferencePillBars
          ? {
              tone: spec.tone || "blue",
              positiveNegative: spec.positiveNegative === true,
              pointTone: spec.pointTone,
              pointTones: spec.pointTones,
              solid: spec.referenceSolidBars === true,
              minWidth: spec.trackMinWidth ?? (mobile ? 20 : 30),
              maxWidth: spec.trackMaxWidth ?? (mobile ? 20 : 30),
              trackWidthRatio: spec.trackWidthRatio ?? (mobile ? 0.78 : 0.84),
              fillInset: spec.fillInset ?? (mobile ? 1.2 : 1.6),
              topInset: spec.trackTopInset ?? 6,
              bottomInset: spec.trackBottomInset ?? 2,
              trackAlpha: spec.trackAlpha ?? 0.12,
              trackActiveAlpha: spec.trackActiveAlpha ?? 0.18,
              proofMode: spec.proofMode === true,
              showValueLabels: spec.showValueLabels === true,
              valueLabelFormatter: spec.valueLabelFormatter
            }
          : false,
        kmfxLiteralHistogram: useLiteralHistogramBars
          ? {
              points: spec.points,
              tone: spec.tone || "blue",
              positiveNegative: spec.positiveNegative === true,
              pointTone: spec.pointTone,
              pointTones: spec.pointTones,
              solid: spec.referenceSolidBars === true || spec.solidBars === true,
              minWidth: spec.trackMinWidth ?? (mobile ? 20 : 34),
              maxWidth: spec.trackMaxWidth ?? (mobile ? 20 : 40),
              trackWidthRatio: spec.trackWidthRatio ?? (mobile ? 0.92 : 0.94),
              fillInset: spec.fillInset ?? 0.8,
              topInset: spec.trackTopInset ?? 8,
              bottomInset: spec.trackBottomInset ?? 4,
              inactiveTop: spec.inactiveTrackTop,
              inactiveBottom: spec.inactiveTrackBottom,
              valueLabelFormatter: spec.valueLabelFormatter,
              tooltipTitleFormatter: spec.tooltipTitleFormatter,
              tooltipBodyFormatter: spec.tooltipBodyFormatter
            }
          : false,
        kmfxZeroDivider: spec.zeroDivider
          ? {
              alpha: spec.zeroDividerAlpha ?? 0.55,
              lineWidth: spec.zeroDividerWidth ?? 1
            }
          : false,
        kmfxLiteralAxes: spec.literalAxes !== false
          ? {
              alpha: spec.axisLineAlpha ?? 0.8,
              lineWidth: spec.axisLineWidth ?? 1
            }
          : false,
        tooltip: {
          ...buildBaseOptions(spec).plugins.tooltip,
          enabled: useLiteralHistogramBars ? false : buildBaseOptions(spec).plugins.tooltip.enabled,
          external: useLiteralHistogramBars ? undefined : buildBaseOptions(spec).plugins.tooltip.external,
          kmfxProof: spec.proofMode === true,
          callbacks: spec.tooltipCallbacks || {
            title: (items) => items[0]?.label || "",
            label: (context) => spec.formatter ? spec.formatter(context.parsed.y, context) : `${context.parsed.y}`
          }
        }
      }
    }
  });
}

function createRadarChart(ChartLib, canvas, spec) {
  const { start } = toneColors(spec.tone || "blue");
  return new ChartLib(canvas, {
    type: "radar",
    data: {
      labels: spec.points.map((point) => point.label),
      datasets: [{
        data: spec.points.map((point) => point.value),
        borderColor: withAlpha(start, 0.88),
        backgroundColor: withAlpha(start, spec.fillAlpha ?? 0.08),
        pointBackgroundColor: withAlpha(start, 0.96),
        pointBorderColor: withAlpha(getCssVar("--surface") || "#0f1115", 0.96),
        pointRadius: spec.pointRadius ?? 2.4,
        pointHoverRadius: spec.pointHoverRadius ?? 3,
        borderWidth: spec.borderWidth ?? 1.6
      }]
    },
    options: {
      ...buildBaseOptions(spec),
      plugins: {
        ...buildBaseOptions(spec).plugins,
        tooltip: {
          ...buildBaseOptions(spec).plugins.tooltip,
          callbacks: spec.tooltipCallbacks || {
            title: (items) => items[0]?.label || "",
            label: (context) => spec.formatter ? spec.formatter(context.parsed.r, context) : `${Math.round(context.parsed.r)}%`
          }
        }
      },
      scales: {
        r: {
          min: 0,
          max: spec.max || 100,
          ticks: { display: false, stepSize: spec.stepSize || 20 },
          angleLines: { color: withAlpha(getCssVar("--border") || "#334155", 0.18) },
          grid: { color: withAlpha(getCssVar("--border") || "#334155", 0.14) },
          pointLabels: {
            color: withAlpha(getCssVar("--text3") || "#cbd5e1", 0.86),
            font: { size: spec.labelFontSize || 11, weight: spec.labelFontWeight || "500" }
          }
        }
      }
    }
  });
}

function createDoughnutChart(ChartLib, canvas, spec) {
  const { start, end } = toneColors(spec.tone || "blue");
  const value = Math.max(0, Math.min(spec.value, spec.max || 100));
  const rest = Math.max((spec.max || 100) - value, 0);
  return new ChartLib(canvas, {
    type: "doughnut",
    data: {
      labels: ["Valor", "Resto"],
      datasets: [{
        data: [value, rest],
        borderWidth: 0,
        hoverOffset: 0,
        cutout: spec.cutout || "84%",
        backgroundColor(context) {
          const area = context.chart.chartArea;
          if (context.dataIndex === 1) return withAlpha(getCssVar("--border") || "#334155", 0.3);
          if (!area) return start;
          return createGradient(context.chart.ctx, area, spec.tone || "blue", 1, 1, true);
        }
      }]
    },
    options: {
      ...buildBaseOptions(spec),
      rotation: spec.rotation ?? -110,
      circumference: spec.circumference ?? 220,
      plugins: {
        ...buildBaseOptions(spec).plugins,
        kmfxDoughnutCenter: {
          text: spec.centerText || `${Math.round(value)}`,
          subtext: spec.centerSubtext || "",
          backdropColor: spec.centerBackdropColor || withAlpha(getCssVar("--surface") || "#0f1115", 0.98)
        },
        tooltip: {
          ...buildBaseOptions(spec).plugins.tooltip,
          callbacks: {
            title: () => spec.tooltipTitle || spec.label || "",
            label: () => spec.formatter ? spec.formatter(value) : `${value}`
          }
        }
      }
    }
  });
}

export function chartCanvas(key, height = 96, className = "") {
  return `
    <div class="kmfx-chart-shell ${className}" style="height:${height}px">
      <canvas data-kmfx-chart="${key}"></canvas>
    </div>
  `;
}

export function sparklineSpec(key, points, options = {}) {
  return { kind: "sparkline", key, points, ...options };
}

export function lineAreaSpec(key, points, options = {}) {
  return { kind: "line-area", key, points, ...options };
}

export function barChartSpec(key, points, options = {}) {
  return { kind: "bar", key, points, ...options };
}

export function doughnutSpec(key, value, options = {}) {
  return { kind: "doughnut", key, value, ...options };
}

export function radarSpec(key, points, options = {}) {
  return { kind: "radar", key, points, ...options };
}

export function destroyCharts(root) {
  const charts = chartRegistry.get(root) || [];
  charts.forEach((chart) => chart.destroy());
  chartRegistry.set(root, []);
  chartRoots.delete(root);
  rootResizeObservers.get(root)?.disconnect?.();
  rootResizeObservers.delete(root);
}

export function mountCharts(root, specs) {
  const ChartLib = getChartLib();
  destroyCharts(root);
  if (!ChartLib || !specs?.length) return;
  ensureDefaults(ChartLib);
  bindLifecycleHooks();

  const charts = [];
  specs.forEach((spec) => {
    const canvas = root.querySelector(`[data-kmfx-chart="${spec.key}"]`);
    if (!canvas) return;
    const shell = canvas.parentNode;
    if (shell?.classList) {
      shell.classList.toggle("kmfx-chart-shell--bar", spec.kind === "bar");
      shell.classList.toggle("kmfx-chart-shell--line-area", spec.kind === "line-area");
      shell.classList.toggle("kmfx-chart-shell--sparkline", spec.kind === "sparkline");
      shell.classList.toggle("kmfx-chart-shell--doughnut", spec.kind === "doughnut");
      shell.classList.toggle("kmfx-chart-shell--radar", spec.kind === "radar");
    }
    let chart = null;
    if (spec.kind === "sparkline") chart = createSparklineChart(ChartLib, canvas, spec);
    if (spec.kind === "line-area") chart = createLineAreaChart(ChartLib, canvas, spec);
    if (spec.kind === "bar") chart = createBarChart(ChartLib, canvas, spec);
    if (spec.kind === "doughnut") chart = createDoughnutChart(ChartLib, canvas, spec);
    if (spec.kind === "radar") chart = createRadarChart(ChartLib, canvas, spec);
    if (chart) charts.push(chart);
  });
  chartRegistry.set(root, charts);
  chartRoots.add(root);
  observeRootLayout(root);
  refreshChartsForRoot(root);
}
