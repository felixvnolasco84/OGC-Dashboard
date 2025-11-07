# Transaction-Document Sync Feature

## Overview
Automatically synchronizes transactions with their corresponding documents by matching the transaction's `factura` field with the document's `nombre` field.

## Problem Solved
When transactions are uploaded via Excel, the factura field contains document names (e.g., "FPS-11454.pdf", "LEMA-F002DC765712.pdf"). However, these documents may already exist in the system but are not linked to the transactions. This sync function automatically creates the links.

## How It Works

### Matching Logic
The sync function uses a **smart matching algorithm** with multiple fallback strategies:

1. **Exact Match**: `transaccion.factura === documento.nombre`
2. **Extension-Agnostic Match**: Removes file extensions and compares
   - `"FPS-11454.pdf"` matches `"FPS-11454"`
3. **Partial Match**: Checks if either string contains the other
   - `"FPS-11454"` matches `"FPS-11454-extra"`

All comparisons are:
- ✅ Case-insensitive
- ✅ Trimmed of whitespace
- ✅ Extension-aware (.pdf, .jpg, .jpeg, .png, .doc, .docx, .xls, .xlsx)

### Data Flow

```
User clicks "Sincronizar Docs"
        ↓
Fetch all transactions for project
        ↓
Fetch all documents for project
        ↓
Build factura → transaction map
        ↓
For each document:
  ├─ Try exact match
  ├─ Try extension-removed match
  └─ Try partial match
        ↓
If match found:
  ├─ Check if already linked → Skip
  └─ Not linked → Update documento.transaccion_id
        ↓
Return summary (matched, unmatched, already linked, errors)
        ↓
Show toast notifications
```

## Implementation

### Backend - Convex Mutation
**File:** `/convex/sync.ts`

```typescript
export const syncTransactionsWithDocuments = mutation({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Fetch transactions and documents
    // Create lookup map
    // Match and link
    // Return results
  }
});
```

**Returns:**
```typescript
{
  success: boolean;
  summary: {
    totalDocuments: number;
    totalTransactions: number;
    matched: number;           // Newly linked documents
    unmatched: number;         // Documents with no matching transaction
    alreadyLinked: number;     // Already correctly linked
    errors: number;            // Processing errors
  };
  details: Array<{
    documentoNombre: string;
    transaccionFactura: string;
    action: "linked" | "already_linked" | "no_match";
  }>;
}
```

### Frontend - React Component
**File:** `/src/pages/ProyectoTransaccionesTable/ProyectoTransaccionesTablePage.tsx`

**New Button:**
```tsx
<Button
  onClick={handleSync}
  disabled={isSyncing}
  variant="outline"
  size="lg"
  className="flex items-center gap-2 rounded-none text-blue-600 py-6"
>
  {isSyncing ? "Sincronizando..." : "Sincronizar Docs"}
  <RefreshCw className={`h-5 w-5 ${isSyncing ? "animate-spin" : ""}`} />
</Button>
```

**Handler:**
```typescript
const handleSync = async () => {
  setIsSyncing(true);
  try {
    const result = await syncTransactionsWithDocuments({ proyecto_id });
    
    // Show success toast with summary
    toast.success("Sincronización completada", {
      description: `${matched} vinculados, ${alreadyLinked} ya vinculados, ${unmatched} sin coincidencias`
    });
    
    // Show unmatched details if any
    if (summary.unmatched > 0) {
      toast.info("Documentos sin coincidencias", {
        description: "List of first 5 unmatched documents..."
      });
    }
  } catch (error) {
    toast.error("Error al sincronizar");
  } finally {
    setIsSyncing(false);
  }
};
```

## User Interface

### Button Location
Located in the header section next to "Subir Transacciones" button:

```
┌─────────────────────────────────────────────────────────┐
│ Transacciones                                           │
│ Quintazur                                               │
│                                                         │
│  [Subir Transacciones] [Sincronizar Docs]              │
│  [Total: 245] [Monto total: $1,234,567.89]            │
└─────────────────────────────────────────────────────────┘
```

### Visual States

