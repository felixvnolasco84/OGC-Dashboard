# Payment System Refactoring Documentation

## Overview

The payment system has been refactored from an **individual payment model** to a **transaction-based model** with line items. This change allows for better organization of payments, proper document attachment, and clearer financial tracking.

---

## Architecture Changes

### Old Model (DEPRECATED)
```
pagos (individual payments)
├── All payment details (fecha, tipo_pago, banco, etc.)
├── Single partida/familia/sub-partida reference
└── Individual documents

documentos
└── pago_ids: array of payment IDs
```

**Problems:**
- Creating 10 concepts meant 10 separate payment records with duplicate transaction details
- Documents had to reference multiple individual payment IDs
- No way to group related concepts under a single transaction
- Difficult to track which payments belonged to the same transaction

---

### New Model (CURRENT)
```
transacciones (parent transaction)
├── Transaction details (fecha, tipo_pago, banco, moneda, status, etc.)
├── monto_total: Sum of all line items
└── Can have multiple documentos attached

    ↓ transaccion_id

pagos (line items/concepts)
├── References parent transaccion_id
├── References specific partida_id
├── Individual monto
└── Partida/familia/sub-partida info (denormalized)

documentos
└── transaccion_id: References parent transaction
```

**Benefits:**
- One transaction can have multiple concepts (line items)
- Documents attach to the transaction, not individual line items
- Payment details (date, type, bank) stored once at transaction level
- Easier to query and aggregate financial data
- Better data integrity and normalization

---

## Database Schema

### transacciones Table
```typescript
{
  proyecto: Id<"desarrollos">,
  monto_total: number,              // Sum of all line items
  fecha: string,                     // Transaction date
  tipo_pago: string,                 // efectivo, transferencia, tarjeta, cheque
  moneda: string,                    // MXN, USD, EUR
  tipo_cambio: string,
  status: string,                    // Pagado, Por pagar
  categoria?: string,                // anticipo, material, estimacion
  banco?: string,
  tarjeta?: string,
  numero_cuenta?: string,
  numero_transferencia?: string,
  codigo_referencia?: string,
  factura?: string,
  comprobante?: string,
  presupuesto_archivo?: string,
}

Indexes:
- by_proyecto
- by_status
- by_fecha
```

### pagos Table (Line Items)
```typescript
{
  transaccion_id: Id<"transacciones">, // Parent transaction reference
  partida_id: Id<"partidas">,          // Specific partida reference
  administracion: string,               // Denormalized for querying
  partida: string,                      // Denormalized for querying
  familia: string,                      // Denormalized for querying
  sub_partida: string,                  // Empty string for direct familia payments
  monto: number,                        // Individual line item amount
  proyecto: Id<"desarrollos">,
}

Indexes:
- by_transaccion
- by_proyecto
- by_partida_id
- by_partida
- by_familia
```

### documentos Table
```typescript
{
  nombre: string,
  descripcion: string,
  image: string,                       // Appwrite file ID
  type: string,                        // factura, comprobante, presupuesto
  transaccion_id: Id<"transacciones">, // Changed from pago_ids array
  proyecto: Id<"desarrollos">,
}

Indexes:
- by_proyecto
- by_transaccion
```

---

## API Reference

### New: convex/transacciones.ts

#### Mutations

**createTransaction**
Creates a transaction with multiple line items in one atomic operation.

```typescript
await createTransaction({
  proyecto: Id<"desarrollos">,
  monto_total: number,
  fecha: string,
  tipo_pago: string,
  moneda: string,
  tipo_cambio: string,
  status: string,
  categoria?: string,
  banco?: string,
  numero_cuenta?: string,
  codigo_referencia?: string,
  lineItems: Array<{
    partida_id: Id<"partidas">,
    partida: string,
    familia: string,
    sub_partida: string,
    monto: number,
  }>
});

// Returns: { transaccionId, pagoIds }
```

**updateTransaction**
Updates transaction details (not line items).

