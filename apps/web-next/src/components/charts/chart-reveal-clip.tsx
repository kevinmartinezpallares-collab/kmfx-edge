"use client";

import type { Transition } from "motion/react";
import { m as motion } from "motion/react";
import { clipRevealTransition } from "./animation";

export interface ChartRevealClipProps {
  clipPathId: string;
  height: number;
  targetWidth: number;
  animating?: boolean;
  enterTransition?: Transition;
  mode?: "conceal" | "reveal";
  onComplete?: () => void;
  /** Bumps when motion settings change to replay the reveal. */
  revealEpoch: number;
  /** Extra inset around the clip rect so edge glyphs are not cut off. */
  padding?: number;
}

/**
 * Left-to-right clip reveal for cartesian series.
 * Grows clip rect width from 0 → full (true LTR; scaleX is avoided — it reveals from center).
 */
export function ChartRevealClip({
  animating = true,
  clipPathId,
  height,
  targetWidth,
  enterTransition,
  mode = "reveal",
  onComplete,
  revealEpoch,
  padding = 0,
}: ChartRevealClipProps) {
  const transition = clipRevealTransition(enterTransition);
  const paddedWidth = Math.max(0, targetWidth + padding * 2);
  const paddedHeight = height + padding * 2;
  const initialWidth = !animating ? paddedWidth : mode === "conceal" ? paddedWidth : 0;
  const targetRevealWidth = mode === "conceal" ? 0 : paddedWidth;

  return (
    <clipPath id={clipPathId}>
      <motion.rect
        animate={{ width: targetRevealWidth }}
        height={paddedHeight}
        initial={{ width: initialWidth }}
        key={`reveal-${revealEpoch}`}
        onAnimationComplete={onComplete}
        transition={transition}
        width={paddedWidth}
        x={-padding}
        y={-padding}
      />
    </clipPath>
  );
}
