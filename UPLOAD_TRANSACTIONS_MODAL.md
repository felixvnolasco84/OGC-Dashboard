# Upload Transactions Modal

## Overview
The Upload Transactions Modal allows users to bulk upload transactions from Excel files. It processes the API response and automatically creates transactions, line items (pagos), and can optionally link documents from Google Drive.

## Features

### ✅ Implemented
1. **Project Selection** - Dropdown to select which project the transactions belong to
2. **File Upload** - Drag & drop or file browser for Excel files (.xlsx, .xls)
3. **File Validation** - Validates file type and size (max 10MB)
4. **API Integration** - Sends Excel to processing API
5. **Response Processing** - Displays summary of processed data
6. **Transaction Creation** - Automatically creates transactions with line items
7. **Partida Matching** - Matches line items to existing partidas using identifiers (partida, familia, sub_partida)
8. **Error Handling** - Tracks success/error counts and displays appropriate messages
9. **Google Drive Integration** ✨ NEW
   - URL input for Google Drive folder containing documents
   - OAuth2 access token input for API access
   - Automatic file matching (exact and fuzzy matching)
   - Batch documento creation linked to transactions
   - Detailed success/error reporting for documents

## API Response Format

The modal expects the following response structure from the Excel processing API:

```json
{
  "success": true,
  "fileName": "Control General OGC.xlsx",
  "sheetName": "Hoja 1",
  "summary": {
    "totalRows": 49,
    "validRows": 49,
    "errors": 0,
    "transactionsCreated": 3,
    "totalAmount": 1445609.1721
  },
  "transactions": [
    {
      "transaction": {
        "proyecto": "project_id_string",
        "monto_total": 174378.48,
        "fecha": 45594,  // Excel serial date
        "tipo_pago": "Efectivo",
        "moneda": "MXN",
        "tipo_cambio": "1.0",
        "status": "Pagado",
        "categoria": "Anticipo",
        "factura": "XL-08"
      },
      "lineitems": [
        {
          "partida_identifier": {
            "partida": "MURO_CONT",
            "familia": "CIMBRA",
            "subpartida": "POLIN DE PINO DE 3A"
          },
          "monto": 22799.568,
          "administracion": "URBANIZACIÓN",
          "codigo": "URB-MUR-CIM-POL-44-24-ADLM",
          "tipo_documento": "Factura",
          "nombre_documento": "MLP.pdf",
          "descripcion_documento": "lorem"
        }
      ],
      "factura": "L-09",
      "itemCount": 9
    }
  ]
}
```

## How It Works

### 1. File Upload
- User selects a project from the dropdown
- User uploads Excel file (drag & drop or file browser)
- File is validated (type and size)

### 2. Processing
- Excel file is sent to API: `https://ogc-excel-reader.vercel.app/upload`
- API returns structured transaction data
- Modal displays processing summary

### 3. Transaction Creation
For each transaction in the API response:

1. **Partida Matching**
   - Queries all partidas for the selected project
   - Creates a lookup map using `${nombre}_${familia}_${sub_partida}` as key
   - Matches each line item to existing partida using identifiers

2. **Line Items Preparation**
   - For each line item, finds corresponding partida_id
   - Skips line items where partida is not found (logs warning)
   - Creates array of line items with: `partida_id`, `partida`, `familia`, `sub_partida`, `monto`

3. **Transaction Creation**
   - Calls `createTransaction` mutation with:
     - Transaction details (proyecto, monto_total, fecha, etc.)
     - Array of line items (pagos)
   - Date is converted from Excel serial format to DD/MM/YYYY
   - Only creates transaction if line items exist

### 4. Results
- Displays success count and error count
- Shows toast notification with results
- Closes modal on successful completion

## Database Records Created

