import { ActivityIcon, ShieldAlertIcon, ZapIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { getActiveAccount } from "@/lib/domain/wave1-selectors";

type WorkspaceStatusStripProps = {
  workspace: WorkspaceState;
};

export function WorkspaceStatusStrip({
  workspace,
}: WorkspaceStatusStripProps) {
  const account = getActiveAccount(workspace);
  const risk = workspace.risk;

  return (
    <div className="hidden items-center justify-between gap-4 rounded-[1.75rem] border border-border/70 bg-card/75 px-5 py-3 lg:flex">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <ActivityIcon className="size-4 text-profit" />
        <span>Datos {account?.lastSyncLabel ?? "sin lectura"}</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <ShieldAlertIcon className="size-4 text-risk" />
        <span>
          Riesgo {risk.totalOpenRiskPct.toFixed(2)}% / {risk.heatLimitPct.toFixed(2)}%
        </span>
      </div>
      <Badge variant="outline" className="border-border/80 bg-background/80 text-foreground">
        <ZapIcon data-icon="inline-start" />
        {workspace.meta.sourceMode === "live" ? "Lectura MT5" : "Lectura preparada"}
      </Badge>
    </div>
  );
}
