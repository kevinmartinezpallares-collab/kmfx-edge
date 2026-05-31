"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m as motion, useReducedMotion } from "motion/react";

type ShimmerButtonProps = React.ComponentProps<typeof Button> & {
  shimmerClassName?: string;
};

export function ShimmerButton({
  children = "Shimmer Effect",
  className,
  shimmerClassName,
  ...props
}: ShimmerButtonProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Button
      className={cn(
        "relative overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90",
        className
      )}
      {...props}
    >
      <span className="relative z-10">{children}</span>
      <motion.div
        className={cn(
          "absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent",
          shimmerClassName
        )}
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { x: ["100%", "-100%"] }}
        transition={
          shouldReduceMotion
            ? undefined
            : {
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }
        }
      />
    </Button>
  );
}
