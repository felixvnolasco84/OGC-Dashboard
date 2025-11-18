# Sales Transaction Button Actions Implementation

## Overview
Updated the button actions in **SalesProyectoTransaccionesPage** to match the functionality of **ProyectoTransaccionesTablePage**, enabling users to view transaction details directly from the sales transactions table.

## Changes Made

### 1. Added Modal Hook Import
```typescript
import { useSaleTransactionDetailsModal } from "@/hooks/sale-transaction-details-modal";
```

### 2. Initialized Modal Hook
```typescript
const detailsModal = useSaleTransactionDetailsModal();
```

### 3. Updated Button Actions

**Before:**
```typescript
<PopoverContent className="flex flex-col space-y-1" align="end">
  <Button variant={"ghost"} onClick={() => toast.info("Próximamente", { 
    description: "La vista de detalles estará disponible pronto." 
  })}>
    Ver detalles
  </Button>
  {/* ... other buttons with placeholder toasts */}
</PopoverContent>
```

**After:**
```typescript
{/* button actions */}
<PopoverContent className="flex flex-col space-y-1" align="end">
  <Button variant={"ghost"} onClick={() => detailsModal.onOpen(transaccion._id)}>
    Ver detalles
  </Button>
  <Button variant={"ghost"} onClick={() => toast.info("Próximamente", { 
    description: "La vista de conceptos estará disponible pronto." 
  })}>
    Ver conceptos
  </Button>
  <Button variant={"ghost"} onClick={() => toast.info("Próximamente", { 
    description: "La vista de documentos estará disponible pronto." 
  })}>
    Ver documentos
  </Button>
  <Button variant={"ghost"} className="text-red-600" onClick={() => openDeleteDialog(transaccion._id)}>
    Eliminar
  </Button>
</PopoverContent>
```

## Button Actions Status

| Button | Status | Functionality |
|--------|--------|---------------|
| **Ver detalles** | ✅ Implemented | Opens `SaleTransactionDetailsModal` with full transaction details |
| **Ver conceptos** | ⏳ Pending | Shows placeholder toast - needs dedicated modal |
| **Ver documentos** | ⏳ Pending | Shows placeholder toast - needs dedicated modal |
| **Eliminar** | ✅ Implemented | Opens delete confirmation dialog |

## User Experience

### Ver Detalles (Working)
1. User clicks three-dot menu (⋮) on transaction row
2. Clicks "Ver detalles"
3. Modal opens showing:
   - Transaction summary (monto total, status, tipo pago)
   - Date and currency info
   - Payment details (banco, tarjeta, número de cuenta, etc.)
   - Line items count
   - Documents count

### Ver Conceptos (Pending)
1. User clicks "Ver conceptos"
2. Toast notification: "Próximamente - La vista de conceptos estará disponible pronto."
3. Future: Will show modal with all `sales_pagos` line items

### Ver Documentos (Pending)
1. User clicks "Ver documentos"
2. Toast notification: "Próximamente - La vista de documentos estará disponible pronto."
3. Future: Will show modal with all linked documents

### Eliminar (Working)
1. User clicks "Eliminar"
2. Confirmation dialog appears
3. Currently shows placeholder (delete mutation commented out)

## Supporting Components

### SaleTransactionDetailsModal
**Location**: `src/components/modals/sale-transaction-details-modal.tsx`

**Features**:
- Displays complete transaction information
- Shows payment summary with badges
- Lists all payment details with icons
- Shows line items and documents count
- Responsive design with proper formatting

### Hook: useSaleTransactionDetailsModal
**Location**: `src/hooks/sale-transaction-details-modal.ts`

**Interface**:
```typescript
interface SaleTransactionDetailsModalState {
  isOpen: boolean;
  transactionId: Id<"sales_transacciones"> | null;
  onOpen: (transactionId: Id<"sales_transacciones">) => void;
  onClose: () => void;
}
```

## Comparison: Regular vs Sales Transactions