### Transacciones (Parent)
```typescript
{
  proyecto: Id<"desarrollos">,
  monto_total: number,
  fecha: string,  // DD/MM/YYYY
  tipo_pago: string,  // "Efectivo", "Transferencia", etc.
  moneda: string,  // "MXN", "USD"
  tipo_cambio: string,
  status: string,  // "Pagado", "Pendiente"
  codigo_referencia: string,  // categoria from API
  banco: string,  // empty for now
  factura: string,
  // ... other fields
}
```

### Pagos (Line Items)
```typescript
{
  transaccion_id: Id<"transacciones">,
  partida_id: Id<"partidas">,
  monto: number
}
```

**Note**: The `pagos` table was simplified to only store essential fields. All other data (partida names, familia, etc.) is retrieved through joins with the `partidas` table.

## Usage

### 1. Import and Add Modal to Your Page

```tsx
import UploadTransactionsModal from "@/components/modals/upload-transactions-modal";
import { useUploadTransactionsModal } from "@/hooks/upload-transactions-modal";

export default function YourPage() {
  const uploadTransactionsModal = useUploadTransactionsModal();

  return (
    <>
      <Button onClick={() => uploadTransactionsModal.onOpen()}>
        Subir Transacciones
      </Button>
      
      <UploadTransactionsModal />
    </>
  );
}
```

### 2. Open Modal
```tsx
uploadTransactionsModal.onOpen();
```

### 3. Close Modal
```tsx
uploadTransactionsModal.onClose();
```

## Google Drive Integration (To Be Implemented)

The modal has a field for Google Drive folder URL. The intended workflow is:

1. User provides Google Drive folder URL containing documents
2. For each line item with `nombre_documento`, search for matching file in Drive folder
3. Create `documentos` record linking the file to the transaction:

```typescript
{
  transaccion_id: Id<"transacciones">,
  tipo_documento: string,  // from lineitem
  nombre_documento: string,  // from lineitem
  descripcion_documento: string,  // from lineitem
  image: string,  // Google Drive file ID or URL
  proyecto: Id<"desarrollos">
}
```

**Implementation Notes**:
- Will need Google Drive API integration
- Match files by name (fuzzy matching may be needed)
- Handle duplicate file names
- Support batch document creation

## Files Created

1. **Hook**: `/src/hooks/upload-transactions-modal.ts`
   - Zustand store for modal state management
   
2. **Component**: `/src/components/modals/upload-transactions-modal.tsx`
   - Modal UI with file upload, project selection, processing logic

3. **Query**: `/convex/partida.ts` (added `findByIdentifiers` query)
   - Query to find partida by identifiers for matching

## Error Handling

The modal handles several error scenarios:

- **No project selected**: Shows error toast
- **No file selected**: Shows error toast
- **Invalid file type**: Toast notification
- **File too large**: Toast notification (>10MB)
- **API error**: Shows error summary in modal
- **Partida not found**: Skips line item, logs warning, continues processing
- **Transaction creation error**: Increments error count, logs error, continues with remaining transactions

## Example Usage Flow

1. User clicks "Subir Transacciones" button
2. Modal opens
3. User selects project "SUNRISE - FOUR SEASONS"
4. User drags Excel file onto upload area
5. User (optionally) adds Google Drive folder URL
6. User clicks "Subir y Procesar"
7. Modal shows "Subiendo..." status
8. API processes Excel and returns transaction data
9. Modal displays summary (49 rows, 3 transactions, $1,445,609.17)
10. Modal shows "Procesando..." status
11. For each transaction, modal:
    - Matches line items to partidas
    - Creates transaction with line items
12. Modal shows "Transacciones creadas: 3 transacciones exitosamente"
13. Modal closes automatically

## Future Enhancements

- [ ] Support for updating existing transactions (instead of only creating new ones)
- [ ] Preview mode (show what will be created before actually creating)
- [ ] Batch validation before submission
- [ ] Google Drive document linking
- [ ] Support for custom field mapping
- [ ] Progress indicator for large files
- [ ] Rollback on partial failure
- [ ] Export error log for failed transactions
