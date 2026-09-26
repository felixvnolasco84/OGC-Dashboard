export function currencyFractionDigits(currency: string, locale = "es-MX") {
  return new Intl.NumberFormat(locale, { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits ?? 2;
}

export function roundMoney(value: number, currency: string) {
  const factor = 10 ** currencyFractionDigits(currency);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function sumMoney(values: number[], currency: string) {
  const factor = 10 ** currencyFractionDigits(currency);
  return values.reduce((sum, value) => sum + Math.round((value + Number.EPSILON) * factor), 0) / factor;
}

export function formatMoney(value: number, currency: string, locale = "es-MX") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export function parseMoneyInput(input: string, currency: string, locale = "es-MX"): number | null {
  const fractionDigits = currencyFractionDigits(currency, locale);
  const raw = input.replace(new RegExp(currency, "gi"), "").replace(/[$€£\s\u00a0\u202f]/g, "");
  const groupSeparator = new Intl.NumberFormat(locale).formatToParts(1000)
    .find((part) => part.type === "group")?.value;
  let normalized = groupSeparator ? raw.split(groupSeparator).join("") : raw;
  if (groupSeparator === "," && !raw.includes(".") && /^\d*,\d{0,2}$/.test(raw)) {
    normalized = raw.replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }
  if (!new RegExp(`^\\d*(?:\\.\\d{0,${fractionDigits}})?$`).test(normalized)) return null;
  if (normalized === ".") return 0;
  const parsed = Number(normalized || 0);
  return Number.isFinite(parsed) ? roundMoney(parsed, currency) : null;
}
