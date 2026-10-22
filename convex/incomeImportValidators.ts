import { v, type Infer } from "convex/values";

export const incomeParserSummaryValidator = v.object({ totalRows: v.number(), validRows: v.number(), errors: v.number(), totalAmount: v.number() });
export const incomeImportResultValidator = v.object({
  created: v.number(), rejected: v.number(), response_rows: v.number(),
  amounts: v.array(v.object({ moneda: v.string(), monto: v.number() })),
});
export type IncomeImportResult = Infer<typeof incomeImportResultValidator>;