**Normal State:**
- Text: "Sincronizar Docs"
- Icon: RefreshCw (static)
- Color: Blue (#3B82F6)

**Loading State:**
- Text: "Sincronizando..."
- Icon: RefreshCw (spinning animation)
- Button: Disabled

### Toast Notifications

**Success:**
```
✓ Sincronización completada
  5 documentos vinculados, 12 ya estaban vinculados, 3 sin coincidencias.
```

**Info (Unmatched Documents):**
```
ℹ Documentos sin coincidencias
  DOC-123.pdf, INVOICE-456.pdf, FILE-789.pdf
```

**Error:**
```
✗ Error al sincronizar
  Ocurrió un error inesperado.
```

## Example Scenarios

### Scenario 1: Perfect Match
**Transaction:**
- factura: "FPS-11454.pdf"

**Document:**
- nombre: "FPS-11454.pdf"

**Result:** ✅ Linked

---

### Scenario 2: Extension Mismatch
**Transaction:**
- factura: "LEMA-F002DC765712"

**Document:**
- nombre: "LEMA-F002DC765712.pdf"

**Result:** ✅ Linked (extension-agnostic matching)

---

### Scenario 3: Case Mismatch
**Transaction:**
- factura: "fps-11454.PDF"

**Document:**
- nombre: "FPS-11454.pdf"

**Result:** ✅ Linked (case-insensitive)

---

### Scenario 4: Multiple Invoices
**Transaction:**
- factura: "FPS-11292-11252-11230-11265-11310.pdf"

**Document:**
- nombre: "FPS-11292.pdf"

**Result:** ✅ Linked (partial match)

---

### Scenario 5: Already Linked
**Transaction:**
- factura: "TLT-6027773.pdf"
- _id: "abc123"

**Document:**
- nombre: "TLT-6027773.pdf"
- transaccion_id: "abc123"

**Result:** ⏭️ Skipped (already linked)

---

### Scenario 6: No Match
**Transaction:**
- factura: "INVOICE-999.pdf"

**Document:**
- nombre: "RECEIPT-123.pdf"

**Result:** ⚠️ Unmatched

## When to Use

### ✅ Use Sync When:
1. **After bulk upload** - Transaction Excel contains factura references
2. **Documents uploaded separately** - Documents exist but aren't linked
3. **Migration** - Moving from old system to new
4. **Manual entry** - Transactions entered manually, documents uploaded later
5. **Data cleanup** - Fixing broken or missing links

### ❌ Don't Need Sync When:
1. **Upload includes linking** - Modal already links documents
2. **No documents** - No files to match
3. **Already linked** - Everything is correctly connected

## Database Impact

### Tables Modified
**documentos table:**
- Updates `transaccion_id` field
- Only for matched documents
- Preserves existing correct links

### Tables Read (No Modifications)
- `transacciones` - Read factura field
- `desarrollos` - Validate project

### Performance
- **Query Cost:** O(n + m) where n = transactions, m = documents
- **Write Cost:** O(matched) - Only updates matched documents
- **Memory:** Builds in-memory map, O(n) for transaction lookup

## Security & Validation

### Access Control
- ✅ Requires valid `proyecto_id`
- ✅ Only syncs within specified project
- ✅ No cross-project linking

### Data Integrity
- ✅ Validates all IDs before updating
- ✅ Preserves existing correct links
- ✅ Atomic updates per document
- ✅ Error handling prevents partial failures

### Logging
- Console logs unmatched documents
- Console logs matching process
- Error details captured and returned

## Troubleshooting

### Problem: No documents matched
**Causes:**
- Document names don't match factura values
- Missing file extensions
- Typos in factura field

**Solutions:**
1. Check transaction factura values
2. Verify document names
3. Manual review of unmatched list

---

### Problem: Too many unmatched
**Causes:**
- Naming convention mismatch
- Multiple documents per transaction
- Complex factura format

**Solutions:**
1. Standardize naming convention
2. Use partial matching (already implemented)
3. Manual linking for edge cases

---

### Problem: Already linked count is high
**Cause:**
- Running sync multiple times
- Previous successful sync

**Solution:**
- This is normal! Sync is idempotent
- No action needed

## Future Enhancements

### Potential Improvements
1. **Fuzzy Matching** - Levenshtein distance for typos
2. **Multiple Documents** - Link one transaction to many documents
3. **Manual Override** - UI to force specific links
4. **Sync History** - Track when syncs were performed
5. **Preview Mode** - Show what would be linked before committing
6. **Batch Processing** - Handle very large projects efficiently
7. **Smart Suggestions** - ML-based matching for ambiguous cases

## API Reference

### Mutation: `syncTransactionsWithDocuments`

**Args:**
```typescript
{
  proyecto_id: Id<"desarrollos">
}
```

**Returns:**
```typescript
{
  success: boolean;
  summary: {
    totalDocuments: number;
    totalTransactions: number;
    matched: number;
    unmatched: number;
    alreadyLinked: number;
    errors: number;
  };
  details: Array<{
    documentoNombre: string;
    transaccionFactura: string;
    action: "linked" | "already_linked" | "no_match";
  }>;
}
```

**Errors:**
- Invalid `proyecto_id` → Convex validation error
- Database connection issues → Exception thrown
- Permission issues → Convex auth error

## Testing Checklist

- [ ] Sync with no documents (should succeed with 0 matched)
- [ ] Sync with no transactions (should succeed with 0 matched)
- [ ] Sync with exact matches
- [ ] Sync with case differences
- [ ] Sync with extension differences
- [ ] Sync with partial matches
- [ ] Sync already linked documents (should skip)
- [ ] Sync with unmatched documents (should report)
- [ ] Sync button shows loading state
- [ ] Toast notifications appear correctly
- [ ] Multiple syncs are idempotent
- [ ] Error handling works

## Technical Notes

### Normalization Strategy
All comparisons use lowercase and trimmed strings:
```typescript
const normalized = value.toLowerCase().trim();
```

### Extension Removal Pattern
```typescript
const nameWithoutExt = name.replace(
  /\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx)$/i, 
  ''
);
```

### Map-Based Lookup
Uses `Map<string, Transaction>` for O(1) lookup performance instead of nested loops (O(n²)).

### Idempotent Design
Running sync multiple times is safe:
- Already linked documents are skipped
- No duplicate links created
- No data loss or corruption

## Conclusion

The sync feature provides a robust, user-friendly way to automatically link transactions with their corresponding documents based on intelligent name matching. It handles edge cases gracefully and provides clear feedback to users about the sync results.
