"use client";

import { cn } from "@/lib/utils";
import { m as motion } from "motion/react";
import { useState } from "react";

type Ripple = {
  x: number;
  y: number;
  id: number;
};

type RippleClickButtonProps = React.ComponentProps<"button">;

export function RippleClickButton({
  children = "Click Me",
  className,
  onClick,
  type = "button",
  ...props
}: RippleClickButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const spawnRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newRipple = { x, y, id: Date.now() };
    setRipples([...ripples, newRipple]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);

    onClick?.(e);
  };

  return (
    <button
      onClick={spawnRipple}
      type={type}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-lg shadow-primary/10",
        className
      )}
      {...props}
    >
      <span className="relative z-10">{children}</span>
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 4, opacity: 0 }}
          className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/55 [left:var(--ripple-x)] [top:var(--ripple-y)]"
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            "--ripple-x": `${ripple.x}px`,
            "--ripple-y": `${ripple.y}px`,
          } as React.CSSProperties}
        />
      ))}
    </button>
  );
}
