import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UpcomingSectionProps = {
  title: string;
  description: string;
  nextStep: string;
};

export function UpcomingSection({
  title,
  description,
  nextStep,
}: UpcomingSectionProps) {
  return (
    <section className="rounded-3xl border border-border/80 bg-card/70 p-6 md:p-8">
      <div className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Próximamente
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            {description}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/55 p-4">
          <p className="text-sm font-medium text-foreground">Siguiente paso</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{nextStep}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link className={buttonVariants()} href="/dashboard">
            Volver al Panel
          </Link>
          <Link
            className={cn(buttonVariants({ variant: "outline" }))}
            href="/settings"
          >
            Ver ajustes
          </Link>
        </div>
      </div>
    </section>
  );
}
