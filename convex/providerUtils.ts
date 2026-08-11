export const GENERIC_PROVIDER_NAMES = ["DISPERSION", "EFECTIVO", "VARIOS"] as const;

export function normalizeProviderName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRfc(value?: string): string | undefined {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]/g, "")
    .trim();

  return normalized || undefined;
}

export function cleanOptional(value?: string): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

export function isGenericProviderName(value: string): boolean {
  return GENERIC_PROVIDER_NAMES.includes(
    normalizeProviderName(value) as (typeof GENERIC_PROVIDER_NAMES)[number]
  );
}

export function isProviderComplete(provider: {
  tipo?: "regular" | "generico";
  razon_social?: string;
  rfc?: string;
}): boolean {
  if (provider.tipo === "generico" || (provider.razon_social && isGenericProviderName(provider.razon_social))) {
    return true;
  }

  return Boolean(provider.razon_social?.trim() && normalizeRfc(provider.rfc));
}
