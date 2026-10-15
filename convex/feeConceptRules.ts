import type { Id } from "./_generated/dataModel";

export const FEE_CONCEPT_START = "2026-10-01";
export const FEE_CONCEPT_CALCULATION_VERSION = 3;
export const FEE_CONCEPT_LABELS = {
  honorarios: "Honorarios", indirectos: "Indirectos", general_conditions: "General Conditions", viaticos: "Viáticos",
} as const;
export type FeeConceptKind = keyof typeof FEE_CONCEPT_LABELS;
export type FeeConceptInput = { concepto: FeeConceptKind; partida_id: Id<"partidas">; excluded_partidas: Id<"partidas">[] };
export type FeeConceptConfig = FeeConceptInput & { porcentaje: number; monto_original: number; base_original: number; base_aprobada?: number; aprobado_total?: number; aprobado_excluido?: number; fecha_inicio: string };
export type FeeConceptPartida = { _id: string; proyecto?: string; nivel: number; nombre: string; partida_nombre?: string; familia?: string; presupuesto_original?: number; presupuesto_aprobado?: number };
export function canonicalFeeConcepts(configs: readonly FeeConceptConfig[] = []) {
  return configs.map(c => ({ concepto: c.concepto, partida_id: c.partida_id, excluded_partidas: [...new Set(c.excluded_partidas)].sort(),
    porcentaje: c.porcentaje, monto_original: c.monto_original, base_original: c.base_original, base_aprobada: c.base_aprobada,
    aprobado_total: c.aprobado_total, aprobado_excluido: c.aprobado_excluido, fecha_inicio: c.fecha_inicio }))
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
export function feeConceptUsesProjectHistory(config: Pick<FeeConceptInput, "concepto">) {
  return config.concepto === "viaticos" || config.concepto === "general_conditions";
}
export function isActiveFeeConcept(config: FeeConceptConfig, fecha?: string) {
  const date = isoDate(fecha?.trim());
  return Boolean(date && (feeConceptUsesProjectHistory(config) || date >= config.fecha_inicio));
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
export function deriveFeeConcepts(inputs: readonly FeeConceptInput[], partidas: readonly FeeConceptPartida[], previous: readonly FeeConceptConfig[] = [], proyectoId?: string): FeeConceptConfig[] {
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
    return { ...input, excluded_partidas: excluded, monto_original: amount, base_original: base, base_aprobada: base,
      aprobado_total: aprobadoTotal, aprobado_excluido: aprobadoExcluido,
      porcentaje: amount / base * 100, fecha_inicio: previous.find(p => p.concepto === input.concepto)?.fecha_inicio || FEE_CONCEPT_START };
  });
  return configs;
}

