# Upload Project Transactions Modal

## Overview
Created a project-specific modal for uploading transactions directly from a project's transaction table page, without requiring the user to select a project from a dropdown.

## Files Created

### 1. Hook (`upload-project-transactions-modal.ts`)
**Location:** `/src/hooks/upload-project-transactions-modal.ts`

State management hook using Zustand that accepts a project ID and name when opening:

```typescript
interface UploadProjectTransactionsModalState {
  isOpen: boolean;
  proyectoId: Id<"desarrollos"> | null;
  proyectoNombre: string | null;
  onOpen: (proyectoId: Id<"desarrollos">, proyectoNombre: string) => void;
  onClose: () => void;
}
```

**Usage:**
```typescript
const uploadModal = useUploadProjectTransactionsModal();

// Open modal with project context
uploadModal.onOpen(projectId, "Project Name");
```

### 2. Modal Component (`upload-project-transactions-modal.tsx`)
**Location:** `/src/components/modals/upload-project-transactions-modal.tsx`

Simplified version of the global upload-transactions-modal without project selector.

**Key Features:**
- ✅ No project selection dropdown (already in context)
- ✅ Shows project name in dialog description
- ✅ Drag & drop Excel file upload
- ✅ File validation (.xlsx, .xls, max 10MB)
- ✅ Google Drive integration (optional)
- ✅ Automatic partida matching
- ✅ Bulk transaction creation
- ✅ Document linking support
- ✅ Progress indicators
- ✅ Success/error summaries

## Integration

### ProyectoTransaccionesTablePage
Updated the page to use the new project-specific modal:

**Before:**
```typescript
const uploadTransactionsModal = useUploadTransactionsModal();

<Button onClick={() => uploadTransactionsModal.onOpen()}>
  Subir Transacciones
</Button>
```

**After:**
```typescript
const uploadProjectTransactionsModal = useUploadProjectTransactionsModal();

<Button onClick={() => uploadProjectTransactionsModal.onOpen(
  proyectoId as Id<"desarrollos">, 
  proyecto.nombre
)}>
  Subir Transacciones
</Button>

{/* Add modal at end of component */}
<UploadProjectTransactionsModal />
```

## Differences from Global Modal

### Global Upload Transactions Modal
**File:** `upload-transactions-modal.tsx`
- Used in: ProyectosTablePage (main projects list)
- Requires: User to select project from dropdown
- Context: Multi-project view

### Project-Specific Upload Modal
**File:** `upload-project-transactions-modal.tsx`
- Used in: ProyectoTransaccionesTablePage (single project view)
- Requires: Project ID and name passed when opening
- Context: Already viewing specific project

## Features

### File Upload
- **Drag & drop** or browse for Excel files
- **Validation:** .xlsx, .xls formats only, max 10MB
- **Preview:** Shows file name and size after selection
- **Replace/Remove:** Can change or remove file before upload

### Excel Processing
- Uploads to: `https://ogc-excel-reader.vercel.app/upload/transactions`
- Sends: File + proyecto_id
- Receives: Parsed transactions with line items
- Shows: Summary statistics (rows, valid, errors, total amount)

### Transaction Creation
1. **Partida Matching:** Creates lookup map from project partidas
2. **Line Items:** Resolves each line item to partida_id
3. **Bulk Create:** Creates all transactions via Convex mutation
4. **Error Handling:** Tracks successes/failures with detailed messages

### Google Drive Integration (Optional)
- **Folder URL:** User provides Google Drive folder link
- **Access Token:** OAuth2 token for Drive API access
- **Document Matching:** Finds files referenced in Excel
- **Auto-Link:** Creates documento records linked to transactions

### Progress States
- **Uploading:** Sending file to API
- **Processing:** Creating transactions in database
- **Completed:** Shows success/error summary

## Data Flow

```
User selects file
      ↓
File uploaded to Excel parser API
      ↓
API returns parsed transactions
      ↓
Modal validates and processes
      ↓
For each transaction:
  ├─ Match line items to partidas
  ├─ Create transaction with line items
  └─ Store transaction ID
      ↓
If Google Drive configured:
  ├─ Extract document names from Excel
  ├─ Search Google Drive folder
  └─ Link found documents to transactions
      ↓
Show summary and close modal
```

## Error Handling

### File Validation Errors
- Invalid file type → Toast error
- File too large → Toast error
- No file selected → Toast error

### Processing Errors
- Partida not found → Warning + skip line item
- No line items → Skip transaction
- Transaction creation failed → Error logged + count

### Google Drive Errors
- Invalid folder URL → Warning shown
- No access token → Info toast (optional)
- File not found → Warning per file
- API errors → Logged + summary

## Usage Example

```typescript
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";
import UploadProjectTransactionsModal from "@/components/modals/upload-project-transactions-modal";

function MyProjectPage() {
  const { proyectoId } = useParams();
  const proyecto = useQuery(api.desarrollos.getById, { id: proyectoId });
  const uploadModal = useUploadProjectTransactionsModal();

  return (
    <div>
      <Button 
        onClick={() => uploadModal.onOpen(proyectoId, proyecto.nombre)}
      >
        Upload Transactions
      </Button>
      
      <UploadProjectTransactionsModal />
    </div>
  );
}
```

## Benefits

### 1. **Better UX**
- No need to select project (already known)
- Fewer steps to upload
- Clear project context in modal

### 2. **Reduced Errors**
- Can't accidentally upload to wrong project
- Project validation happens automatically
- Less user confusion

### 3. **Cleaner Code**
- Dedicated hook for project-specific uploads
- Simplified modal component
- Clear separation of concerns

### 4. **Consistency**
- Same upload logic as global modal
- Same Excel format expected
- Same error handling patterns

## Technical Notes

### Hook State
- `proyectoId`: Stored in hook when modal opens
- `proyectoNombre`: Displayed in modal header
- Automatically cleared on close

### Form Validation
- `isFormValid = file !== null`
- Project validation happens via hook state
- Disabled submit until file selected

### Partidas Lookup
- Creates `Map<string, Id>` for fast matching
- Key format: `${partida}_${familia}_${subpartida}`
- Warns if partida not found (doesn't fail)

### Transaction Structure
```typescript
{
  proyecto: Id<"desarrollos">,
  monto_total: number,
  fecha: string, // DD/MM/YYYY
  tipo_pago: string,
  status: string,
  lineItems: [{
    partida_id: Id<"partidas">,
    monto: number
  }]
}
```

## Future Enhancements

Potential improvements:
1. **Template Download** - Provide Excel template
2. **Validation Preview** - Show matched partidas before creating
3. **Duplicate Detection** - Warn if transaction already exists
4. **Batch Progress** - Real-time progress bar per transaction
5. **Rollback** - Undo all if one fails
6. **CSV Support** - Accept CSV in addition to Excel
