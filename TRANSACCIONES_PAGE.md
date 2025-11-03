# TransaccionesTablePage Documentation

## Overview

Created a new **TransaccionesTablePage** that displays parent transaction records instead of individual line items (pagos). This provides a high-level view of all financial transactions in the system.

## Files Created/Modified

### 1. **New Page Component**
**Location**: `/src/pages/TransaccionesTable/TransaccionesTablePage.tsx`

A comprehensive table view for transactions featuring:
- **Transaction-level data** (not line items)
- **Search functionality** across proyecto, factura, código, tipo_pago
- **Summary badges** showing total count and total amount
- **Color-coded badges** for status, tipo_pago, categoría, and moneda
- **Dropdown actions** for each transaction

### 2. **New Convex Query**
**Location**: `/convex/transacciones.ts`

Added `getAllWithDetails` query that:
- Fetches all transactions
- Enriches with project name (`proyectoNombre`)
- Counts line items (`lineItemsCount`)
- Counts documents (`documentsCount`)
- Orders by most recent first

### 3. **Routing Updates**
**Location**: `/src/main.tsx`

- Imported `TransaccionesTablePage`
- Route: `/transacciones` → `TransaccionesTablePage`
- Replaced old `/pagos` route

### 4. **Navigation Updates**
**Location**: `/src/components/ui/Sidebar.tsx`

- Changed "Pagos" to "Transacciones"
- Updated path from `/pagos` to `/transacciones`

## Page Features

### Table Columns

| Column | Description | Type |
|--------|-------------|------|
| **Proyecto** | Project name | Text |
| **Factura** | Invoice/factura number with icon | Text + Icon |
| **Monto Total** | Total transaction amount | Currency (bold) |
| **Fecha** | Transaction date | Date (formatted) |
| **Tipo de pago** | Payment type (Efectivo, Transferencia, etc.) | Badge |
| **Categoría** | Category (Anticipo, Material, Estimación) | Badge |
| **Status** | Payment status (Pagado, Por pagar) | Badge |
| **Moneda** | Currency (MXN, USD) | Badge |
| **Conceptos** | Number of line items | Count Badge |
| **Docs** | Number of documents | Count Badge |
| **Actions** | Dropdown menu | Menu |

### Badge Color Coding

#### Status
- 🟢 **Pagado**: Green (bg-green-50)
- 🟠 **Por pagar**: Orange (bg-orange-50)
- ⚪ **Default**: Gray (bg-gray-100)

#### Tipo de Pago
- 🔵 **Efectivo**: Blue (bg-blue-50)
- 🟣 **Transferencia**: Purple (bg-purple-50)
- 🟦 **Tarjeta**: Indigo (bg-indigo-50)
- ⚪ **Cheque**: Gray (bg-gray-50)

#### Categoría
- 🔷 **Anticipo**: Cyan (bg-cyan-50)
- 🟡 **Material**: Amber (bg-amber-50)
- 🟢 **Estimación**: Emerald (bg-emerald-50)

#### Moneda
- 🟢 **USD**: Green (bg-green-100)
- ⚪ **MXN**: Gray (bg-gray-100)

### Summary Statistics

Two summary badges at the top right:
1. **Total**: Total number of transactions
2. **Monto total**: Sum of all transaction amounts in MXN format

### Search Functionality

Search filters transactions by:
- Project name
- Factura number
- Código de referencia
- Tipo de pago

Real-time filtering as user types.

### Dropdown Actions

Each transaction has a dropdown menu with:
- **Ver detalles**: View transaction details
- **Ver conceptos**: View line items (pagos)
- **Ver documentos**: View associated documents
- **Eliminar**: Delete transaction (red text)

## Data Structure

### Transaction with Details

```typescript
{
  _id: Id<"transacciones">,
  proyecto: Id<"desarrollos">,
  proyectoNombre: string,           // ← Added by query
  monto_total: number,
  fecha: string,                     // DD/MM/YYYY
  tipo_pago: string,
  moneda: string,
  tipo_cambio: string,
  status: string,
  categoria?: string,
  factura?: string,
  codigo_referencia?: string,
  banco?: string,
  lineItemsCount: number,            // ← Added by query
  documentsCount: number,            // ← Added by query
  // ... other fields
}
```

## Differences from PagosTablePage

| Aspect | PagosTablePage | TransaccionesTablePage |
|--------|----------------|------------------------|
| **Data Source** | Individual line items (pagos) | Parent transactions |
| **Granularity** | Per partida/familia/sub-partida | Per transaction |
| **Monto** | Individual line item amount | Total transaction amount |
| **Columns** | Partida, Familia, Sub-partida | Factura, Categoría, Conceptos |
| **Use Case** | Detailed payment breakdown | High-level transaction overview |
| **Query** | `api.pagos.getAll` | `api.transacciones.getAllWithDetails` |

## Usage

### Navigation
1. Click **"Transacciones"** in the sidebar
2. Or navigate to `/transacciones`

### Searching
1. Type in the search bar
2. Filter by proyecto, factura, código, or tipo de pago
3. Results update in real-time

### Viewing Details
1. Click the **⋮** menu button on any row
2. Select an action:
   - Ver detalles
   - Ver conceptos
   - Ver documentos
   - Eliminar

## Future Enhancements

Potential improvements:
- [ ] Transaction details modal
- [ ] Line items (conceptos) modal showing all pagos
- [ ] Documents viewer/manager
- [ ] Export to Excel/PDF
- [ ] Advanced filters (date range, status, tipo_pago)
- [ ] Bulk operations (delete, update status)
- [ ] Transaction editing modal
- [ ] Pagination for large datasets
- [ ] Sorting by column headers
- [ ] Transaction duplication

## Performance Considerations

The `getAllWithDetails` query:
- Fetches all transactions at once (no pagination yet)
- Makes N+1 queries for project names and counts
- May slow down with 1000+ transactions

**Recommendation**: Implement pagination for production use with large datasets.

## Integration with Upload Transactions Modal

The Upload Transactions Modal (from Google Drive integration) creates transactions that will appear in this table:
- Each Excel upload creates multiple transactions
- Transactions appear immediately after creation
- Line items and documents are linked automatically
- Search by factura number to find uploaded transactions

## Related Files

- `/src/components/modals/upload-transactions-modal.tsx` - Creates new transactions
- `/convex/transacciones.ts` - Transaction mutations and queries
- `/convex/schema.ts` - Transaction schema definition
- `/src/components/ui/Sidebar.tsx` - Navigation component
- `/src/main.tsx` - Routing configuration

## Design System

Follows the existing OGC Dashboard design patterns:
- **Font**: Helvetica Neue
- **Spacing**: px-6 py-4 for table cells
- **Colors**: Tailwind CSS color palette
- **Borders**: Gray-200 for table borders
- **Hover**: Subtle bg-gray-50 on rows
- **Badges**: Rounded-full with outline variant
- **Icons**: Lucide React icons (h-4 w-4)
