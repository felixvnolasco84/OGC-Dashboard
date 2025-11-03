# Transaction Modals Documentation

## Overview

Created three modals for the TransaccionesTablePage that allow users to view transaction details, line items (conceptos), and associated documents.

## Files Created

### 1. **Hooks** (State Management)

#### `/src/hooks/transaction-details-modal.ts`
Zustand hook for managing the Transaction Details modal state.
- `isOpen`: Boolean for modal visibility
- `transactionId`: ID of the transaction to display
- `onOpen(transactionId)`: Opens modal with specific transaction
- `onClose()`: Closes modal and clears transaction ID

#### `/src/hooks/transaction-conceptos-modal.ts`
Zustand hook for managing the Conceptos (Line Items) modal state.
- Same structure as details modal
- Manages display of line items table

#### `/src/hooks/transaction-documentos-modal.ts`
Zustand hook for managing the Documents modal state.
- Same structure as details modal
- Manages display of associated documents

### 2. **Modal Components**

#### `/src/components/modals/transaction-details-modal.tsx`
Displays complete transaction information including:
- **Transaction Summary Card**
  - Total amount (large, prominent)
  - Status badge (Pagado/Por pagar)
  - Payment type badge
  - Date and currency information
  
- **Payment Information Grid**
  - Factura (with icon)
  - Categoría (Anticipo, Material, Estimación)
  - Código de referencia
  - Bank details (banco, tarjeta, número de cuenta)
  - Transfer details (número de transferencia)
  - Comprobante

- **Summary Footer**
  - Line items count
  - Documents count

**Features**:
- Loading state with spinner
- Conditional field display (only shows fields with data)
- Icons for visual categorization
- Color-coded badges
- Responsive grid layout

#### `/src/components/modals/transaction-conceptos-modal.tsx`
Displays all line items (pagos) for a transaction:

- **Summary Section**
  - Total conceptos count
  - Monto total
  - Transaction date

- **Line Items Table**
  - Column headers: #, Partida, Familia, Sub-partida, Monto
  - Numbered rows for easy reference
  - Partida icon indicator
  - Right-aligned currency amounts
  - Footer row with total sum

- **Grouped Summary** (if multiple partidas)
  - Cards showing subtotals by partida
  - Item count per partida
  - Visual organization of complex transactions

**Features**:
- Empty state when no line items
- Hover effects on rows
- Bold total in footer
- Grouped view for better understanding
- Responsive table layout

#### `/src/components/modals/transaction-documentos-modal.tsx`
Displays all documents linked to a transaction:

- **Summary Section**
  - Total documents count
  - Transaction date

- **Document Cards**
  - File icon
  - Document name
  - Type badge (Factura, Comprobante, Cotización, Contrato)
  - Description text
  - Action buttons:
    - **Ver en Google Drive**: Opens file in Drive
    - **Descargar**: Direct download link

- **Document Types Summary**
  - Shows count by document type
  - Color-coded badges matching document types

**Features**:
- Empty state with icon when no documents
- Google Drive integration (view and download)
- Document type color coding
- Hover effects on cards
- External link handling

### 3. **Integration**

#### Updated `/src/pages/TransaccionesTable/TransaccionesTablePage.tsx`

**Added Imports**:
- Modal hooks (3)
- Modal components (3)
- Alert dialog components
- Delete mutation
- Toast notifications

**Added State**:
```typescript
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
const [transactionToDelete, setTransactionToDelete] = useState<Id<"transacciones"> | null>(null);
```

**Added Hooks**:
```typescript
const deleteTransaction = useMutation(api.transacciones.deleteTransaction);
const detailsModal = useTransactionDetailsModal();
const conceptosModal = useTransactionConceptosModal();
const documentosModal = useTransactionDocumentosModal();
```

**Dropdown Menu Actions**:
- **Ver detalles**: `detailsModal.onOpen(transaccion._id)`
- **Ver conceptos**: `conceptosModal.onOpen(transaccion._id)`
- **Ver documentos**: `documentosModal.onOpen(transaccion._id)`
- **Eliminar**: Opens confirmation dialog

