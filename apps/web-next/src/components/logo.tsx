import Image from "next/image";
import type React from "react";

import { cn } from "@/lib/utils";

export const KMFX_LOGO_MARK_SRC = "/brand/kmfx-edge/logo-original-512.png";

type LogoMarkProps = React.ComponentProps<"span"> & {
  imageClassName?: string;
  priority?: boolean;
  sizes?: string;
};

export function LogoMark({
  className,
  imageClassName,
  priority = false,
  sizes = "40px",
  ...props
}: LogoMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        className,
      )}
      {...props}
    >
      <Image
        alt=""
        className={cn("object-cover", imageClassName)}
        fill
        priority={priority}
        sizes={sizes}
        src={KMFX_LOGO_MARK_SRC}
      />
    </span>
  );
}

export function LogoWordmark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-baseline gap-1 tracking-tight", className)}
      {...props}
    >
      <span className="font-semibold text-foreground">KMFX</span>
      <span className="font-normal text-muted-foreground">Edge</span>
    </span>
  );
}

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

export const LogoIcon = LogoMark;
export const Logo = LogoLockup;
