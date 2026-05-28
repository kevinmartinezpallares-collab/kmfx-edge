"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
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
  ...props
}: RippleClickButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
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
      onClick={handleClick}
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
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: ripple.x,
            top: ripple.y,
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: "rgba(255, 255, 255, 0.55)",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </button>
  );
}