export function currentFeeConcepts(configs: readonly FeeConceptConfig[] = [], partidas: readonly FeeConceptPartida[]) {
  const projectId = partidas.find(p => p._id === configs[0]?.partida_id)?.proyecto;
  return deriveFeeConcepts(configs, partidas, configs, projectId);
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
  const source = partidas.find(p => String(p._id) === String(config.partida_id));
  const directos: Record<string, number> = {}, porPartida: Record<string, number> = {}, porcentajes: Record<string, number> = {};
  if (!source) throw new Error("La partida del concepto ya no está disponible.");
  const descendants = partidas.filter(p => p.proyecto === source.proyecto && p.nivel > 1 && normalize(p.partida_nombre) === normalize(source.nombre));
  const families = descendants.filter(p => p.nivel === 2);
  if (new Set(families.map(p => normalize(p.familia))).size !== families.length ||
    descendants.some(p => p.nivel === 3 && !families.some(f => normalize(f.familia) === normalize(p.familia)))) {
    throw new Error("Revisa la jerarquía del concepto: cada subpartida necesita una familia única.");
  }
  const walk = (parent: FeeConceptPartida, cents: number, percentage: number) => {
    porPartida[parent._id] = cents / 100; porcentajes[parent._id] = percentage;
    const children = descendants.filter(p =>
      (parent.nivel === 1 ? p.nivel === 2 : parent.nivel === 2 && p.nivel === 3 && normalize(p.familia) === normalize(parent.familia)))
      .sort((a,b) => String(a._id).localeCompare(String(b._id)));
    if (!children.length) { directos[parent._id] = cents / 100; return; }
    if (children.some(p => !Number.isFinite(p.presupuesto_original) || p.presupuesto_original! < 0)) throw new Error("Revisa los montos originales de las subpartidas del concepto.");
    const total = children.reduce((sum,p) => sum + p.presupuesto_original!, 0);
    if (total <= 0 && config.monto_original > 0) throw new Error("Las subpartidas del concepto necesitan montos originales para distribuir su cargo.");
    const weights = children.map(p => total > 0 ? p.presupuesto_original! / total : 1 / children.length);
    const allocated = weights.map(weight => Math.floor(Math.abs(cents) * weight));
    const residual = Math.abs(cents) - allocated.reduce((sum,value) => sum + value, 0);
    const order = weights.map((weight,index) => ({ index, remainder: Math.abs(cents) * weight - allocated[index] }))
      .sort((a,b) => b.remainder - a.remainder || a.index - b.index);
    for (let index = 0; index < residual; index++) allocated[order[index % order.length].index]++;
    children.forEach((child,index) => walk(child, allocated[index] * Math.sign(cents), percentage * weights[index]));
  };
  walk(source, Math.round(monto * 100), config.porcentaje);
  return { directos, porPartida, porcentajes };
}
export function feeSourceForPayment(configs: readonly FeeConceptConfig[], partida: FeeConceptPartida, partidas: readonly FeeConceptPartida[], fecha?: string) {
  return configs.find(c => isActiveFeeConcept(c, fecha) && belongsToFeeRoot(partida, c.partida_id, partidas));
}
export function calculateFeeConceptPayments(input: {
  configs: readonly FeeConceptConfig[]; partidas: readonly FeeConceptPartida[]; transactions: readonly FeeTransaction[];
  pagos: readonly { transaccion_id: string; partida_id?: string; monto: number }[];
  convert?: (amount: number, transaction: FeeTransaction) => number;
}) {
  const txs = new Map(input.transactions.map(t => [String(t._id), t]));
  const partidas = new Map(input.partidas.map(p => [String(p._id), p]));
  const configs = currentFeeConcepts(input.configs, input.partidas);
  const concepts = configs.map(config => ({ ...config, nombre: input.partidas.find(p => String(p._id) === config.partida_id)?.nombre || FEE_CONCEPT_LABELS[config.concepto], monto: 0, basePagada: 0, manualSustituido: 0, manualTotal: 0 }));
  const sustituidosPorPartida: Record<string, number> = {};
  const automaticosPorPartida: Record<string, number> = {}, porcentajesPorPartida: Record<string, number> = {};
  for (const concept of concepts) {
    const distribution = distributeFeeCharge(concept, input.partidas, 0);
    Object.assign(automaticosPorPartida, distribution.directos);
    Object.assign(porcentajesPorPartida, distribution.porcentajes);
  }
  for (const pago of input.pagos) {
    const tx = txs.get(String(pago.transaccion_id)), partida = partidas.get(String(pago.partida_id));
    if (!tx || !partida || tx.status !== "Pagado") continue;
    const amount = input.convert ? input.convert(Math.abs(pago.monto), tx) : Math.abs(pago.monto);
    for (const concept of concepts) if (belongsToFeeRoot(partida, concept.partida_id, input.partidas)) {
      concept.manualTotal += input.convert ? input.convert(pago.monto, tx) : pago.monto;
    }
    for (const charge of feeChargesAtRate(configs, tx.fecha, amount)) {
      const concept = concepts.find(c => c.concepto === charge.config.concepto)!;
      concept.monto += charge.monto; concept.basePagada += charge.base;
      for (const [id, allocated] of Object.entries(distributeFeeCharge(charge.config, input.partidas, charge.monto).directos)) {
        automaticosPorPartida[id] = (automaticosPorPartida[id] || 0) + allocated;
      }
    }
    const source = feeSourceForPayment(configs, partida, input.partidas, tx.fecha);
    if (source) {
      const signed = input.convert ? input.convert(pago.monto, tx) : pago.monto;
      concepts.find(c => c.concepto === source.concepto)!.manualSustituido += signed;
      sustituidosPorPartida[String(partida._id)] = (sustituidosPorPartida[String(partida._id)] || 0) + signed;
    }
  }
  for (const concept of concepts) concept.monto = Math.round(concept.monto * 100) / 100;
  for (const id of Object.keys(automaticosPorPartida)) automaticosPorPartida[id] = Math.round(automaticosPorPartida[id] * 100) / 100;
  return { concepts, sustituidosPorPartida, automaticosPorPartida, porcentajesPorPartida };
}
