export function formatCurrency(
  value: number,
  currency = "USD",
  minimumFractionDigits = 0,
) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  }).format(value);
}

export function formatSignedCurrency(
  value: number,
  currency = "USD",
  minimumFractionDigits = 0,
) {
  const formatted = formatCurrency(
    Math.abs(value),
    currency,
    minimumFractionDigits,
  );

  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function formatPercent(value: number, digits = 2) {
  return `${value.toFixed(digits)}%`;
}
