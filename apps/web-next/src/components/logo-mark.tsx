import Image from "next/image";
import type React from "react";

import { cn } from "@/lib/utils";

const KMFX_LOGO_MARK_SRC = "/brand/kmfx-edge/logo-original-512.png";

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
