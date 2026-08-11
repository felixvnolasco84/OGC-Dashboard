export type CostDimensionKind = "concept" | "family" | "partida" | "provider";
export type CostPaymentScope = "paid" | "pending" | "all";
export type CostGroupBy = "concept" | "family" | "partida" | "provider" | "none";

export type CostCandidate = {
  id: string;
  kind: CostDimensionKind;
  label: string;
  aliases?: string[];
};

export type CostResolution = {
  status: "exact" | "ambiguous" | "not_found";
  matches: CostCandidate[];
  suggestions: CostCandidate[];
};

const COST_INTENT_TOKENS = [
  "gasto",
  "gastado",
  "gaste",
  "costo",
  "costado",
  "pagado",
  "pago",
  "por pagar",
  "comprometido",
  "compromiso",
  "compra",
  "material",
  "proveedor",
  "facturado",
];

export function normalizeCostText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactCostText(value: unknown) {
  return normalizeCostText(value).replace(/\s+/g, "");
}

export function normalizeCostCurrency(value: unknown) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "SIN_MONEDA";
}

export function isCostIntent(text: string) {
  const normalized = normalizeCostText(text);
  return COST_INTENT_TOKENS.some((token) => normalized.includes(normalizeCostText(token)));
}

export function inferCostPaymentScope(text: string): CostPaymentScope {
  const normalized = normalizeCostText(text);
  const asksPending = ["por pagar", "pendiente de pago", "comprometido", "compromiso"]
    .some((token) => normalized.includes(token));
  const asksPaid = ["gastado", "gasto", "pagado", "pague", "pago realizado"]
    .some((token) => normalized.includes(token));
  if (asksPending && asksPaid) return "all";
  return asksPending ? "pending" : "paid";
}

export function inferCostGroupBy(text: string): CostGroupBy {
  const normalized = normalizeCostText(text);
  if (normalized.includes("proveedor")) return "provider";
  if (normalized.includes("partida")) return "partida";
  if (normalized.includes("familia")) return "family";
  if (["concepto", "material", "insumo"].some((token) => normalized.includes(token))) return "concept";
  return "none";
}

export function canonicalTransactionStatus(value: unknown): "paid" | "pending" | "other" {
  const normalized = normalizeCostText(value);
  if (["pagado", "pagada", "paid"].includes(normalized)) return "paid";
  if (["por pagar", "pendiente", "pendiente de pago", "unpaid"].includes(normalized)) return "pending";
  return "other";
}

export function parseCostDate(value: unknown): string | undefined {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const slash = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = iso ? text : slash ? `${slash[3]}-${slash[2]}-${slash[1]}` : undefined;
  if (!normalized) return undefined;
  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : undefined;
}

export function resolveCostDateRange(text: string, defaultAsOf: string) {
  const dates: string[] = [];
  for (const match of text.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g)) {
    const parsed = parseCostDate(match[1]);
    if (parsed && !dates.includes(parsed)) dates.push(parsed);
  }
  if (!dates.length) return { date_from: undefined, date_to: defaultAsOf, explicit: false };
  if (dates.length === 1) return { date_from: undefined, date_to: dates[0], explicit: true };
  const ordered = dates.slice(0, 2).sort();
  return { date_from: ordered[0], date_to: ordered[1], explicit: true };
}

function candidateSearchValues(candidate: CostCandidate) {
  return [candidate.label, ...(candidate.aliases || [])]
    .map((value) => ({ normalized: normalizeCostText(value), compact: compactCostText(value) }))
    .filter((value) => value.normalized.length >= 2);
}

function candidateScore(search: string, candidate: CostCandidate) {
  const normalizedSearch = normalizeCostText(search);
  const compactSearch = compactCostText(search);
  let best = 0;
  for (const value of candidateSearchValues(candidate)) {
    if (normalizedSearch === value.normalized || compactSearch === value.compact) {
      best = Math.max(best, 4000 + value.compact.length);
      continue;
    }
    const bounded = ` ${normalizedSearch} `.includes(` ${value.normalized} `);
    if (bounded || (value.compact.length >= 4 && compactSearch.includes(value.compact))) {
      best = Math.max(best, 3000 + value.compact.length);
      continue;
    }
    const tokens = value.normalized.split(" ").filter((token) => token.length >= 3);
    if (tokens.length && tokens.every((token) => normalizedSearch.includes(token))) {
      best = Math.max(best, 2000 + tokens.join("").length);
      continue;
    }
    const searchTokens = normalizedSearch.split(" ").filter((token) => token.length >= 4);
    if (searchTokens.some((token) => value.normalized.includes(token))) {
      best = Math.max(best, 1000 + value.compact.length);
    }
  }
  return best;
}

export function resolveCostCandidates(search: string, candidates: CostCandidate[]): CostResolution {
  const deduplicated = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const scored = deduplicated
    .map((candidate) => ({ candidate, score: candidateScore(search, candidate) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.label.localeCompare(right.candidate.label, "es"));

  const exact = scored.filter((item) => item.score >= 3000);
  if (!exact.length) {
    return { status: "not_found", matches: [], suggestions: scored.slice(0, 5).map((item) => item.candidate) };
  }
  const bestScore = exact[0].score;
  const best = exact.filter((item) => item.score === bestScore).map((item) => item.candidate);
  const logicalKeys = new Set(best.map((item) => `${item.kind}:${compactCostText(item.label)}`));
  return logicalKeys.size > 1
    ? { status: "ambiguous", matches: best, suggestions: best.slice(0, 5) }
    : { status: "exact", matches: best, suggestions: [] };
}

export function buildCostItemReferenceId(kind: Exclude<CostDimensionKind, "provider">, label: string) {
  return `${kind}:${encodeURIComponent(normalizeCostText(label))}`;
}

export function parseCostItemReferenceId(value: string) {
  const match = value.match(/^(concept|family|partida):(.+)$/);
  if (!match) return undefined;
  try {
    const normalized = normalizeCostText(decodeURIComponent(match[2]));
    if (!normalized) return undefined;
    return { kind: match[1] as Exclude<CostDimensionKind, "provider">, normalized };
  } catch {
    return undefined;
  }
}

export function mostSpecificCostLabel(value: {
  concepto?: string;
  sub_partida?: string;
  familia?: string;
  partida?: string;
  nombre?: string;
}) {
  return [value.concepto, value.sub_partida, value.familia, value.partida, value.nombre]
    .map((item) => String(item || "").trim())
    .find(Boolean) || "Concepto sin clasificar";
}

export function moneyDelta(parentTotal: number, lineItemsTotal: number) {
  return Math.round((parentTotal - lineItemsTotal) * 100) / 100;
}
