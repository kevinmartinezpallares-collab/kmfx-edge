import type React from "react";

import { LogoMark } from "@/components/logo-mark";
import { LogoWordmark } from "@/components/logo-wordmark";
import { cn } from "@/lib/utils";

export { LogoMark } from "@/components/logo-mark";
export { LogoWordmark } from "@/components/logo-wordmark";

export function LogoLockup({
  className,
  markClassName,
  wordmarkClassName,
  priority = false,
  ...props
}: React.ComponentProps<"span"> & {
  markClassName?: string;
  wordmarkClassName?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-3", className)}
      {...props}
    >
      <LogoMark className={cn("size-9", markClassName)} priority={priority} />
      <LogoWordmark className={cn("text-sm", wordmarkClassName)} />
    </span>
  );
}
