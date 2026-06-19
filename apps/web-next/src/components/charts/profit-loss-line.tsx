"use client";

import { curveLinear } from "@visx/curve";
import { LinePath } from "@visx/shape";
import type { CurveFactory, CurveFactoryLineOnly } from "d3-shape";
import { useCallback, useId, useMemo } from "react";
import { useChart, useChartStable } from "./chart-context";
import {
  type FadeEdges,
  fadeGradientStops,
  resolveFadeSides,
} from "./fade-edges";
import { useProfitLossLegendHover } from "./profit-loss-legend-hover";

type CurveFactoryLike = CurveFactory | CurveFactoryLineOnly;

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
  curve?: CurveFactoryLike;
  /**
   * Fade the line stroke toward transparent at the chart edges.
   * Default: false
   */
  fadeEdges?: FadeEdges;
}

function segmentLegendIndex(isPositive: boolean) {
  return isPositive ? 0 : 1;
}

type ProfitLossSegmentPoint = {
  row: Record<string, unknown>;
  x: Date;
  y: number;
};

type ProfitLossSegment = {
  isPositive: boolean;
  points: ProfitLossSegmentPoint[];
};

function pointSign(value: number) {
  return value >= 0;
}

function buildProfitLossSegments(
  data: Record<string, unknown>[],
  dataKey: string,
  xAccessor: (row: Record<string, unknown>) => Date,
): ProfitLossSegment[] {
  const points = data
    .map((row) => {
      const value = row[dataKey];
      const x = xAccessor(row);

      if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
      }
      if (!Number.isFinite(x.getTime())) {
        return null;
      }

      return { row, x, y: value };
    })
    .filter((point): point is ProfitLossSegmentPoint => point !== null);

  if (points.length < 2) {
    return [];
  }

  const segments: ProfitLossSegment[] = [];
  let currentSign = pointSign(points[0].y);
  let currentPoints: ProfitLossSegmentPoint[] = [points[0]];

  function pushCurrentSegment() {
    if (currentPoints.length > 1) {
      segments.push({
        isPositive: currentSign,
        points: currentPoints,
      });
    }
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    const previousSign = pointSign(previous.y);
    const nextSign = pointSign(next.y);

    if (previous.y !== 0 && next.y !== 0 && previousSign !== nextSign) {
      const denominator = Math.abs(previous.y) + Math.abs(next.y);
      const ratio = denominator > 0 ? Math.abs(previous.y) / denominator : 0.5;
      const zeroTime =
        previous.x.getTime() + (next.x.getTime() - previous.x.getTime()) * ratio;
      const zeroPoint: ProfitLossSegmentPoint = {
        row: {
          ...next.row,
          [dataKey]: 0,
          date: new Date(zeroTime),
        },
        x: new Date(zeroTime),
        y: 0,
      };

      currentPoints.push(zeroPoint);
      pushCurrentSegment();
      currentSign = nextSign;
      currentPoints = [zeroPoint, next];
      continue;
    }

    if (previous.y === 0 && currentSign !== nextSign) {
      pushCurrentSegment();
      currentSign = nextSign;
      currentPoints = [previous, next];
      continue;
    }

    currentPoints.push(next);
  }

  pushCurrentSegment();
  return segments;
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
  const { renderData, xScale, yScale, xAccessor, innerWidth } =
    useChartStable();
  const reactId = useId();
  const fadeSides = resolveFadeSides(fadeEdges);
  const fadeStops = fadeSides.any ? fadeGradientStops(fadeSides) : null;
  const positiveGradientId = `profit-loss-gradient-pos-${dataKey}-${reactId}`;
  const negativeGradientId = `profit-loss-gradient-neg-${dataKey}-${reactId}`;

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

  const segments = useMemo(
    () => buildProfitLossSegments(renderData, dataKey, xAccessor),
    [dataKey, renderData, xAccessor],
  );

  const getX = useCallback(
    (point: ProfitLossSegmentPoint) => xScale(point.x) ?? 0,
    [xScale],
  );

  const getY = useCallback(
    (point: ProfitLossSegmentPoint) => yScale(point.y) ?? 0,
    [yScale],
  );
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
      {segments.map((segment, index) => (
        <g
          key={`${segment.isPositive ? "positive" : "negative"}-${index}`}
          opacity={
            segment.isPositive
              ? positiveOpacity
              : negativeOpacity
          }
          style={{ transition: "opacity 0.2s ease-in-out" }}
        >
          <LinePath
            curve={curve}
            data-chart-line-path={dataKey}
            data={segment.points}
            stroke={segment.isPositive ? positiveStroke : negativeStroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
            x={getX}
            y={getY}
          />
        </g>
      ))}
    </>
  );
}

ProfitLossLine.displayName = "ProfitLossLine";
