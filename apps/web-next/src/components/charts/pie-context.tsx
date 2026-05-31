"use client";

import type { Transition } from "motion/react";
import { createContext, type RefObject, use } from "react";

export interface PieData {
  /** Display label for the slice */
  label: string;
  /** Value for the slice (determines slice size relative to total) */
  value: number;
  /** Optional color override - falls back to palette */
  color?: string;
  /** Optional fill override for patterns/gradients (e.g., "url(#patternId)") */
  fill?: string;
}

/** Arc data computed by visx Pie */
export interface PieArcData {
  data: PieData;
  index: number;
  startAngle: number;
  endAngle: number;
  padAngle: number;
  value: number;
}

export interface PieContextValue {
  // Data
  data: PieData[];
  arcs: PieArcData[];

  // Dimensions
  size: number;
  center: number;
  outerRadius: number;
  innerRadius: number;
  padAngle: number;
  cornerRadius: number;

  // Hover effect
  hoverOffset: number;

  // Hover state
  hoveredIndex: number | null;
  setHoveredIndex: (index: number | null) => void;

  // Animation state
  animationKey: number;
  isLoaded: boolean;
  enterTransition?: Transition;
  enterStaggerScale: number;

  // Container ref for portals
  containerRef: RefObject<HTMLDivElement | null>;

  // Computed values
  totalValue: number;

  // Get color for a slice index
  getColor: (index: number) => string;

  // Get fill for a slice index (supports patterns/gradients)
  getFill: (index: number) => string;
}

const PieContext = createContext<PieContextValue | null>(null);

export function PieProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: PieContextValue;
}) {
  return <PieContext.Provider value={value}>{children}</PieContext.Provider>;
}

export function usePie(): PieContextValue {
  const context = use(PieContext);
  if (!context) {
    throw new Error(
      "usePie must be used within a PieProvider. " +
        "Make sure your component is wrapped in <PieChart>."
    );
  }
  return context;
}
