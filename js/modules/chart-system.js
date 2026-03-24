const chartRegistry = new WeakMap();
const chartRoots = new Set();
const rootResizeObservers = new WeakMap();
let lifecycleHooksBound = false;

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

function externalTooltipHandler(context) {
  const { chart, tooltip } = context;
  const tooltipEl = ensureTooltipEl(chart);
  if (!tooltipEl) return;

  if (!tooltip || tooltip.opacity === 0) {
    tooltipEl.classList.remove("is-visible");
    return;
  }

  const title = tooltip.title?.[0] || "";
  const body = tooltip.body?.map((item) => item.lines.join(" ")).join(" ") || "";
  const isBarChart = chart?.config?.type === "bar";
  tooltipEl.classList.toggle("is-minimal", chart?.config?.options?.plugins?.tooltip?.kmfxMinimal === true);
  tooltipEl.classList.toggle("has-title", Boolean(title));
  tooltipEl.classList.toggle("is-bar-chart", isBarChart);
  tooltipEl.querySelector(".kmfx-chart-tooltip-title").textContent = title;
  tooltipEl.querySelector(".kmfx-chart-tooltip-body").textContent = body;

  const host = chart.canvas.parentNode;
  const positionX = chart.canvas.offsetLeft;
  const positionY = chart.canvas.offsetTop;
  const clientWidth = host?.clientWidth || chart.canvas.clientWidth;
  const clientHeight = host?.clientHeight || chart.canvas.clientHeight;
  const tooltipWidth = tooltipEl.offsetWidth || 136;
  const tooltipHeight = tooltipEl.offsetHeight || 48;
  const rawLeft = positionX + tooltip.caretX - (tooltipWidth / 2);
  const rawTop = positionY + tooltip.caretY - tooltipHeight - 14;
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
  if (tone === "violet") {
    return { start: getCssVar("--chart-violet-a"), end: getCssVar("--chart-violet-b") };
  }
  if (tone === "green") {
    return { start: getCssVar("--green"), end: "#7ef0b0" };
  }
  if (tone === "red") {
    return { start: getCssVar("--red"), end: "#ff8ca7" };
  }
  if (tone === "gold") {
    return { start: getCssVar("--gold"), end: "#f8dd78" };
  }
  return { start: getCssVar("--chart-blue-a"), end: getCssVar("--chart-blue-b") };
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
  gradient.addColorStop(0, withAlpha(end, hover ? 0.96 : 0.9));
  gradient.addColorStop(0.18, withAlpha(end, hover ? 0.9 : 0.82));
  gradient.addColorStop(0.48, withAlpha(start, hover ? 0.92 : 0.84));
  gradient.addColorStop(1, withAlpha(start, hover ? 0.76 : 0.68));
  return gradient;
}

function solidToneColor(tone, value = null) {
  if (tone === "violet") return withAlpha(getCssVar("--chart-violet-a"), 0.78);
  if (tone === "green") return withAlpha(getCssVar("--green"), 0.84);
  if (tone === "red") return withAlpha(getCssVar("--red"), 0.84);
  if (tone === "blue") return withAlpha(getCssVar("--chart-blue-a"), 0.8);
  if (value != null) return value >= 0 ? withAlpha(getCssVar("--green"), 0.84) : withAlpha(getCssVar("--red"), 0.84);
  return withAlpha(getCssVar("--chart-blue-a"), 0.8);
}

function solidToneHoverColor(tone, value = null) {
  if (tone === "violet") return withAlpha(getCssVar("--chart-violet-b"), 0.9);
  if (tone === "green") return withAlpha(getCssVar("--green"), 0.92);
  if (tone === "red") return withAlpha(getCssVar("--red"), 0.92);
  if (tone === "blue") return withAlpha(getCssVar("--chart-blue-b"), 0.9);
  if (value != null) return value >= 0 ? withAlpha(getCssVar("--green"), 0.92) : withAlpha(getCssVar("--red"), 0.92);
  return withAlpha(getCssVar("--chart-blue-b"), 0.9);
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

    ctx.save();

    meta.data.forEach((element, index) => {
      const value = Number(dataset.data[index] ?? 0);
      const width = Math.max(
        pluginOptions?.minWidth ?? 18,
        Math.min(pluginOptions?.maxWidth ?? 26, element.width || pluginOptions?.width || 22)
      );
      const x = element.x - width / 2;
      const isActive = index === activeIndex;

      roundedRectPath(ctx, x, top, width, trackHeight, width / 2);
      ctx.fillStyle = withAlpha(
        getCssVar("--border") || "#334155",
        isActive ? (pluginOptions?.trackActiveAlpha ?? 0.11) : (pluginOptions?.trackAlpha ?? 0.08)
      );
      ctx.fill();

      const barTop = Math.min(element.y, element.base);
      const barBottom = Math.max(element.y, element.base);
      const barHeight = Math.max(0, barBottom - barTop);
      if (!barHeight) return;

      let tone = fallbackTone;
      if (pluginOptions?.positiveNegative) {
        tone = value >= 0 ? "green" : "red";
      }

      const barGradient = createBarSurfaceGradient(
        ctx,
        { left: x, right: x + width, top: barTop, bottom: barBottom },
        tone,
        isActive
      );
      roundedRectPath(ctx, x, barTop, width, barHeight, width / 2);
      ctx.fillStyle = pluginOptions?.solid === true ? solidToneColor(tone, value) : barGradient;
      ctx.fill();

      const capHeight = Math.max(4, Math.min(8, width * 0.32));
      const capInset = Math.max(1.5, width * 0.08);
      roundedRectPath(ctx, x + capInset, barTop + 1, width - capInset * 2, capHeight, (width - capInset * 2) / 2);
      ctx.fillStyle = withAlpha("#ffffff", isActive ? 0.18 : 0.12);
      ctx.fill();
    });

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
  ChartLib.register(glowLinePlugin, crosshairPlugin, doughnutCenterPlugin, barTrackPlugin, referencePillBarPlugin);
  ChartLib.__kmfxDefaultsApplied = true;
}

