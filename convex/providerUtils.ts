export const GENERIC_PROVIDER_NAMES = ["DISPERSION", "EFECTIVO", "VARIOS"] as const;

export type ProviderMatchStatus = "matched" | "unmatched" | "archived" | "conflict";
export type TransactionProviderMatchStatus =
  | ProviderMatchStatus
  | "missing_name"
  | "already_assigned";

export type ProviderMatchCandidate<TId = string> = {
  _id: TId;
  razon_social: string;
  archived_at?: number;
  merged_into?: TId;
};

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

export function buildProviderMatchIndex<
  TProvider extends ProviderMatchCandidate<unknown>,
>(providers: readonly TProvider[]) {
  const providersByName = new Map<string, TProvider[]>();
  for (const provider of providers) {
    if (provider.merged_into) continue;
    const normalized = normalizeProviderName(provider.razon_social);
    if (!normalized) continue;
    const matches = providersByName.get(normalized) || [];
    matches.push(provider);
    providersByName.set(normalized, matches);
  }
  return providersByName;
}

export function classifyProviderMatch<
  TProvider extends ProviderMatchCandidate<unknown>,
>(
  providerName: string,
  providersByName: ReadonlyMap<string, readonly TProvider[]>,
) {
  const normalized = normalizeProviderName(providerName);
  const matches = [...(providersByName.get(normalized) || [])];
  const active = matches.filter((provider) => !provider.archived_at);
  const status: ProviderMatchStatus = active.length === 1
    ? "matched"
    : active.length > 1
      ? "conflict"
      : matches.length > 0
        ? "archived"
        : "unmatched";

  return {
    normalized,
    status,
    provider: status === "matched" ? active[0] : undefined,
    matches,
  };
}

export function classifyTransactionProviderMatch<
  TProvider extends ProviderMatchCandidate<unknown>,
>(
  providerName: string | undefined,
  currentProviderId: TProvider["_id"] | undefined,
  providersByName: ReadonlyMap<string, readonly TProvider[]>,
) {
  const trimmedName = providerName?.trim() || "";
  const normalized = normalizeProviderName(trimmedName);
  if (currentProviderId) {
    return {
      normalized,
      status: "already_assigned" as const,
      provider: undefined,
      matches: [] as TProvider[],
    };
  }
  if (!trimmedName) {
    return {
      normalized,
      status: "missing_name" as const,
      provider: undefined,
      matches: [] as TProvider[],
    };
  }

  const match = classifyProviderMatch(trimmedName, providersByName);
  return {
    ...match,
  };
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
