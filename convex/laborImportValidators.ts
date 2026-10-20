import { v, type Infer } from "convex/values";

export const laborImportSourceValidator = v.object({
  file_name: v.string(),
  file_hash: v.string(),
  sheet_name: v.string(),
  administration: v.string(),
  currency: v.string(),
  row_count: v.number(),
});

export const laborImportResultValidator = v.object({
  status: v.union(v.literal("created"), v.literal("replaced"), v.literal("unchanged")),
  dates: v.array(v.string()),
  transaction_count: v.number(),
  row_count: v.number(),
  amount_total: v.number(),
  total_people: v.number(),
  replaced_dates: v.number(),
  providers_created: v.number(),
  providers_reused: v.number(),
});

export type LaborImportResult = Infer<typeof laborImportResultValidator>;
export const LABOR_IMPORT_ATTEMPT_TIMEOUT = 30 * 60 * 1000;
export const LABOR_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
