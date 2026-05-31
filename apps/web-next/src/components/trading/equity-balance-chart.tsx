"use client";

import * as React from "react";

import type { LivelinePoint } from "liveline";

type EquityBalanceChartProps = {
  data: LivelinePoint[];
  value: number;
  balance: number;
  color: string;
  windowSecs: number;
  formatValue: (value: number) => string;
  formatTime: (time: number) => string;
};

type ChartPoint = {
  time: number;
  value: number;
};

const VIEWBOX_WIDTH = 920;
const COMPACT_VIEWBOX_WIDTH = 460;
const VIEWBOX_HEIGHT = 320;
const CHART_PADDING = {
  top: 26,
  right: 136,
  bottom: 40,
  left: 18,
};
const COMPACT_CHART_PADDING = {
  top: 26,
  right: 86,
  bottom: 40,
  left: 14,
};

function interpolateAtTime(points: ChartPoint[], time: number) {
  if (points.length === 0) return null;

  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (!left || !right || right.time < time) continue;

    const span = right.time - left.time;
    if (span <= 0) return right.value;

    const ratio = (time - left.time) / span;
    return left.value + (right.value - left.value) * ratio;
  }

  return last.value;
}

function visibleWindowPoints(points: ChartPoint[], windowSecs: number): ChartPoint[] {
  const latestTime = points.at(-1)?.time;
  if (!latestTime) return points;

  const leftEdge = latestTime - windowSecs;
  const visible = points.filter((point) => point.time >= leftEdge);
  const leftValue = interpolateAtTime(points, leftEdge);

  if (leftValue === null) return visible;

  const firstVisible = visible[0];
  if (firstVisible && firstVisible.time === leftEdge) return visible;

  return [{ time: leftEdge, value: leftValue }, ...visible];
}

