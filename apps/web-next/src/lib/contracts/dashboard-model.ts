export type MetricPoint = {
  label: string;
  value: number;
  timestamp?: string;
};

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  note: string;
  tone: "neutral" | "profit" | "loss" | "risk" | "info";
};

export type DashboardModel = {
  title: string;
  subtitle: string;
  metrics: DashboardMetric[];
  equitySeries: MetricPoint[];
  pulseItems: Array<{
    label: string;
    value: string;
    tone: "neutral" | "profit" | "loss" | "risk" | "info";
  }>;
};
