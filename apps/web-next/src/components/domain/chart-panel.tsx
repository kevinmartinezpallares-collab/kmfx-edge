import type { MetricPoint } from "@/lib/contracts/dashboard-model";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ChartPanelProps = {
  title: string;
  subtitle: string;
  data: MetricPoint[];
};

export function ChartPanel({ title, subtitle, data }: ChartPanelProps) {
  const maxValue = Math.max(...data.map((point) => point.value));

  return (
    <Card className="rounded-[2rem] border-border/70 bg-card/90 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-medium text-foreground">
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid h-48 grid-cols-5 items-end gap-3 rounded-[1.5rem] border border-border/60 bg-background/80 p-4">
          {data.map((point) => {
            const height = `${Math.max(18, (point.value / maxValue) * 100)}%`;
            return (
              <div key={point.label} className="flex h-full flex-col justify-end gap-3">
                <div
                  className="rounded-t-2xl rounded-b-md bg-gradient-to-t from-zinc-100 via-zinc-200 to-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                  style={{ height }}
                />
                <span className="text-center text-xs text-muted-foreground">
                  {point.label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
