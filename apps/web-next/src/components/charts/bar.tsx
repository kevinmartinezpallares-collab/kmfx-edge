"use client";

import type { Transition } from "motion/react";
import { m as motion } from "motion/react";
import { useId, useMemo } from "react";
import { useChart } from "./chart-context";
import { chartCssVars } from "./chart-theme";
import { transitionWithDelay } from "./motion-utils";

export type BarLineCap = "round" | "butt" | number;
export type BarAnimationType = "grow" | "fade";

export interface BarProps {
  /** Key in data to use for y values */
  dataKey: string;
  /** Fill color for the bar. Can be a color, gradient url, or pattern url. Default: var(--chart-line-primary) */
  fill?: string;
  /** Color for tooltip dot. Use when fill is a gradient/pattern. Default: uses fill value */
  stroke?: string;
  /** Line cap style for bar ends: "round", "butt", or a number for custom radius. Default: "round" */
  lineCap?: BarLineCap;
  /** Whether to animate the bars. Default: true */
  animate?: boolean;
  /** Animation type: "grow" (height) or "fade" (opacity + blur). Default: "grow" */
  animationType?: BarAnimationType;
  /** Opacity when not hovered (when another bar is hovered). Default: 0.3 */
  fadedOpacity?: number;
  /** Base opacity for each bar. Can be a number or a function that receives the data point. */
  opacity?: number | ((datum: Record<string, unknown>) => number);
  /** Stagger delay between bars in seconds. Auto-calculated if not provided. */
  staggerDelay?: number;
  /** Gap between stacked bars in pixels. Default: 0 */
  stackGap?: number;
  /** Gap between grouped bars in pixels. Default: 4 */
  groupGap?: number;
}

interface AnimatedBarProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  rx: number;
  ry: number;
  index: number;
  isFaded: boolean;
  animationType: BarAnimationType;
  innerHeight: number;
  fadedOpacity: number;
  staggerDelay: number;
  enterTransition?: Transition;
  revealEpoch: number;
  isHorizontal: boolean;
  barKey: string;
}

function AnimatedBar({
  x,
  y,
  width,
  height,
  fill,
  opacity,
  rx,
  ry,
  index,
  isFaded,
  animationType,
  innerHeight,
  fadedOpacity,
  staggerDelay,
  enterTransition,
  revealEpoch,
  isHorizontal,
  barKey,
}: AnimatedBarProps) {
  const enterAnim = transitionWithDelay(enterTransition, index * staggerDelay);

  if (animationType === "fade") {
    return (
      <motion.rect
        animate={{
          opacity: isFaded ? fadedOpacity * opacity : opacity,
          filter: "blur(0px)",
        }}
        fill={fill}
        height={height}
        initial={{ opacity: 0, filter: "blur(2px)" }}
        key={`${barKey}-fade-${revealEpoch}`}
        rx={rx}
        ry={ry}
        transition={enterAnim}
        width={width}
        x={x}
        y={y}
      />
    );
  }

  const initial = isHorizontal
    ? { width: 0, height, opacity: 0, x: 0, y }
    : { width, height: 0, opacity: 0, x, y: innerHeight };
  const target = isHorizontal
    ? { width, height, x: 0, y }
    : { width, height, x, y };

  return (
    <motion.rect
      animate={{
        ...target,
        opacity: isFaded ? fadedOpacity * opacity : opacity,
      }}
      fill={fill}
      initial={initial}
      key={`${barKey}-grow-${revealEpoch}`}
      rx={rx}
      ry={ry}
      transition={enterAnim}
    />
  );
}

