import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StrategyLabSection } from "@/components/trading/strategy-lab";

export const metadata: Metadata = {
  title: "Strategy Lab Preview / KMFX Edge",
  description: "Preview local del Strategy Research Engine.",
};

export default function StrategyLabPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-[1500px]">
        <StrategyLabSection previewMode />
      </div>
    </main>
  );
}
