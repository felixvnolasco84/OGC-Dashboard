import { v } from "convex/values";
const kind = v.union(v.literal("honorarios"), v.literal("indirectos"), v.literal("general_conditions"), v.literal("viaticos"));
export const feeConceptInputValidator = v.object({ concepto: kind, partida_id: v.id("partidas"), excluded_partidas: v.array(v.id("partidas")) });
export const feeConceptConfigValidator = v.object({ concepto: kind, partida_id: v.id("partidas"), excluded_partidas: v.array(v.id("partidas")),
  porcentaje: v.number(), monto_original: v.number(), base_original: v.number(), base_aprobada: v.optional(v.number()),
  aprobado_total: v.optional(v.number()), aprobado_excluido: v.optional(v.number()), fecha_inicio: v.string() });
