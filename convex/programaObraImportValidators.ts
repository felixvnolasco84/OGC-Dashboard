import { v, type Infer } from "convex/values";

export const PROGRAM_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const PROGRAM_IMPORT_TIMEOUT = 30 * 60 * 1000;

export const programImportRowValidator = v.object({
  programa_obra_id: v.optional(v.id("programa_obra")), detalle_id: v.optional(v.id("programa_obra_detalle")),
  nivel: v.number(), partida: v.string(), familia: v.optional(v.string()), subpartida: v.optional(v.string()),
  fecha_inicio: v.optional(v.string()), fecha_fin: v.optional(v.string()),
  anticipo_fecha: v.optional(v.string()), anticipo_porcentaje: v.optional(v.number()),
  suministro_fecha: v.optional(v.string()), finiquito_fecha: v.optional(v.string()),
  finiquito_porcentaje: v.optional(v.number()), peso: v.optional(v.number()),
});
export const programImportReviewValidator = v.object({
  date_resolutions: v.array(v.object({
    partida_index: v.number(), child_index: v.number(), partida: v.string(), child: v.string(),
    parent_finish: v.string(), child_finish: v.string(), choice: v.union(v.literal("parent"), v.literal("child")),
  })),
});
export type ProgramImportReview = Infer<typeof programImportReviewValidator>;
export const programImportSourceValidator = v.object({
  file_name: v.string(), file_hash: v.string(), sheet_name: v.optional(v.string()),
});
const counts = v.object({ created: v.number(), updated: v.number(), unchanged: v.number(), skipped: v.number(), total: v.number() });
export const programImportResultValidator = v.object({
  status: v.union(v.literal("created"), v.literal("updated"), v.literal("unchanged")),
  created: v.number(), updated: v.number(), unchanged: v.number(), errors: v.array(v.string()),
  partidas: counts, familias: counts, activity_effects: v.number(),
  revision_id: v.id("programa_obra_revisions"), version: v.number(),
});
export type ProgramImportResult = Infer<typeof programImportResultValidator>;
export const programImportConfirmationArgs = {
  proyecto: v.id("desarrollos"), rows: v.array(programImportRowValidator),
  expected_fingerprint: v.string(), review: programImportReviewValidator,
};
export const programImportTargetValidator = v.union(
  v.object({ kind: v.literal("schedule"), id: v.id("programa_obra") }),
  v.object({ kind: v.literal("detail"), id: v.id("programa_obra_detalle") }),
  v.object({ kind: v.literal("activity"), id: v.id("programa_obra_activities") }),
);

export async function programImportDigest(value: unknown) {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical)
    : input && typeof input === "object" ? Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : input;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}

// Only fields written by an import participate in semantic change detection.
// Civil dates with different accepted formats represent the same date.
export function programImportPatchChanged(before: Record<string, unknown>, patch: Record<string, unknown>) {
  const date = (value: unknown) => {
    if (typeof value !== "string" || !value) return value ?? null;
    return /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? value.split("/").reverse().join("-") : value;
  };
  return Object.entries(patch).some(([key, value]) =>
    key.includes("fecha") || key.endsWith("_start") || key.endsWith("_finish")
      ? date(before[key]) !== date(value)
      : (before[key] ?? null) !== (value ?? null));
}
