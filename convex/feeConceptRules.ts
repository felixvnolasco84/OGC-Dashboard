import type { Id } from "./_generated/dataModel";

export const FEE_CONCEPT_CALCULATION_VERSION = 5;
export const FEE_CONCEPT_LABELS = {
  honorarios: "Honorarios", indirectos: "Indirectos", general_conditions: "General Conditions", viaticos: "Viáticos",
} as const;
export type FeeConceptKind = keyof typeof FEE_CONCEPT_LABELS;
export type FeeConceptInput = { concepto: FeeConceptKind; partida_id: Id<"partidas">; excluded_partidas: Id<"partidas">[] };
export type FeeConceptConfig = FeeConceptInput & { porcentaje: number; monto_original: number; base_original: number; base_aprobada?: number; aprobado_total?: number; aprobado_excluido?: number; fecha_inicio?: string };
export type FeeConceptPartida = { _id: string; proyecto?: string; nivel: number; nombre: string; partida_nombre?: string; familia?: string; presupuesto_original?: number; presupuesto_aprobado?: number };
export function canonicalFeeConcepts(configs: readonly FeeConceptConfig[] = []) {
  return configs.map(c => ({ concepto: c.concepto, partida_id: c.partida_id, excluded_partidas: [...new Set(c.excluded_partidas)].sort(),
    porcentaje: c.porcentaje, monto_original: c.monto_original, base_original: c.base_original, base_aprobada: c.base_aprobada,
    aprobado_total: c.aprobado_total, aprobado_excluido: c.aprobado_excluido }))
    .sort((a,b) => a.concepto.localeCompare(b.concepto));
}
type FeeTransaction = { _id: string; fecha?: string; status?: string; moneda?: string; tipo_cambio?: string | number };
const normalize = (value?: string) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
function isoDate(fecha?: string) {
  const iso = fecha?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = fecha?.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!iso && !local) return null;
  const [y, m, d] = iso ? iso.slice(1).map(Number) : [Number(local![3]), Number(local![2]), Number(local![1])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
}
// Existing start-date metadata is ignored. Every concept uses the complete
// valid history; report date filters still determine the requested period.
export function isActiveFeeConcept(_config: FeeConceptConfig, fecha?: string) {
  return Boolean(isoDate(fecha?.trim()));
}
export function hasActiveIndirectFeeConcepts(configs: readonly FeeConceptConfig[] = [], fecha?: string) {
  return configs.some(c => c.concepto !== "honorarios" && isActiveFeeConcept(c, fecha));
}
export function replacesIndirectIncomeCategory(configs: readonly FeeConceptConfig[] = [], categoria?: string, fecha?: string) {
  const active = configs.filter(c => c.concepto !== "honorarios" && isActiveFeeConcept(c, fecha));
  const label = normalize(categoria);
  if (/indirecto/.test(label)) return active.length > 0;
  return active.some(c => c.concepto === "indirectos" ||
    c.concepto === "general_conditions" && /general condition|condicion(?:es)? general/.test(label) ||
    c.concepto === "viaticos" && /viatico/.test(label));
}
export function belongsToFeeRoot(partida: FeeConceptPartida, rootId: string, partidas: readonly FeeConceptPartida[]) {
  const root = partidas.find(p => String(p._id) === String(rootId));
  return Boolean(root && (String(partida._id) === String(rootId) ||
    (partida.nivel !== 1 && normalize(partida.partida_nombre) === normalize(root.nombre))));
}

function feeConceptsByPartida<T extends FeeConceptConfig>(configs: readonly T[], partidas: readonly FeeConceptPartida[]) {
  const roots = new Map(partidas.map(p => [String(p._id), normalize(p.nombre)]));
  return new Map(partidas.map(partida => {
    const name = normalize(partida.partida_nombre);
    return [String(partida._id), configs.filter(c => roots.has(String(c.partida_id)) &&
      (String(partida._id) === String(c.partida_id) || partida.nivel !== 1 && name === roots.get(String(c.partida_id))))];
  }));
}

