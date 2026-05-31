const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string, minimumFractionDigits: number) {
  const key = `${currency}:${minimumFractionDigits}`;
  const cached = currencyFormatters.get(key);
  if (cached) return cached;

  const formatter = Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  });
  currencyFormatters.set(key, formatter);
  return formatter;
}

export function formatCurrency(
  value: number,
  currency = "USD",
  minimumFractionDigits = 0,
) {
  return getCurrencyFormatter(currency, minimumFractionDigits).format(value);
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
