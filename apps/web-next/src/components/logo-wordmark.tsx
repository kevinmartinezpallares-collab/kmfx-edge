import type React from "react";

import { cn } from "@/lib/utils";

export function LogoWordmark({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-baseline gap-1 tracking-tight",
        className,
      )}
      {...props}
    >
      <span className="font-semibold text-foreground">KMFX</span>
      <span className="font-normal text-muted-foreground">Edge</span>
    </span>
  );
}
