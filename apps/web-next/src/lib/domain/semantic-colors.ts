import { cn } from "@/lib/utils";

export type SemanticTone =
  | "neutral"
  | "profit"
  | "loss"
  | "risk"
  | "info"
  | "breakeven";

export const semanticChartColors = {
  profit: "var(--profit)",
  loss: "var(--loss)",
  risk: "var(--risk)",
  info: "var(--info)",
  breakeven: "var(--breakeven)",
  neutral: "var(--chart-1)",
} as const;

export function signedTextClass(value: number) {
  return cn(
    value > 0 && "text-profit",
    value < 0 && "text-loss",
    value === 0 && "text-breakeven",
  );
}

export function semanticTextClass(tone: SemanticTone) {
  const map: Record<SemanticTone, string> = {
    neutral: "text-foreground",
    profit: "text-profit",
    loss: "text-loss",
    risk: "text-risk",
    info: "text-info",
    breakeven: "text-breakeven",
  };

  return map[tone];
}

export function semanticBgClass(tone: SemanticTone) {
  const map: Record<SemanticTone, string> = {
    neutral: "bg-muted",
    profit: "bg-profit",
    loss: "bg-loss",
    risk: "bg-risk",
    info: "bg-info",
    breakeven: "bg-breakeven",
  };

  return map[tone];
}

export function semanticMutedBgClass(tone: SemanticTone) {
  const map: Record<SemanticTone, string> = {
    neutral: "bg-muted/60",
    profit: "bg-profit-muted",
    loss: "bg-loss-muted",
    risk: "bg-risk-muted",
    info: "bg-info-muted",
    breakeven: "bg-muted/50",
  };

  return map[tone];
}

