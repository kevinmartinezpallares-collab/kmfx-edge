import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MetricCardProps = {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "profit" | "loss" | "risk" | "info";
  action?: ReactNode;
};

const toneMap: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  neutral: "text-foreground",
  profit: "text-profit",
  loss: "text-loss",
  risk: "text-risk",
  info: "text-info",
};

export function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
  action,
}: MetricCardProps) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card/90 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>
          <CardTitle className={`text-2xl font-semibold ${toneMap[tone]}`}>
            {value}
          </CardTitle>
        </div>
        {action}
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