export function createFeeSourceLookup(configs: readonly FeeConceptConfig[], partidas: readonly FeeConceptPartida[]) {
  const sources = feeConceptsByPartida(configs, partidas);
  return (partida: FeeConceptPartida, fecha?: string) => sources.get(String(partida._id))?.find(c => isActiveFeeConcept(c, fecha));
}
export function feeConceptBudgetBase(excludedPartidas: readonly string[], partidas: readonly FeeConceptPartida[], proyectoId?: string) {
  const roots = partidas.filter(p => p.nivel === 1 && (!proyectoId || p.proyecto === proyectoId));
  if (roots.some(p => !Number.isFinite(p.presupuesto_aprobado) || p.presupuesto_aprobado! < 0)) {
    throw new Error("Revisa los importes del presupuesto aprobado antes de calcular el porcentaje.");
  }
  const excluded = [...new Set(excludedPartidas)].sort();
  if (excluded.some(id => !roots.some(p => String(p._id) === String(id)))) {
    throw new Error("Las exclusiones deben ser partidas de nivel 1 del mismo proyecto.");
  }
  const aprobadoTotal = roots.reduce((sum, p) => sum + p.presupuesto_aprobado!, 0);
  const aprobadoExcluido = roots.filter(p => excluded.includes(String(p._id))).reduce((sum, p) => sum + p.presupuesto_aprobado!, 0);
  const base = aprobadoTotal - aprobadoExcluido;
  if (!Number.isFinite(base) || base <= 0) throw new Error("El presupuesto aprobado menos exclusiones debe ser mayor a cero y finito.");
  return { aprobadoTotal, aprobadoExcluido, base };
}
export function deriveFeeConcepts(inputs: readonly FeeConceptInput[], partidas: readonly FeeConceptPartida[], proyectoId?: string): FeeConceptConfig[] {
  const roots = partidas.filter(p => p.nivel === 1 && (!proyectoId || p.proyecto === proyectoId));
  if (!inputs.length) return [];
  const kinds = new Set<string>(), sources = new Set<string>();
  const configs = inputs.map(input => {
    if (!Object.prototype.hasOwnProperty.call(FEE_CONCEPT_LABELS, input.concepto) || kinds.has(input.concepto) || sources.has(String(input.partida_id))) {
      throw new Error("Cada concepto y su partida de origen deben ser únicos.");
    }
    kinds.add(input.concepto); sources.add(String(input.partida_id));
    const root = roots.find(p => String(p._id) === String(input.partida_id));
    if (!root || roots.filter(p => normalize(p.nombre) === normalize(root.nombre)).length !== 1) {
      throw new Error("Selecciona una partida de nivel 1 del proyecto con nombre único.");
    }
    if (!Number.isFinite(root.presupuesto_original) || root.presupuesto_original! < 0) {
      throw new Error("Revisa los importes del presupuesto original antes de calcular el porcentaje.");
    }
    const amount = root.presupuesto_original!;
    const excluded = [...new Set(input.excluded_partidas)].sort();
    const { base, aprobadoTotal, aprobadoExcluido } = feeConceptBudgetBase(excluded, roots);
    if (!Number.isFinite(amount / base * 100)) throw new Error("Los importes exceden el rango de cálculo válido.");
    return { concepto: input.concepto, partida_id: input.partida_id, excluded_partidas: excluded, monto_original: amount, base_original: base, base_aprobada: base,
      aprobado_total: aprobadoTotal, aprobado_excluido: aprobadoExcluido,
      porcentaje: amount / base * 100 };
  });
  return configs;
}

export function currentFeeConcepts(configs: readonly FeeConceptConfig[] = [], partidas: readonly FeeConceptPartida[]) {
  const projectId = partidas.find(p => p._id === configs[0]?.partida_id)?.proyecto;
  return deriveFeeConcepts(configs, partidas, projectId);
}

export function feeChargesForPayment(configs: readonly FeeConceptConfig[], _partida: FeeConceptPartida, partidas: readonly FeeConceptPartida[], fecha: string | undefined, amount: number) {
  // Every recorded paid amount uses the same base. Generated charges never
  // become additional payments, so there is no recursive charge-on-charge.
  return feeChargesAtRate(currentFeeConcepts(configs, partidas), fecha, amount);
}
export function feeChargesAtRate(configs: readonly FeeConceptConfig[], fecha: string | undefined, amount: number) {
  return configs.filter(c => isActiveFeeConcept(c, fecha))
    .map(config => ({ config, base: amount, monto: Math.round(amount * config.porcentaje) / 100 }));
}