function buildLinearPath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function uniqueTicks(values: number[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = String(Math.round(value));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function EquityBalanceChart({
  data,
  value,
  balance,
  color,
  windowSecs,
  formatValue,
  formatTime,
}: EquityBalanceChartProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const gradientId = React.useId();
  React.useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;

    const updateWidth = () => {
      setContainerWidth(Math.round(element.getBoundingClientRect().width));
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const rawPoints = React.useMemo(
    () =>
      data
        .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
        .map((point) => ({ time: point.time, value: point.value }))
        .toSorted((left, right) => left.time - right.time),
    [data],
  );
  const points = React.useMemo(
    () => visibleWindowPoints(rawPoints, windowSecs),
    [rawPoints, windowSecs],
  );

  if (points.length < 2) {
    return (
      <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
        Historial insuficiente
      </div>
    );
  }

  const isCompact = containerWidth > 0 && containerWidth < 560;
  const viewBoxWidth = isCompact ? COMPACT_VIEWBOX_WIDTH : VIEWBOX_WIDTH;
  const chartPadding = isCompact ? COMPACT_CHART_PADDING : CHART_PADDING;
  const chartLeft = chartPadding.left;
  const chartRight = viewBoxWidth - chartPadding.right;
  const chartTop = chartPadding.top;
  const chartBottom = VIEWBOX_HEIGHT - chartPadding.bottom;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const firstTime = points[0]?.time ?? 0;
  const lastTime = points.at(-1)?.time ?? firstTime + 1;
  const timeSpan = Math.max(1, lastTime - firstTime);
  const values = [...points.map((point) => point.value), value, balance];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = Math.max(0, rawMax - rawMin);
  const accountScale = Math.max(Math.abs(balance), Math.abs(value), 1);
  const minimumRange = Math.max(accountScale * 0.028, rawRange * 1.25, 1);
  const domainMid = (rawMin + rawMax) / 2;
  const domainRange = Math.max(rawRange * 1.36, minimumRange);
  const domainMin = domainMid - domainRange / 2;
  const domainMax = domainMid + domainRange / 2;
  const valueSpan = Math.max(1, domainMax - domainMin);
  const xForTime = (time: number) =>
    chartLeft + ((time - firstTime) / timeSpan) * chartWidth;
  const yForValue = (current: number) =>
    chartBottom - ((current - domainMin) / valueSpan) * chartHeight;
  const plotted = points.map((point) => ({
    x: xForTime(point.time),
    y: yForValue(point.value),
  }));
  const linePath = buildLinearPath(plotted);
  const firstPoint = plotted[0] ?? { x: chartLeft, y: chartBottom };
  const lastPoint = plotted.at(-1) ?? { x: chartRight, y: yForValue(value) };
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(2)} ${chartBottom} L ${firstPoint.x.toFixed(2)} ${chartBottom} Z`;
  const balanceY = yForValue(balance);
  const yTicks = Array.from({ length: 5 }, (_, index) =>
    domainMin + (domainRange / 4) * index,
  ).reverse();
  const xTicks = uniqueTicks([
    firstTime,
    firstTime + timeSpan * 0.33,
    firstTime + timeSpan * 0.66,
    lastTime,
  ]);

  return (
    <div ref={rootRef} className="h-full w-full">
      <svg
        aria-label="Curva de equity y balance"
        className="h-full w-full overflow-visible"
        role="img"
        viewBox={`0 0 ${viewBoxWidth} ${VIEWBOX_HEIGHT}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.015" />
          </linearGradient>
        </defs>

      {yTicks.map((tick) => {
        const y = yForValue(tick);
        return (
          <g key={tick}>
            <line
              stroke="var(--chart-grid)"
              strokeDasharray="1 7"
              strokeOpacity="0.52"
              x1={chartLeft}
              x2={chartRight}
              y1={y}
              y2={y}
            />
            <text
              fill="var(--chart-label)"
              fontSize="14"
              fontWeight="600"
              opacity="0.72"
              x={chartRight + 20}
              y={y + 5}
            >
              {formatValue(tick)}
            </text>
          </g>
        );
      })}

      <line
        stroke="var(--chart-crosshair)"
        strokeDasharray="7 9"
        strokeOpacity="0.64"
        x1={chartLeft}
        x2={chartRight}
        y1={balanceY}
        y2={balanceY}
      />
      <text
        fill="var(--chart-label)"
        fontSize="13"
        fontWeight="700"
        opacity="0.76"
        textAnchor="middle"
        x={(chartLeft + chartRight) / 2}
        y={balanceY - 8}
      >
        Balance
      </text>

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />

      {xTicks.map((tick) => (
        <g key={tick}>
          <line
            stroke="var(--chart-grid)"
            strokeOpacity="0.5"
            x1={xForTime(tick)}
            x2={xForTime(tick)}
            y1={chartBottom}
            y2={chartBottom + 7}
          />
          <text
            fill="var(--chart-label)"
            fontSize="14"
            fontWeight="600"
            opacity="0.72"
            textAnchor="middle"
            x={xForTime(tick)}
            y={chartBottom + 30}
          >
            {formatTime(tick)}
          </text>
        </g>
      ))}

      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        fill="var(--chart-marker-background)"
        r="16"
        stroke="var(--chart-marker-border)"
        strokeOpacity="0.45"
        strokeWidth="4"
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        fill="var(--chart-marker-foreground)"
        r="5"
      />
      <g transform={`translate(${Math.min(chartRight + 18, lastPoint.x + 18)} ${lastPoint.y - 16})`}>
        <rect
          fill="var(--chart-marker-badge-background)"
          height="32"
          rx="16"
          stroke="var(--chart-marker-border)"
          strokeOpacity="0.28"
          width="124"
        />
        <text
          fill="var(--chart-marker-badge-foreground)"
          fontFamily="var(--font-geist-mono), monospace"
          fontSize="13"
          fontWeight="700"
          x="16"
          y="21"
        >
          {formatValue(value)}
        </text>
      </g>
      </svg>
    </div>
  );
}
