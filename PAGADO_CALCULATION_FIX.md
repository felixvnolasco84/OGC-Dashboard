# Pagado Calculation Fix

## Problem

The "Pagado" column in SalesPresupuestoTable was showing incorrect values that didn't match the expected amounts. For example:
- **Expected**: TORRE G Pagado: USD 1,136,173.84
- **Actual**: TORRE G Pagado: USD 4,544,695 ❌

## Root Cause

Both `calculatePagadoForPartidas` (regular projects) and `calculateSalesPagadoForPartidas` (sales projects) were summing **ALL** pagos, including those from transactions with status "Por pagar" (unpaid).

This meant that:
- Transactions marked as "Por pagar" were being counted as paid
- The `pagado` field was inflated with unpaid amounts
- The `por_gastar` field became negative (overpayment) incorrectly

## The Fix

### Backend Changes

**1. Fixed `convex/functions.ts`** - Regular projects calculation:
```typescript
// OLD (incorrect): Summed all pagos
const total = pagosArrays[index].reduce((sum, p) => sum + (p.monto || 0), 0);

// NEW (correct): Only sum pagos from "Pagado" transactions
for (const pago of pagos) {
  const transaction = await ctx.db.get(pago.transaccion_id);
  if (transaction && transaction.status === "Pagado") {
    total += (pago.monto || 0);
  }
}
```

**2. Fixed `convex/sales_partidas_sync.ts`** - Sales projects calculation:
```typescript
// OLD (incorrect): Summed all sales_pagos
const total = pagosArrays[index].reduce((sum, p) => sum + (p.monto || 0), 0);

// NEW (correct): Only sum pagos from "Pagado" transactions
for (const pago of pagos) {
  const transaction = await ctx.db.get(pago.sales_transaccion_id);
  if (transaction && transaction.status === "Pagado") {
    total += (pago.monto || 0);
  }
}
```

### Frontend Changes

**3. Reverted `SalesPresupuestoTable.tsx`** - Metrics display:
The metrics were temporarily swapped as a workaround. Now they're back to correct order:
- **Pagado**: Shows `metrics.pagado` (correct)
- **Por Vender**: Shows `metrics.porGastar` (correct)

## How to Apply

### Step 1: Deploy Backend Changes
The backend fixes are already in place. Deploy:
```bash
npx convex deploy
```

### Step 2: Resync Data

**For Sales Projects:**
Run the sync mutation to recalculate all sales partidas:
```bash
npx convex run sales_partidas_sync:syncSalesPartidasFromTransactions --args '{"salesProjectId":"<your-sales-project-id>"}'
```

Or use the refresh button in the SalesPresupuestoTable UI.

**For Regular Projects:**
The triggers should automatically recalculate on the next transaction change. To force a recalculation, you can:
1. Edit any transaction (change status back and forth)
2. Or create a manual sync mutation similar to sales

## What This Changes

### Before Fix
- **Pagado** = All pagos (including "Por pagar") ❌
- **Por gastar** = presupuesto_aprobado - (all pagos) = Often negative ❌

### After Fix
- **Pagado** = Only pagos from "Pagado" transactions ✅
- **Por gastar** = presupuesto_aprobado - (only paid pagos) = Accurate remaining ✅

## Verification

After resyncing, check that:

1. **Pagado amounts match actual paid transactions**
   - Only transactions with status "Pagado" are counted
   - "Por pagar" transactions are excluded

2. **Por gastar is positive (or zero)**
   - Should be: presupuesto_aprobado - pagado
   - If negative, there's actual overpayment (legitimate scenario)

3. **Avance percentage makes sense**
   - Should be: (pagado / presupuesto_aprobado) × 100
   - Should not exceed 100% unless legitimately overpaid

## Example

**TORRE G (After Fix):**
- Presupuesto aprobado: USD 3,762,272
- Pagado (only "Pagado" transactions): USD 1,136,173.84
- Por gastar: USD 2,626,098.16
- Avance: 30% ✅

## Consistency Across System

This fix brings the `calculatePagadoForPartidas` functions in line with:
- `currency_helpers.ts` - Already filtered by "Pagado" status
- Transaction display components - Only show paid amounts
- User expectations - "Pagado" means actually paid

## Notes

- This is a **critical fix** that affects financial reporting
- All projects should be resynced to ensure accurate data
- Consider adding a status indicator in the UI to show "Por pagar" vs "Pagado" transactions
- Future enhancement: Add a separate column for "Comprometido" (committed but not paid)
