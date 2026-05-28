import { LandmarkIcon } from "lucide-react";

import type { TradingAccount } from "@/lib/contracts/account";

type AccountIdentityProps = {
  account: TradingAccount;
};

export function AccountIdentity({ account }: AccountIdentityProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-foreground">
        <LandmarkIcon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {account.label}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {account.broker} / {account.login}
        </p>
      </div>
    </div>
  );
}
