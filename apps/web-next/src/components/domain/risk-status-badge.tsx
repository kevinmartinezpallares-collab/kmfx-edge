import { ShieldAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getRiskToneClasses } from "@/lib/domain/wave1-selectors";

type RiskStatusBadgeProps = {
  status: "safe" | "caution" | "blocked";
};

export function RiskStatusBadge({ status }: RiskStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={getRiskToneClasses(status)}
    >
      <ShieldAlertIcon data-icon="inline-start" />
      {status === "safe"
        ? "Seguro"
        : status === "caution"
          ? "Vigilar"
          : "Bloqueado"}
    </Badge>
  );
}