**Delete Functionality**:
- Confirmation dialog before deletion
- Deletes transaction + line items + documents
- Success/error toast notifications
- Automatic UI refresh after deletion

#### Updated `/src/components/providers/modal-provider.tsx`

Added all three transaction modals to the global modal provider for proper rendering.

## Modal Flows

### 1. View Transaction Details

```
User clicks ⋮ menu → "Ver detalles" 
  → Opens TransactionDetailsModal
  → Fetches transaction via getTransactionById
  → Displays all payment information
  → Shows counts of line items and documents
```

### 2. View Line Items (Conceptos)

```
User clicks ⋮ menu → "Ver conceptos"
  → Opens TransactionConceptosModal
  → Fetches transaction with line items
  → Displays table with partida breakdown
  → Shows grouped summary if multiple partidas
  → Calculates and displays totals
```

### 3. View Documents

```
User clicks ⋮ menu → "Ver documentos"
  → Opens TransactionDocumentosModal
  → Fetches transaction with documents
  → Lists all documents with metadata
  → Provides Google Drive view/download links
  → Shows document type summary
```

### 4. Delete Transaction

```
User clicks ⋮ menu → "Eliminar"
  → Opens AlertDialog confirmation
  → User confirms deletion
  → Calls deleteTransaction mutation
  → Deletes transaction, line items, and documents
  → Shows success toast
  → Table updates automatically
```

## Color Coding

### Status Badges
- 🟢 **Pagado**: `bg-green-50 text-green-700 border-green-200`
- 🟠 **Por pagar**: `bg-orange-50 text-orange-700 border-orange-200`

### Payment Type Badges
- 🔵 **Efectivo**: `bg-blue-50 text-blue-700 border-blue-200`
- 🟣 **Transferencia**: `bg-purple-50 text-purple-700 border-purple-200`
- 🟦 **Tarjeta**: `bg-indigo-50 text-indigo-700 border-indigo-200`
- ⚪ **Cheque**: `bg-gray-50 text-gray-700 border-gray-200`

### Document Type Badges
- 🔵 **Factura**: `bg-blue-50 text-blue-700 border-blue-200`
- 🟢 **Comprobante**: `bg-green-50 text-green-700 border-green-200`
- 🟣 **Cotización**: `bg-purple-50 text-purple-700 border-purple-200`
- 🟠 **Contrato**: `bg-orange-50 text-orange-700 border-orange-200`

## Data Structure

### Transaction with Details

The `getTransactionById` query returns:

```typescript
{
  // Transaction fields
  _id: Id<"transacciones">,
  proyecto: Id<"desarrollos">,
  monto_total: number,
  fecha: string,
  tipo_pago: string,
  moneda: string,
  status: string,
  categoria?: string,
  factura?: string,
  banco?: string,
  // ... other fields
  
  // Joined data
  lineItems: Array<{
    _id: Id<"pagos">,
    transaccion_id: Id<"transacciones">,
    partida_id: Id<"partidas">,
    monto: number,
    partida: {  // Joined from partidas table
      nombre: string,
      familia: string,
      sub_partida: string
    }
  }>,
  
  documents: Array<{
    _id: Id<"documentos">,
    transaccion_id: Id<"transacciones">,
    nombre: string,
    descripcion: string,
    image: string,  // Google Drive file ID
    type: string,
    proyecto: Id<"desarrollos">
  }>
}
```

## Features Summary

### Transaction Details Modal ✅
- ✅ Complete transaction information
- ✅ Conditional field display
- ✅ Color-coded badges
- ✅ Icons for visual categorization
- ✅ Loading state
- ✅ Responsive layout
- ✅ Summary counts

### Conceptos Modal ✅
- ✅ Full line items table
- ✅ Numbered rows
- ✅ Partida/Familia/Sub-partida breakdown
- ✅ Total calculation
- ✅ Grouped summary by partida
- ✅ Empty state handling
- ✅ Hover effects

