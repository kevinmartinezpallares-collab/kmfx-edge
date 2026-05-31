"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { animate, m as motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";

type AnimatedProgressProps = {
  title?: string;
  value?: number;
  className?: string;
};

export function AnimatedProgress({
  title = "Upload Progress",
  value = 75,
  className,
}: AnimatedProgressProps) {
  const progress = useMotionValue(0);
  const width = useTransform(progress, [0, 100], ["0%", "100%"]);
  const displayProgress = useTransform(progress, (v) => `${Math.round(v)}%`);

  useEffect(() => {
    const animation = animate(progress, value, {
      duration: 2,
      ease: "easeOut",
    });

    return animation.stop;
  }, [progress, value]);

  return (
    <Card className={cn("w-full border-border/70 bg-card/70", className)}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div style={{ width }} className="h-full bg-primary" />
        </div>
        <motion.p className="mt-2 text-right text-sm text-muted-foreground">
          {displayProgress}
        </motion.p>
      </CardContent>
    </Card>
  );
}