// Allocate cents recursively. Parents are the exact sum of their children;
// only terminal rows are added to the direct-payment map for hierarchy rollup.
export function distributeFeeCharge(config: FeeConceptConfig, partidas: readonly FeeConceptPartida[], monto: number) {
  return prepareFeeDistribution(config, partidas)(monto);
}

// Build and validate the hierarchy once per concept, outside the payment loop.
function prepareFeeDistribution(config: FeeConceptConfig, partidas: readonly FeeConceptPartida[]) {
  const source = partidas.find(p => String(p._id) === String(config.partida_id));
  if (!source) throw new Error("La partida del concepto ya no está disponible.");
  const sourceName = normalize(source.nombre);
  const descendants = partidas.filter(p => p.proyecto === source.proyecto && p.nivel > 1 && normalize(p.partida_nombre) === sourceName);
  const families = descendants.filter(p => p.nivel === 2);
  const familyNames = new Set(families.map(p => normalize(p.familia)));
  const leavesByFamily = new Map<string, FeeConceptPartida[]>();
  for (const leaf of descendants) {
    if (leaf.nivel !== 3) continue;
    const key = normalize(leaf.familia);
    const group = leavesByFamily.get(key) || [];
    group.push(leaf);
    leavesByFamily.set(key, group);
  }
  if (familyNames.size !== families.length || [...leavesByFamily.keys()].some(name => !familyNames.has(name))) {
    throw new Error("Revisa la jerarquía del concepto: cada subpartida necesita una familia única.");
  }
  type AllocationNode = { id: string; children: AllocationNode[]; weights: number[] };
  const porcentajes: Record<string, number> = {};
  const prepare = (parent: FeeConceptPartida, percentage: number): AllocationNode => {
    porcentajes[parent._id] = percentage;
    const children = (parent.nivel === 1 ? [...families] : parent.nivel === 2 ? [...(leavesByFamily.get(normalize(parent.familia)) || [])] : [])
      .sort((a, b) => String(a._id).localeCompare(String(b._id)));
    if (!children.length) return { id: parent._id, children: [], weights: [] };
    if (children.some(p => !Number.isFinite(p.presupuesto_original) || p.presupuesto_original! < 0)) throw new Error("Revisa los montos originales de las subpartidas del concepto.");
    const total = children.reduce((sum,p) => sum + p.presupuesto_original!, 0);
    if (total <= 0 && config.monto_original > 0) throw new Error("Las subpartidas del concepto necesitan montos originales para distribuir su cargo.");
    const weights = children.map(p => total > 0 ? p.presupuesto_original! / total : 1 / children.length);
    return { id: parent._id, weights, children: children.map((child, index) => prepare(child, percentage * weights[index])) };
  };
  const tree = prepare(source, config.porcentaje);
  return (monto: number) => {
    const directos: Record<string, number> = {}, porPartida: Record<string, number> = {};
    const walk = (parent: AllocationNode, cents: number) => {
      porPartida[parent.id] = cents / 100;
      if (!parent.children.length) { directos[parent.id] = cents / 100; return; }
      const allocated = parent.weights.map(weight => Math.floor(Math.abs(cents) * weight));
      const residual = Math.abs(cents) - allocated.reduce((sum, value) => sum + value, 0);
      if (residual > 0) {
        const order = parent.weights.map((weight, index) => ({ index, remainder: Math.abs(cents) * weight - allocated[index] }))
          .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
        for (let index = 0; index < residual; index++) allocated[order[index % order.length].index]++;
      }
      parent.children.forEach((child, index) => walk(child, allocated[index] * Math.sign(cents)));
    };
    walk(tree, Math.round(monto * 100));
    return { directos, porPartida, porcentajes };
  };
}
export function feeSourceForPayment(configs: readonly FeeConceptConfig[], partida: FeeConceptPartida, partidas: readonly FeeConceptPartida[], fecha?: string) {
  return configs.find(c => isActiveFeeConcept(c, fecha) && belongsToFeeRoot(partida, c.partida_id, partidas));
}
export function calculateFeeConceptPayments(input: {
  configs: readonly FeeConceptConfig[]; partidas: readonly FeeConceptPartida[]; transactions: readonly FeeTransaction[];
  pagos: readonly { transaccion_id: string; partida_id?: string; monto: number }[];
  convert?: (amount: number, transaction: FeeTransaction) => number;
  // Totals still validate the hierarchy, but need no per-payment cent allocation.
  allocate?: boolean;
}) {
  const txs = new Map(input.transactions.map(t => [String(t._id), t]));
  const partidas = new Map(input.partidas.map(p => [String(p._id), p]));
  const configs = currentFeeConcepts(input.configs, input.partidas);
  const concepts = configs.map(config => ({ ...config, nombre: input.partidas.find(p => String(p._id) === config.partida_id)?.nombre || FEE_CONCEPT_LABELS[config.concepto], monto: 0, basePagada: 0, manualSustituido: 0, manualTotal: 0 }));
  const sources = feeConceptsByPartida(concepts, input.partidas);
  const activeByTransaction = new Map(input.transactions.map(tx => [String(tx._id), concepts.filter(c => isActiveFeeConcept(c, tx.fecha))]));
  const sustituidosPorPartida: Record<string, number> = {};
  const automaticosPorPartida: Record<string, number> = {}, porcentajesPorPartida: Record<string, number> = {};
  const distributions = new Map(concepts.map(concept => [concept.concepto, prepareFeeDistribution(concept, input.partidas)]));
  const chargeCounts = new Map(concepts.map(concept => [concept.concepto, new Map<number, number>()]));
  for (const concept of concepts) {
    const distribution = distributions.get(concept.concepto)!(0);
    Object.assign(automaticosPorPartida, distribution.directos);
    Object.assign(porcentajesPorPartida, distribution.porcentajes);
  }
  for (const pago of input.pagos) {
    const tx = txs.get(String(pago.transaccion_id)), partida = partidas.get(String(pago.partida_id));
    if (!tx || !partida || tx.status !== "Pagado") continue;
    const amount = input.convert ? input.convert(Math.abs(pago.monto), tx) : Math.abs(pago.monto);
    const paymentSources = sources.get(String(partida._id)) || [];
    for (const concept of paymentSources) {
      concept.manualTotal += input.convert ? input.convert(pago.monto, tx) : pago.monto;
    }
    for (const concept of activeByTransaction.get(String(tx._id)) || []) {
      const charge = Math.round(amount * concept.porcentaje) / 100;
      concept.monto += charge; concept.basePagada += amount;
      if (input.allocate === false) continue;
      const counts = chargeCounts.get(concept.concepto)!;
      const cents = Math.round(charge * 100);
      if (cents !== 0) counts.set(cents, (counts.get(cents) || 0) + 1);
    }
    const source = paymentSources.find(c => isActiveFeeConcept(c, tx.fecha));
    if (source) {
      const signed = input.convert ? input.convert(pago.monto, tx) : pago.monto;
      source.manualSustituido += signed;
      sustituidosPorPartida[String(partida._id)] = (sustituidosPorPartida[String(partida._id)] || 0) + signed;
    }
  }
  // Identical rounded charges have identical allocations. Count those payments
  // instead of traversing every leaf again; never distribute an accumulated total.
  for (const concept of concepts) {
    for (const [cents, count] of chargeCounts.get(concept.concepto)!) {
      for (const [id, allocated] of Object.entries(distributions.get(concept.concepto)!(cents / 100).directos)) {
        automaticosPorPartida[id] = (automaticosPorPartida[id] || 0) + allocated * count;
      }
    }
  }
  for (const concept of concepts) concept.monto = Math.round(concept.monto * 100) / 100;
  for (const id of Object.keys(automaticosPorPartida)) automaticosPorPartida[id] = Math.round(automaticosPorPartida[id] * 100) / 100;
  return { concepts, sustituidosPorPartida, automaticosPorPartida, porcentajesPorPartida };
}