### Documentos Modal ✅
- ✅ Document cards with metadata
- ✅ Google Drive integration
- ✅ View and download links
- ✅ Document type badges
- ✅ Type summary footer
- ✅ Empty state with icon
- ✅ External link handling

### Delete Functionality ✅
- ✅ Confirmation dialog
- ✅ Cascading deletion (transaction + line items + documents)
- ✅ Success/error notifications
- ✅ Automatic UI refresh

## Google Drive Integration

Documents are stored with Google Drive file IDs. The modal provides:

### View URL
```
https://drive.google.com/file/d/{fileId}/view
```

### Download URL
```
https://drive.google.com/uc?export=download&id={fileId}
```

**Note**: Users need proper Google Drive permissions to access the files.

## Usage Examples

### Opening Modals Programmatically

```typescript
// In any component
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";
import { useTransactionConceptosModal } from "@/hooks/transaction-conceptos-modal";
import { useTransactionDocumentosModal } from "@/hooks/transaction-documentos-modal";

const MyComponent = () => {
  const detailsModal = useTransactionDetailsModal();
  const conceptosModal = useTransactionConceptosModal();
  const documentosModal = useTransactionDocumentosModal();
  
  const transactionId = "..."; // Some transaction ID
  
  return (
    <>
      <Button onClick={() => detailsModal.onOpen(transactionId)}>
        Ver Detalles
      </Button>
      <Button onClick={() => conceptosModal.onOpen(transactionId)}>
        Ver Conceptos
      </Button>
      <Button onClick={() => documentosModal.onOpen(transactionId)}>
        Ver Documentos
      </Button>
    </>
  );
};
```

### Deleting a Transaction

```typescript
import { useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { toast } from "sonner";

const MyComponent = () => {
  const deleteTransaction = useMutation(api.transacciones.deleteTransaction);
  
  const handleDelete = async (transactionId: Id<"transacciones">) => {
    try {
      await deleteTransaction({ id: transactionId });
      toast.success("Transacción eliminada");
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };
};
```

## Design Principles

1. **Consistency**: All modals follow the same design pattern as existing modals
2. **Clarity**: Information is organized in logical sections
3. **Responsiveness**: Works on all screen sizes
4. **Feedback**: Loading states and empty states guide the user
5. **Accessibility**: Proper headings, labels, and keyboard navigation
6. **Performance**: Only fetches data when modal opens
7. **Safety**: Confirmation before destructive actions

## Future Enhancements

Potential improvements:
- [ ] Edit transaction details inline
- [ ] Add/remove line items from modal
- [ ] Upload new documents from modal
- [ ] Print/export transaction details
- [ ] Email transaction information
- [ ] Duplicate transaction functionality
- [ ] Transaction history/audit log
- [ ] Batch operations on multiple transactions
- [ ] Advanced filtering in conceptos table
- [ ] Document preview (PDF viewer)

## Related Files

- `/convex/transacciones.ts` - Backend queries and mutations
- `/convex/pagos.ts` - Line items queries with joins
- `/convex/documentos.ts` - Document queries
- `/convex/schema.ts` - Database schema
- `/src/pages/TransaccionesTable/TransaccionesTablePage.tsx` - Main table page
- `/src/components/modals/upload-transactions-modal.tsx` - Creates transactions

## Testing Checklist

- [ ] Open details modal from table
- [ ] Verify all transaction fields display correctly
- [ ] Open conceptos modal
- [ ] Verify line items table shows all pagos
- [ ] Verify total calculation is correct
- [ ] Open documentos modal
- [ ] Verify document cards display
- [ ] Test Google Drive view link
- [ ] Test Google Drive download link
- [ ] Test delete confirmation dialog
- [ ] Verify delete removes transaction
- [ ] Verify delete removes line items
- [ ] Verify delete removes documents
- [ ] Test loading states
- [ ] Test empty states
- [ ] Test with transactions that have no line items
- [ ] Test with transactions that have no documents
- [ ] Test responsive layout on mobile
- [ ] Test keyboard navigation
