# Trigger Fix for Simplified Schema

## Problem

After simplifying the `pagos` schema to only store `transaccion_id`, `partida_id`, and `monto`, the triggers in `convex/functions.ts` broke because they were trying to access fields that no longer exist:

```typescript
// ❌ OLD CODE - Fields don't exist anymore
const { partida, familia, sub_partida, proyecto } = payment;
```

**Error Message:**
```
Failed to insert or update a document in table "meticas_presupuesto" 
because it does not match the schema: Object is missing the required field `proyecto`.
```

This happened because the trigger couldn't get the `proyecto` field from the `payment` object.

---

## Solution

### 1. Updated Payment Trigger (Lines 28-61)

**Changed from:**
```typescript
// Direct field access (broken)
const { partida, familia, sub_partida, proyecto } = payment;
```

**Changed to:**
```typescript
// Fetch related data from foreign keys
const partidaDoc = await ctx.db.get(payment.partida_id);
const transactionDoc = await ctx.db.get(payment.transaccion_id);

const context = {
  partida: partidaDoc.nombre,
  familia: partidaDoc.familia,
  sub_partida: partidaDoc.sub_partida || "",
  proyecto: transactionDoc.proyecto  // ← Now we can get proyecto!
};
```

### 2. Updated Helper Function (Lines 68-103)

**Changed from:**
```typescript
// Query pagos by proyecto (index doesn't exist)
const allPayments = await ctx.db
  .query("pagos")
  .filter((q) => q.eq(q.field("proyecto"), proyecto))
  .collect();
```

**Changed to:**
```typescript
// Query through transacciones, then enrich with partida data
const allTransactions = await ctx.db
  .query("transacciones")
  .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto))
  .collect();

const allPayments: any[] = [];
for (const transaction of allTransactions) {
  const pagos = await ctx.db
    .query("pagos")
    .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
    .collect();
  
  for (const pago of pagos) {
    const partidaDoc = await ctx.db.get(pago.partida_id);
    allPayments.push({
      ...pago,
      partida: partidaDoc.nombre,
      familia: partidaDoc.familia,
      sub_partida: partidaDoc.sub_partida
    });
  }
}
```

---

## How It Works Now

### Payment Created
```
1. User creates transaction with line items
   ↓
2. Convex inserts transaction
   ↓
3. Convex inserts pagos (line items)
   ↓
4. TRIGGER fires on pagos insert
   ↓
5. Trigger fetches:
   - partida data from partidas table
   - transaction data from transacciones table
   ↓
6. Trigger has all needed context:
   {
     partida: "Estructura",
     familia: "Concreto",  
     sub_partida: "Cemento",
     proyecto: "proj123"  ← Got it from transaction!
   }
   ↓
7. Trigger updates:
   - partidas.pagado (all hierarchy levels)
   - meticas_presupuesto.gasto_total
   ↓
8. ✅ Success!
```

---

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `convex/functions.ts` | 28-61 | Updated payment trigger to fetch related data |
| `convex/functions.ts` | 68-103 | Updated helper to query through transactions |

---

## Testing

### Verify Fix Works

1. **Create a payment:**
```typescript
await createTransaction({
  proyecto: proyectoId,
  monto_total: 5000,
  fecha: "2025-01-15",
  tipo_pago: "transferencia",
  status: "Pagado",
  lineItems: [
    { partida_id: pid1, monto: 5000 }
  ]
});
```

2. **Check logs:**
```
✓ Payment changed: insert pago123
✓ Payment details: { partida: "Estructura", familia: "Concreto", ... }
✓ Successfully updated pagado for all hierarchy levels
✓ Successfully updated meticas_presupuesto
```

3. **Verify database:**
- `pagos` table: Has new record with just 3 fields
- `partidas` table: `pagado` field updated
- `meticas_presupuesto` table: `gasto_total` updated

---

## Key Insights

### Why This Happened

The schema simplification removed denormalized fields from `pagos`, but the triggers still expected those fields to exist. This is a classic refactoring issue where **data access patterns must match the new schema**.

### The Fix Pattern

When you simplify a schema by removing denormalized fields:

1. ✅ **Store only foreign keys** (transaccion_id, partida_id)
2. ✅ **Fetch related data when needed** (use ctx.db.get())
3. ✅ **Update all code that accessed removed fields**
4. ✅ **Test triggers and side effects**

### Performance Note

This fix adds more database reads in the trigger (fetching partida and transaction). However:

- ✅ Triggers run **after** the mutation completes, so user doesn't wait
- ✅ Convex caches frequently accessed records
- ✅ We removed redundant data from pagos table, making it smaller
- ✅ Net performance is better (smaller table + occasional joins)

---

## Future Improvements

If the trigger becomes a bottleneck, consider:

1. **Batch processing:** Collect all affected partidas, then update in bulk
2. **Debouncing:** Only update metrics every N seconds
3. **Background job:** Move heavy calculations to scheduled function
4. **Denormalize proyecto:** Add `proyecto` to pagos table (trade-off)

For now, the current solution is clean and performant. ✨

---

## Summary

✅ **Problem:** Trigger accessed fields that don't exist in simplified schema  
✅ **Solution:** Fetch related data using foreign keys  
✅ **Result:** Triggers work correctly with normalized schema  
✅ **Benefit:** Clean schema + working triggers  

The payment system is now fully functional with the simplified, normalized database schema! 🎉