function createSparklineChart(ChartLib, canvas, spec) {
  const { start, end } = toneColors(spec.tone || "blue");
  return new ChartLib(canvas, {
    type: "line",
    data: {
      labels: spec.points.map((point) => point.label),
      datasets: [{
        data: spec.points.map((point) => point.value),
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
  return new ChartLib(canvas, {
    type: "line",
    data: {
      labels: spec.points.map((point) => point.label),
      datasets: [{
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
      }]
    },
    options: {
      ...buildBaseOptions(spec),
      scales: {
        x: {
          display: spec.showXAxis ?? (spec.showAxes ?? true),
          border: {
            display: spec.showAxisBorder ?? false,
            color: getCssVar("--chart-axis-line") || withAlpha(getCssVar("--border") || "#334155", 0.14),
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
          border: {
            display: spec.showAxisBorder ?? false,
            color: getCssVar("--chart-axis-line") || withAlpha(getCssVar("--border") || "#334155", 0.14),
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
        kmfxCrosshair: spec.crosshair === false ? false : { color: withAlpha(start, spec.crosshairAlpha ?? 0.12), lineWidth: 0.85 },
        tooltip: {
          ...buildBaseOptions(spec).plugins.tooltip,
          callbacks: spec.tooltipCallbacks || {
            title: (items) => items[0]?.label || "",
            label: (context) => spec.formatter ? spec.formatter(context.parsed.y, context) : `${context.parsed.y}`
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
        barThickness: spec.barThickness ?? Math.min(spec.maxBarThickness || 14, mobile ? 10 : 12),
        maxBarThickness: Math.min(spec.maxBarThickness || 22, mobile ? 18 : 22),
        categoryPercentage: spec.categoryPercentage || 0.9,
        barPercentage: spec.barPercentage || 0.92,
        backgroundColor(context) {
          if (useReferencePillBars) return "rgba(0,0,0,0)";
          const value = context.raw;
          if (spec.focusBarStyle) {
            if (context.dataIndex !== focusIndex) {
              return withAlpha(getCssVar("--text4") || "#94a3b8", spec.neutralAlpha ?? 0.12);
            }
            const area = context.chart.chartArea;
            if (!area) return start;
            return createBarSurfaceGradient(context.chart.ctx, area, spec.tone || "blue", false);
          }
          if (spec.solidBars) {
            if (spec.positiveNegative) {
              const tone = value >= 0 ? "green" : "red";
              const area = context.chart.chartArea;
              if (!area) return solidToneColor(tone);
              return createBarSurfaceGradient(context.chart.ctx, area, tone, false);
            }
            return solidToneColor(spec.tone || "blue");
          }
          if (spec.positiveNegative) {
            const area = context.chart.chartArea;
            if (!area) return value >= 0 ? toneColors("green").start : toneColors("red").start;
            return createBarSurfaceGradient(context.chart.ctx, area, value >= 0 ? "green" : "red", false);
          }
          const area = context.chart.chartArea;
          if (!area) return start;
          return createBarSurfaceGradient(context.chart.ctx, area, spec.tone || "blue", false);
        },
        hoverBackgroundColor(context) {
          if (useReferencePillBars) return "rgba(0,0,0,0)";
          const value = context.raw;
          if (spec.focusBarStyle) {
            if (context.dataIndex !== focusIndex) {
              return withAlpha(getCssVar("--text4") || "#94a3b8", spec.neutralAlpha ?? 0.12);
            }
            const area = context.chart.chartArea;
            if (!area) return end;
            return createBarSurfaceGradient(context.chart.ctx, area, spec.tone || "blue", true);
          }
          if (spec.solidBars) {
            if (spec.positiveNegative) {
              const tone = value >= 0 ? "green" : "red";
              const area = context.chart.chartArea;
              if (!area) return solidToneHoverColor(tone);
              return createBarSurfaceGradient(context.chart.ctx, area, tone, true);
            }
            return solidToneHoverColor(spec.tone || "blue");
          }
          if (spec.positiveNegative) {
            const area = context.chart.chartArea;
            if (!area) return value >= 0 ? toneColors("green").start : toneColors("red").start;
            return createBarSurfaceGradient(context.chart.ctx, area, value >= 0 ? "green" : "red", true);
          }
          const area = context.chart.chartArea;
          if (!area) return end;
          return createBarSurfaceGradient(context.chart.ctx, area, spec.tone || "blue", true);
        },
        borderColor(context) {
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
            autoSkip: mobile,
            maxRotation: 0,
            minRotation: 0,
            maxTicksLimit: spec.maxXTicks || (mobile ? 4 : undefined)
          },
          grid: { display: false, drawBorder: false }
        },
        y: {
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
              solid: spec.referenceSolidBars === true,
              minWidth: spec.trackMinWidth ?? (mobile ? 18 : 26),
              maxWidth: spec.trackMaxWidth ?? (mobile ? 18 : 26),
              topInset: spec.trackTopInset ?? 6,
              bottomInset: spec.trackBottomInset ?? 2,
              trackAlpha: spec.trackAlpha ?? 0.08,
              trackActiveAlpha: spec.trackActiveAlpha ?? 0.11
            }
          : false,
        tooltip: {
          ...buildBaseOptions(spec).plugins.tooltip,
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