```typescript
await updateTransaction({
  id: Id<"transacciones">,
  fecha?: string,
  tipo_pago?: string,
  status?: string,
  banco?: string,
  // ... other optional fields
});
```

**deleteTransaction**
Deletes transaction and all associated line items and documents.

```typescript
await deleteTransaction({
  id: Id<"transacciones">
});
```

#### Queries

**getTransactionById**
Fetches transaction with all line items and documents.

```typescript
const data = await getTransactionById({ id: Id<"transacciones"> });

// Returns:
{
  ...transaction,
  lineItems: Array<Pago>,
  documents: Array<Documento>
}
```

**listByProyecto** (paginated)
```typescript
const result = await listByProyecto({
  proyecto_id: Id<"desarrollos">,
  paginationOpts: { numItems: 10, cursor: null }
});
```

**getByProyecto** (non-paginated)
```typescript
const transactions = await getByProyecto({
  proyecto_id: Id<"desarrollos">
});
```

**getByPartidaName** (backward compatible)
Returns line items with parent transaction data.

```typescript
const payments = await getByPartidaName({
  partida_name: string,
  proyecto_id?: Id<"desarrollos">
});
```

---

### Updated: convex/pagos.ts

**Status:** DEPRECATED - Maintains backward compatibility only

All queries now return pagos enriched with parent transaction data:

```typescript
{
  ...pago,                    // Line item data
  fecha: transaction?.fecha,  // From parent transaction
  tipo_pago: transaction?.tipo_pago,
  status: transaction?.status,
  transaction: Transaction    // Full parent transaction object
}
```

---

### Updated: convex/documentos.ts

**getByTransaccion** (new)
```typescript
const documents = await getByTransaccion({
  transaccion_id: Id<"transacciones">
});
```

**create** (updated)
```typescript
await create({
  nombre: string,
  descripcion: string,
  image: string,
  type: string,
  proyecto: Id<"desarrollos">,
  transaccion_id: Id<"transacciones">  // Changed from pago_ids
});
```

---

## Frontend Changes

### add-payment-modal.tsx

**Before:**
```typescript
// Created individual payments in a loop
for (const concept of concepts) {
  await createPayment({
    ...paymentDetails,  // Duplicated for each
    ...concept
  });
}
```

**After:**
```typescript
// Build line items array
const lineItems = [];
for (const concept of concepts) {
  lineItems.push({
    partida_id: concept.partida_id,
    partida: concept.partida,
    familia: concept.familia,
    sub_partida: concept.sub_partida,
    monto: concept.monto,
  });
}

// Create single transaction with all line items
await createTransaction({
  // Transaction details (stored once)
  proyecto,
  monto_total,
  fecha,
  tipo_pago,
  moneda,
  status,
  // Line items array
  lineItems,
});
```

**User Experience:**
- Same UI and workflow
- Now shows "Transacción registrada con X concepto(s)" instead of "X pago(s) creados"
- Documents attach to the entire transaction

---

## Migration Notes

### Data Migration
**IMPORTANT:** Existing data in the old format needs to be migrated.

**Options:**
1. **Clean slate:** Delete existing pagos and start fresh (dev/staging only)
2. **Migration script:** Create a Convex mutation to migrate old pagos to new structure
3. **Dual support:** Keep old queries running until migration is complete

### Code That Needs Updates

**Files using old `api.pagos.create`:**
- ✅ `add-payment-modal.tsx` - UPDATED
- ⚠️ `edit-payment-modal.tsx` - NEEDS UPDATE
- ⚠️ Any other components creating payments

**Files using old `api.documentos.create` with `pago_ids`:**
- ✅ `add-payment-modal.tsx` - UPDATED
- ⚠️ Check for other document upload components

**Files querying payments:**
Most existing queries in `convex/pagos.ts` are backward-compatible and will continue to work, but they now return enriched data with transaction info.

---

## Best Practices

