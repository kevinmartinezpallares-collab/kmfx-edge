"use client";

import * as React from "react";

import { useTheme } from "@/components/app/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  macroCalendarConfig,
  type MacroCalendarProvider,
} from "@/lib/config/macro-calendar";
import { cn } from "@/lib/utils";

type WidgetState = "loading" | "ready" | "error" | "disabled";

type EconomicCalendarWidgetProps = {
  enabled: boolean;
  provider: MacroCalendarProvider;
  className?: string;
};

export function EconomicCalendarWidget({
  enabled,
  provider,
  className,
}: EconomicCalendarWidgetProps) {
  const { resolvedTheme } = useTheme();
  const widgetTheme = resolvedTheme === "light" ? "light" : "dark";
  const containerRef = React.useRef<HTMLDivElement>(null);
  const widgetKey =
    enabled && provider === "tradingview"
      ? `${provider}:${widgetTheme}:enabled`
      : null;
  const tradingViewOptions = React.useMemo(
    () => ({
      colorTheme: widgetTheme,
      isTransparent: true,
      width: "100%",
      height: "100%",
      locale: "es",
      importanceFilter: "0,1",
      currencyFilter: "USD,EUR,GBP,JPY,CAD,AUD,NZD,CHF",
    }),
    [widgetTheme],
  );
  const [readyKey, setReadyKey] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const state: WidgetState = !enabled
    ? "disabled"
    : provider !== "tradingview"
      ? "error"
      : errorKey === widgetKey
        ? "error"
        : readyKey === widgetKey
          ? "ready"
          : "loading";

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();

    if (!widgetKey) return;

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget size-full";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = macroCalendarConfig.tradingViewScriptSrc;
    script.textContent = JSON.stringify(tradingViewOptions);
    container.appendChild(script);

    const observer = new MutationObserver(() => {
      if (container.querySelector("iframe")) {
        setReadyKey(widgetKey);
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    const fallbackTimer = window.setTimeout(() => {
      if (!container.querySelector("iframe")) {
        setErrorKey(widgetKey);
      }
    }, 8000);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
      container.replaceChildren();
    };
  }, [tradingViewOptions, widgetKey]);

  const showOverlay = state === "loading";
  const showFallback = state === "error" || state === "disabled";

  return (
    <div
      className={cn(
        "relative min-h-[560px] overflow-hidden rounded-xl border border-border/70 bg-background/35 md:min-h-[720px]",
        className,
      )}
    >
      <div ref={containerRef} className="size-full min-h-[560px] md:min-h-[720px]" />

      {showOverlay ? (
        <div className="absolute inset-0 grid gap-3 bg-background/85 p-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-[calc(100%-3.25rem)] min-h-[490px] w-full rounded-xl" />
        </div>
      ) : null}

      {showFallback ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6">
          <div className="max-w-md text-center">
            <p className="text-base font-semibold text-foreground">
              Calendario no disponible
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              El proveedor externo no ha cargado o la sección está desactivada.
              Puedes revisar la configuración o abrir TradingView directamente.
            </p>
            <a
              className="mt-4 inline-flex rounded-full border border-border/70 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              href={macroCalendarConfig.tradingViewAttributionUrl}
              rel="noreferrer"
              target="_blank"
            >
              Abrir calendario externo
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