export function Bar({
  dataKey,
  fill = chartCssVars.linePrimary,
  lineCap = "round",
  animate = true,
  animationType = "grow",
  fadedOpacity = 0.3,
  opacity = 1,
  staggerDelay,
  stackGap = 0,
  groupGap = 4,
}: BarProps) {
  const {
    data,
    yScale,
    innerHeight,
    isLoaded,
    barScale,
    bandWidth,
    hoveredBarIndex,
    setHoveredBarIndex,
    barXAccessor,
    lines,
    orientation,
    stacked,
    stackOffsets,
    animationDuration,
    enterTransition,
    revealEpoch = 0,
  } = useChart();

  // Calculate stagger delay automatically if not provided
  // Total animation duration is ~1200ms, with 40% for stagger spread and 60% for bar animation
  const totalAnimDuration = animationDuration || 1100;
  const staggerSpread = totalAnimDuration * 0.4; // 40% of time for stagger spread
  const calculatedStaggerDelay =
    staggerDelay ?? (data.length > 1 ? staggerSpread / 1000 / data.length : 0);
  const uniqueId = useId();

  const isHorizontal = orientation === "horizontal";

  // Find the index of this bar series among all bar series
  const seriesIndex = useMemo(() => {
    const idx = lines.findIndex((l) => l.dataKey === dataKey);
    return idx >= 0 ? idx : 0;
  }, [lines, dataKey]);

  const seriesCount = lines.length;
  const isLastSeries = seriesIndex === seriesCount - 1;

  // Calculate the width for each bar within a group (for non-stacked)
  const barWidth = useMemo(() => {
    if (!bandWidth || seriesCount === 0) {
      return 0;
    }
    if (stacked) {
      // Stacked bars use full band width
      return bandWidth;
    }
    // Leave a gap between grouped bars (controlled by groupGap prop)
    const effectiveGroupGap = seriesCount > 1 ? groupGap : 0;
    return (bandWidth - effectiveGroupGap * (seriesCount - 1)) / seriesCount;
  }, [bandWidth, seriesCount, stacked, groupGap]);

  // Calculate corner radius based on lineCap
  const cornerRadius = useMemo(() => {
    if (typeof lineCap === "number") {
      return lineCap;
    }
    if (lineCap === "round" && barWidth) {
      return Math.min(barWidth / 2, 8);
    }
    return 0;
  }, [lineCap, barWidth]);

  // Early return if bar scale not available (not in BarChart)
  if (!(barScale && bandWidth && barXAccessor)) {
    console.warn("Bar component must be used within a BarChart");
    return null;
  }

  return (
    <g className={`bar-series-${uniqueId}`}>
      {data.map((d, i) => {
        const value = d[dataKey];
        if (typeof value !== "number") {
          return null;
        }

        const categoryValue = barXAccessor(d);
        const bandPos = barScale(categoryValue) ?? 0;

        let x: number;
        let y: number;
        let barHeight: number;
        let barW: number;

        if (isHorizontal) {
          // Horizontal bars: category on y-axis, value on x-axis
          const valuePos = yScale(value) ?? 0;
          barW = valuePos; // Width is the value position (grows from left)
          barHeight = barWidth;

          if (stacked && stackOffsets) {
            const offset = stackOffsets.get(i)?.get(dataKey) ?? 0;
            x = yScale(offset) ?? 0;
            barW = valuePos - x;
            // Apply stack gap for horizontal: shift right and reduce width
            const gapOffset = seriesIndex * stackGap;
            x += gapOffset;
            if (!isLastSeries && stackGap > 0) {
              barW = Math.max(0, barW - stackGap);
            }
          } else {
            x = 0;
            // For grouped bars, offset y position
            const effectiveGroupGap = seriesCount > 1 ? groupGap : 0;
            y = bandPos + seriesIndex * (barWidth + effectiveGroupGap);
          }
          y = stacked
            ? bandPos
            : bandPos +
              seriesIndex * (barWidth + (seriesCount > 1 ? groupGap : 0));
        } else {
          // Vertical bars: category on x-axis, value on y-axis
          const valuePos = yScale(value) ?? 0;
          barHeight = innerHeight - valuePos;
          barW = barWidth;

          if (stacked && stackOffsets) {
            const offset = stackOffsets.get(i)?.get(dataKey) ?? 0;
            const offsetY = yScale(offset) ?? innerHeight;
            // Apply stack gap: shift up and reduce height
            const gapOffset = seriesIndex * stackGap;
            y = offsetY - barHeight - gapOffset;
            // Reduce height slightly for non-last bars to create visual gap
            if (!isLastSeries && stackGap > 0) {
              barHeight = Math.max(0, barHeight - stackGap);
            }
          } else {
            y = valuePos;
            // For grouped bars, offset x position
            const effectiveGroupGap = seriesCount > 1 ? groupGap : 0;
            x = bandPos + seriesIndex * (barWidth + effectiveGroupGap);
          }
          x = stacked
            ? bandPos
            : bandPos +
              seriesIndex * (barWidth + (seriesCount > 1 ? groupGap : 0));
        }

        const isFaded = hoveredBarIndex !== null && hoveredBarIndex !== i;
        const baseOpacity = typeof opacity === "function" ? opacity(d) : opacity;

        // Use categoryValue as key since it's the unique identifier from data
        const barKey = `bar-${dataKey}-${categoryValue}`;

        // Apply rounded corners:
        // - For non-stacked: always apply
        // - For stacked with gap: apply to all bars
        // - For stacked without gap: only apply to the last series
        const applyRounding = !stacked || stackGap > 0 || isLastSeries;
        const effectiveRx = applyRounding ? cornerRadius : 0;
        const effectiveRy = applyRounding ? cornerRadius : 0;

        if (animate && !isLoaded) {
          return (
            <AnimatedBar
              animationType={animationType}
              barKey={barKey}
              enterTransition={enterTransition}
              fadedOpacity={fadedOpacity}
              fill={fill}
              height={barHeight}
              index={i}
              innerHeight={innerHeight}
              isFaded={isFaded}
              isHorizontal={isHorizontal}
              key={barKey}
              opacity={baseOpacity}
              revealEpoch={revealEpoch}
              rx={effectiveRx}
              ry={effectiveRy}
              staggerDelay={calculatedStaggerDelay}
              width={barW}
              x={x}
              y={y}
            />
          );
        }

        // Static bar after animation completes
        return (
          <motion.rect
            animate={{
              opacity: isFaded ? fadedOpacity * baseOpacity : baseOpacity,
            }}
            fill={fill}
            height={barHeight}
            initial={false}
            key={barKey}
            onMouseEnter={() => setHoveredBarIndex?.(i)}
            onMouseLeave={() => setHoveredBarIndex?.(null)}
            rx={effectiveRx}
            ry={effectiveRy}
            style={{
              cursor: "pointer",
            }}
            transition={{
              opacity: { duration: 0.15 },
            }}
            width={barW}
            x={x}
            y={y}
          />
        );
      })}
    </g>
  );
}

Bar.displayName = "Bar";

export default Bar;