### Creating Transactions
1. Always build complete line items array first
2. Calculate monto_total as sum of all line items
3. Include all required transaction fields
4. Attach documents using transaccion_id

### Querying Data
1. Use `getTransactionById` when you need full transaction context
2. Use backward-compatible `pagos` queries for existing UI that shows line items
3. Always filter by `proyecto_id` to avoid cross-project collisions

### Updating Data
1. Update transaction details via `updateTransaction`
2. To modify line items: delete transaction and recreate (or create separate line item mutations)
3. Document updates use `transaccion_id`

---

## Example Usage

### Creating a Transaction with Multiple Concepts

```typescript
// User selects:
// - Partida: "Estructura"
//   - Familia: "Concreto" → Sub-partida: "Cemento" ($5,000)
//   - Familia: "Acero" → Sub-partida: "Varilla" ($3,000)

const result = await createTransaction({
  proyecto: proyectoId,
  monto_total: 8000,
  fecha: "2025-01-15",
  tipo_pago: "transferencia",
  moneda: "MXN",
  tipo_cambio: "1",
  status: "Pagado",
  categoria: "material",
  banco: "BBVA",
  numero_cuenta: "1234567890",
  codigo_referencia: "REF-001",
  lineItems: [
    {
      partida_id: partidaId1,
      partida: "Estructura",
      familia: "Concreto",
      sub_partida: "Cemento",
      monto: 5000,
    },
    {
      partida_id: partidaId2,
      partida: "Estructura",
      familia: "Acero",
      sub_partida: "Varilla",
      monto: 3000,
    }
  ]
});

// Result:
// {
//   transaccionId: "abc123",
//   pagoIds: ["pago1", "pago2"]
// }
```

### Attaching a Document

```typescript
// Upload file to Appwrite
const uploadResult = await uploadDocument(file);

// Create document record
await createDocument({
  nombre: "Factura #12345",
  descripcion: "Factura de materiales",
  image: uploadResult.fileId,
  type: "factura",
  proyecto: proyectoId,
  transaccion_id: result.transaccionId,  // Attach to transaction
});
```

### Fetching Transaction with Details

```typescript
const data = await getTransactionById({ id: transaccionId });

console.log(data);
// {
//   _id: "abc123",
//   proyecto: "proj1",
//   monto_total: 8000,
//   fecha: "2025-01-15",
//   tipo_pago: "transferencia",
//   status: "Pagado",
//   lineItems: [
//     { partida: "Estructura", familia: "Concreto", monto: 5000, ... },
//     { partida: "Estructura", familia: "Acero", monto: 3000, ... }
//   ],
//   documents: [
//     { nombre: "Factura #12345", type: "factura", ... }
//   ]
// }
```

---

## Testing Checklist

- [ ] Create transaction with single line item
- [ ] Create transaction with multiple line items
- [ ] Create transaction with direct familia payment (no sub-partida)
- [ ] Attach document to transaction
- [ ] Update transaction details
- [ ] Delete transaction (verify line items and documents are deleted)
- [ ] Query transactions by proyecto
- [ ] Query line items by partida/familia
- [ ] Verify backward-compatible queries still work
- [ ] Test pagination for transaction lists

---

## Future Enhancements

1. **Line Item Editing:** Add mutations to add/remove/update individual line items without recreating the transaction
2. **Transaction Status Workflow:** Add transitions (draft → pending → approved → paid)
3. **Payment Splits:** Allow partial payments against a transaction
4. **Audit Trail:** Track all changes to transactions
5. **Bulk Operations:** Batch create/update/delete transactions
6. **Advanced Queries:** Filter by date range, status, payment type, etc.

---

## Support

For questions or issues:
1. Check this documentation first
2. Review the code in `convex/transacciones.ts`
3. Test with the updated `add-payment-modal.tsx` as a reference
4. Create an issue with schema migration questions

---

**Last Updated:** January 2025  
**Version:** 2.0.0  
**Breaking Changes:** Yes - requires data migration
