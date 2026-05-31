"use client";

import { AnimatePresence, m as motion } from "motion/react";
import { MouseEvent, useState } from "react";

type ReactiveBackgroundGridProps = {
  dots?: boolean;
  density?: number;
};

export function ReactiveBackgroundGrid({
  dots = true,
  density = 20,
}: ReactiveBackgroundGridProps) {
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number }>
  >([]);
  const [hoveredDot, setHoveredDot] = useState<{ x: number; y: number } | null>(
    null
  );

  const addRipple = (x: number, y: number) => {
    const newRipple = {
      id: Date.now(),
      x,
      y,
    };

    setRipples((prev) => [...prev, newRipple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
  };

  const spawnPointerRipple = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    addRipple(e.clientX - rect.left, e.clientY - rect.top);
  };

  const [containerSize, setContainerSize] = useState({
    width: 400,
    height: 400,
  });

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHoveredDot({ x, y });
    setContainerSize({ width: rect.width, height: rect.height });
  };

  const gridSize = density;
  const dotsArray = Array.from({ length: gridSize * gridSize });

  return (
    <div
      onClick={spawnPointerRipple}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        addRipple(rect.width / 2, rect.height / 2);
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredDot(null)}
      role="button"
      tabIndex={0}
      className="relative h-96 w-full overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: dots
            ? "radial-gradient(circle, currentColor 1px, transparent 1px)"
            : "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: `${100 / gridSize}% ${100 / gridSize}%`,
          backgroundPosition: "0 0",
          color: "rgba(255, 255, 255, 0.08)",
        }}
      />

      {dots &&
        dotsArray.map((_, index) => {
          const row = Math.floor(index / gridSize);
          const col = index % gridSize;
          const x = (col / gridSize) * 100;
          const y = (row / gridSize) * 100;

          const distance = hoveredDot
            ? Math.sqrt(
                Math.pow(x - (hoveredDot.x / containerSize.width) * 100, 2) +
                  Math.pow(y - (hoveredDot.y / containerSize.height) * 100, 2)
              )
            : Infinity;

          const scale = hoveredDot && distance < 30 ? 1.5 : 1;
          const opacity = hoveredDot && distance < 30 ? 0.6 : 0.2;

          return (
            <motion.div
              key={`${row}-${col}`}
              animate={{
                scale,
                opacity,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
              }}
              className="absolute rounded-full bg-primary"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: "4px",
                height: "4px",
                transform: "translate(-50%, -50%)",
              }}
            />
          );
        })}

      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.div
            key={ripple.id}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute rounded-full border-2 border-primary"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: "100px",
              height: "100px",
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
