"use client";

import { domAnimation, LazyMotion } from "motion/react";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/app/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider>
      <LazyMotion features={domAnimation}>
        <TooltipProvider>
          {children}
          <Toaster
            position="top-right"
            richColors={false}
            toastOptions={{
              classNames: {
                toast:
                  "border border-border bg-card text-card-foreground shadow-xl",
              },
            }}
          />
        </TooltipProvider>
      </LazyMotion>
    </ThemeProvider>
  );
}
