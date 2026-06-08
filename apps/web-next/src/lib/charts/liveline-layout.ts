import type { Padding } from "liveline";

import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";

const MOBILE_AXIS_RIGHT = 64;

function compactNumber(value: number) {
  const absolute = Math.abs(value);
  const scaled =
    absolute >= 1_000_000
      ? { value: absolute / 1_000_000, suffix: "M" }
      : absolute >= 1_000
        ? { value: absolute / 1_000, suffix: "k" }
        : { value: absolute, suffix: "" };
  const digits =
    scaled.suffix === "" ? 0 : scaled.value >= 10 ? 1 : 2;

  return `${scaled.value.toLocaleString("es-ES", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })}${scaled.suffix}`;
}

export function livelinePadding(
  isMobile: boolean,
  desktop: Padding,
  mobile?: Partial<Padding>,
): Padding {
  if (!isMobile) return desktop;

  return {
    ...desktop,
    left: mobile?.left ?? Math.min(desktop.left ?? 12, 12),
    right: mobile?.right ?? MOBILE_AXIS_RIGHT,
    top: mobile?.top ?? desktop.top ?? 12,
    bottom: mobile?.bottom ?? desktop.bottom ?? 28,
  };
}

export function formatResponsiveLivelineCurrency(
  value: number,
  currency: string,
  isMobile: boolean,
) {
  if (!isMobile) return formatCurrency(value, currency);
  return compactNumber(value);
}

export function formatResponsiveLivelineSignedCurrency(
  value: number,
  currency: string,
  isMobile: boolean,
) {
  if (!isMobile) return formatSignedCurrency(value, currency);

  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${compactNumber(value)}`;
}

export function formatResponsiveLivelinePercent(value: number, isMobile: boolean) {
  if (!isMobile) return formatPercent(value, 2);

  const absolute = Math.abs(value);
  const digits = absolute >= 10 ? 0 : absolute >= 1 ? 1 : 2;
  return `${value.toLocaleString("es-ES", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })}%`;
}
