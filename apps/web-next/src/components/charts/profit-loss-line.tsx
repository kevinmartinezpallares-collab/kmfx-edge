"use client";

import { curveLinear } from "@visx/curve";
import { LinePath } from "@visx/shape";
import { useCallback, useId, useMemo } from "react";
import { useChart, useChartStable } from "./chart-context";
import {
  type FadeEdges,
  fadeGradientStops,
  resolveFadeSides,
} from "./fade-edges";
import { useProfitLossLegendHover } from "./profit-loss-legend-hover";

// CurveFactory type - simplified version compatible with visx
// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

export const PROFIT_LOSS_POSITIVE_COLOR = "var(--color-emerald-500)";
export const PROFIT_LOSS_NEGATIVE_COLOR = "var(--color-red-500)";

const LEGEND_DIM_OPACITY = 0.25;

export function profitLossColor(value: number) {
  return value >= 0 ? PROFIT_LOSS_POSITIVE_COLOR : PROFIT_LOSS_NEGATIVE_COLOR;
}

export const PROFIT_LOSS_TOOLTIP_LABEL_FALLBACK = "Profit/Loss";

export function resolveProfitLossTooltipLabel(label: string) {
  const trimmed = label.trim();
  return trimmed || PROFIT_LOSS_TOOLTIP_LABEL_FALLBACK;
}

export interface ProfitLossLineProps {
  dataKey: string;
  xDataKey?: string;
  strokeWidth?: number;
  positiveColor?: string;
  negativeColor?: string;
  /** Curve function. Default: curveLinear */
  curve?: CurveFactory;
  /**
   * Fade the line stroke toward transparent at the chart edges.
   * Default: false
   */
  fadeEdges?: FadeEdges;
}

function segmentLegendIndex(isPositive: boolean) {
  return isPositive ? 0 : 1;
}

export function ProfitLossLine({
  dataKey,
  strokeWidth = 2.5,
  positiveColor = PROFIT_LOSS_POSITIVE_COLOR,
  negativeColor = PROFIT_LOSS_NEGATIVE_COLOR,
  curve = curveLinear,
  fadeEdges = false,
}: ProfitLossLineProps) {
  const { tooltipData } = useChart();
  const { hoveredIndex } = useProfitLossLegendHover();
  const { renderData, xScale, yScale, xAccessor, innerHeight, innerWidth } =
    useChartStable();
  const reactId = useId();
  const fadeSides = resolveFadeSides(fadeEdges);
  const fadeStops = fadeSides.any ? fadeGradientStops(fadeSides) : null;
  const positiveGradientId = `profit-loss-gradient-pos-${dataKey}-${reactId}`;
  const negativeGradientId = `profit-loss-gradient-neg-${dataKey}-${reactId}`;
  const positiveClipId = `profit-loss-clip-pos-${dataKey}-${reactId}`;
  const negativeClipId = `profit-loss-clip-neg-${dataKey}-${reactId}`;

  const focusedLegendIndex = useMemo(() => {
    if (hoveredIndex !== null) {
      return hoveredIndex;
    }
    if (!tooltipData) {
      return null;
    }
    const value = tooltipData.point[dataKey];
    if (typeof value !== "number") {
      return null;
    }
    return segmentLegendIndex(value >= 0);
  }, [dataKey, hoveredIndex, tooltipData]);

  const getX = useCallback(
    (d: Record<string, unknown>) => xScale(xAccessor(d)) ?? 0,
    [xAccessor, xScale]
  );

  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey];
      return typeof value === "number" ? (yScale(value) ?? 0) : 0;
    },
    [dataKey, yScale]
  );
  const zeroY = Math.min(innerHeight, Math.max(0, yScale(0) ?? innerHeight));
  const clipOverlap = Math.max(1, strokeWidth);
  const positiveClipHeight = Math.min(innerHeight, zeroY + clipOverlap / 2);
  const negativeClipY = Math.max(0, zeroY - clipOverlap / 2);
  const negativeClipHeight = Math.max(0, innerHeight - negativeClipY);
  const positiveStroke = fadeStops ? `url(#${positiveGradientId})` : positiveColor;
  const negativeStroke = fadeStops ? `url(#${negativeGradientId})` : negativeColor;
  const positiveOpacity =
    focusedLegendIndex !== null && focusedLegendIndex !== segmentLegendIndex(true)
      ? LEGEND_DIM_OPACITY
      : 1;
  const negativeOpacity =
    focusedLegendIndex !== null && focusedLegendIndex !== segmentLegendIndex(false)
      ? LEGEND_DIM_OPACITY
      : 1;

  return (
    <>
      <defs>
        <clipPath id={positiveClipId}>
          <rect
            height={positiveClipHeight}
            width={innerWidth}
            x={0}
            y={0}
          />
        </clipPath>
        <clipPath id={negativeClipId}>
          <rect
            height={negativeClipHeight}
            width={innerWidth}
            x={0}
            y={negativeClipY}
          />
        </clipPath>
      </defs>
      {fadeStops ? (
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={positiveGradientId}
            x1={0}
            x2={innerWidth}
            y1={0}
            y2={0}
          >
            {fadeStops.map((stop) => (
              <stop
                key={stop.offset}
                offset={stop.offset}
                style={{
                  stopColor: positiveColor,
                  stopOpacity: stop.opacity,
                }}
              />
            ))}
          </linearGradient>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={negativeGradientId}
            x1={0}
            x2={innerWidth}
            y1={0}
            y2={0}
          >
            {fadeStops.map((stop) => (
              <stop
                key={stop.offset}
                offset={stop.offset}
                style={{
                  stopColor: negativeColor,
                  stopOpacity: stop.opacity,
                }}
              />
            ))}
          </linearGradient>
        </defs>
      ) : null}
      <g
        clipPath={`url(#${positiveClipId})`}
        opacity={positiveOpacity}
        style={{ transition: "opacity 0.2s ease-in-out" }}
      >
        <LinePath
          curve={curve}
          data-chart-line-path={dataKey}
          data={renderData}
          stroke={positiveStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          x={getX}
          y={getY}
        />
      </g>
      <g
        clipPath={`url(#${negativeClipId})`}
        opacity={negativeOpacity}
        style={{ transition: "opacity 0.2s ease-in-out" }}
      >
        <LinePath
          curve={curve}
          data-chart-line-path={dataKey}
          data={renderData}
          stroke={negativeStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          x={getX}
          y={getY}
        />
      </g>
    </>
  );
}

ProfitLossLine.displayName = "ProfitLossLine";