| Aspect | ProyectoTransaccionesTablePage | SalesProyectoTransaccionesPage |
|--------|-------------------------------|--------------------------------|
| **Ver detalles modal** | `TransactionDetailsModal` | `SaleTransactionDetailsModal` |
| **Ver detalles hook** | `useTransactionDetailsModal` | `useSaleTransactionDetailsModal` |
| **Ver conceptos modal** | `TransactionConceptosModal` | ⏳ Not yet created |
| **Ver conceptos hook** | `useTransactionConceptosModal` | ⏳ Not yet created |
| **Ver documentos modal** | `TransactionDocumentosModal` | ⏳ Not yet created |
| **Ver documentos hook** | `useTransactionDocumentosModal` | ⏳ Not yet created |
| **Eliminar** | ✅ Working | ⏳ Mutation commented out |

## Future Enhancements

### 1. Sales Transaction Conceptos Modal
**Purpose**: Show all line items (sales_pagos) for a transaction

**Features needed**:
- List all `sales_pagos` linked to transaction
- Show partida, familia, sub_partida names
- Display amounts per line item
- Total sum at bottom
- Edit/delete individual line items

**Files to create**:
- `src/hooks/sale-transaction-conceptos-modal.ts`
- `src/components/modals/sale-transaction-conceptos-modal.tsx`

### 2. Sales Transaction Documentos Modal
**Purpose**: Show all documents linked to a sales transaction

**Features needed**:
- List all documents with `sales_transaccion_id` matching
- Show document names, types, upload dates
- Download buttons for each document
- Preview capability
- Unlink/delete options

**Files to create**:
- `src/hooks/sale-transaction-documentos-modal.ts`
- `src/components/modals/sale-transaction-documentos-modal.tsx`

### 3. Delete Mutation
**Purpose**: Fully delete sales transaction with all related data

**Implementation**:
```typescript
const deleteTransaction = useMutation(api.sales_transacciones.deleteTransaction);

const handleDelete = async () => {
  try {
    await deleteTransaction({ id: transactionToDelete });
    toast.success("Transacción eliminada", {
      description: "La transacción y sus conceptos han sido eliminados exitosamente.",
    });
  } catch (error) {
    toast.error("Error al eliminar", {
      description: error.message
    });
  }
};
```

**Backend**: Already exists at `convex/sales_transacciones.ts:deleteTransaction`

## Testing Checklist

**Ver Detalles:**
- [ ] Modal opens on button click
- [ ] Shows correct transaction data
- [ ] Displays all payment fields
- [ ] Currency formatting correct
- [ ] Date formatting correct
- [ ] Status badges show correct colors
- [ ] Modal closes properly

**Ver Conceptos:**
- [ ] Shows "Próximamente" toast
- [ ] Toast disappears after duration

**Ver Documentos:**
- [ ] Shows "Próximamente" toast
- [ ] Toast disappears after duration

**Eliminar:**
- [ ] Shows confirmation dialog
- [ ] Dialog has proper warning message
- [ ] Cancel button works
- [ ] Currently shows placeholder

## Benefits of Current Implementation

✅ **Partial Parity** - Ver detalles works identically to regular projects  
✅ **User Feedback** - Clear "Próximamente" messages for pending features  
✅ **Modal Infrastructure** - Modal system properly integrated  
✅ **Consistent UI** - Matches regular project transaction page design  
✅ **Code Organization** - Follows same patterns as regular projects  

## Next Steps

1. **Uncomment delete functionality** once ready for production
2. **Create conceptos modal** for line items view
3. **Create documentos modal** for document management
4. **Add edit transaction** functionality
5. **Add duplicate transaction** feature

---

**Status**: 🟡 Partially Complete
- ✅ Ver detalles: Working
- ⏳ Ver conceptos: Placeholder
- ⏳ Ver documentos: Placeholder
- ⏳ Eliminar: Implemented but commented out

**Files Modified**:
- `src/pages/SalesProyectoTransacciones/SalesProyectoTransaccionesPage.tsx`
