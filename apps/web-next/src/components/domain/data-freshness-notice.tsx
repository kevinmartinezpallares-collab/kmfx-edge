import { Clock3Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getConnectionToneClasses } from "@/lib/domain/wave1-selectors";

type DataFreshnessNoticeProps = {
  label: string;
  tone: "connected" | "syncing" | "stale" | "warning" | "danger";
};

export function DataFreshnessNotice({
  label,
  tone,
}: DataFreshnessNoticeProps) {
  return (
    <Badge variant="outline" className={getConnectionToneClasses(tone)}>
      <Clock3Icon data-icon="inline-start" />
      {label}
    </Badge>
  );
}
