# Admin Sales Flujo Page Implementation

## Overview
Created a complete flujo (cash flow) projection upload system for **sales_projects**, mirroring the existing AdminFlujoPage functionality but adapted for sales data.

## Files Created/Modified

### 1. **Backend - Convex Mutations & Queries**
**File:** `/convex/sales_projected_transactions.ts`

**Mutations:**
- `uploadSalesProjections`: Uploads weekly cash flow projections from Excel API
  - Deletes existing projections for the sales project
  - Inserts new projection records
  - Returns success status and count of inserted records

- `deleteBySalesProject`: Removes all projections for a specific sales project

**Queries:**
- `getBySalesProject`: Returns all projections for a sales project, sorted by date
- `getGroupedByWeek`: Groups projections by week and sums amounts
- `getCumulativeProjections`: Calculates cumulative collections over time
- `getUploadMetadata`: Returns upload information (file name, upload ID, timestamp)

**Key Features:**
- Uses `sales_projected_transactions` table (defined in schema)
- References `sales_projects` instead of `desarrollos`
- Excel serial date handling
- Automatic replacement of existing data on re-upload

---

### 2. **Frontend - Admin Page**
**File:** `/src/pages/AdminSalesFlujo/AdminSalesFlujoPage.tsx`

**Features:**
- **Sales Project Selector**: Dropdown to select from all sales projects
- **File Upload**: Drag-and-drop Excel file upload (.xlsx, .xls)
- **API Integration**: Connects to `https://ogc-excel-reader.vercel.app/upload/flujo`
- **Response Summary Display**:
  - File name and sheet name
  - Total flujos (line items)
  - Number of periods
  - Total projected amount
  - Date range
  - Individual flujo breakdown with amounts

**User Flow:**
1. Select a sales project from dropdown
2. Upload Excel file with weekly projections
3. File is processed by external API
4. Data is transformed and saved to Convex
5. Success/error message displayed
6. Summary of uploaded data shown

**Styling:**
- Matches AdminFlujoPage design
- Uses shadcn/ui components (Card, Select, Alert, etc.)
- Responsive layout with Tailwind CSS
- Loading states and error handling
- Mexican Peso currency formatting

---

### 3. **Routing**
**File:** `/src/main.tsx`

**Added:**
- Import: `AdminSalesFlujoPage`
- Route: `/admin/sales-flujo` (admin-protected)

**Access:**
- Navigate to: `http://localhost:5173/admin/sales-flujo`
- Requires: Admin role

---

## Database Schema Reference

From `convex/schema.ts`:

```typescript
sales_projected_transactions: defineTable({
  sales_proyecto: v.id("sales_projects"),
  partida: v.string(),              // Partida name from Excel
  week_date: v.number(),             // Excel serial date
  amount: v.number(),                // Projected amount for this week
  position: v.number(),              // Week position index
  upload_id: v.string(),             // Unique batch ID
  file_name: v.string(),
  sheet_name: v.string(),
  uploaded_at: v.number(),           // Timestamp
}).index("by_sales_proyecto", { fields: ["sales_proyecto"] })
  .index("by_upload_id", { fields: ["upload_id"] })
  .index("by_sales_proyecto_partida", { fields: ["sales_proyecto", "partida"] })
  .index("by_sales_proyecto_week", { fields: ["sales_proyecto", "week_date"] })
```

---

## Differences from AdminFlujoPage

| Feature | AdminFlujoPage (Desarrollos) | AdminSalesFlujoPage (Sales) |
|---------|------------------------------|------------------------------|
| **Database** | `projected_transactions` | `sales_projected_transactions` |
| **Project Type** | `desarrollos` | `sales_projects` |
| **Project Fetch** | `api.desarrollos.getAll` | `api.sales_projects.getAll` |
| **Mutation** | `uploadProjections` | `uploadSalesProjections` |
| **Page Title** | "Flujo de Caja Proyectado" | "Flujo de Caja Proyectado - Ventas" |
| **Description** | Construction projects | Sales projects |
| **Route** | `/admin/flujo` | `/admin/sales-flujo` |
| **Weekly Totals** | Creates `weekly_projected_totals` | No separate totals table* |

*Note: Sales projections don't create a separate weekly totals table (can be added later if needed)

---

## Usage Instructions

### For Admins:

1. **Access the page:**
   - Navigate to `/admin/sales-flujo`
   - Must be logged in with admin role

2. **Upload projections:**
   - Select a sales project from the dropdown
   - Click the upload area or drag & drop an Excel file
   - File must have weekly cash flow projections format
   - Same Excel format as regular flujo uploads

3. **Review uploaded data:**
   - Summary shows total flujos, periods, and amounts
   - Individual line items displayed with totals
   - Date range is automatically detected

4. **Re-upload:**
   - Uploading a new file for the same project will replace all existing data
   - No manual deletion needed

---

## API Integration

**External API:** `https://ogc-excel-reader.vercel.app/upload/flujo`

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Excel file

**Response Structure:**
```typescript
{
  success: boolean;
  fileName: string;
  sheetName: string;
  summary: {
    totalFlujos: number;
    totalPeriods: number;
    grandTotal: number;
    startDate: string;
    endDate: string;
  };
  flujos: Array<{
    label: string;
    total: number;
    weeklyAmounts: Array<{
      week: string;
      amount: number;
      position: number;
    }>;
  }>;
}
```

---

## Next Steps (Optional Enhancements)

1. **Add navigation link** to Sidebar component for easy access
2. **Create SalesProyectoFlujoPage** to view projections (similar to ProyectoFlujoPage)
3. **Add sales_weekly_projected_totals** table for aggregated data
4. **Implement charts** to visualize sales cash flow over time
5. **Add export functionality** to download projections as Excel
6. **Add filtering** by date range or partida

---

## Testing

1. Create a sales project in `/sales-proyectos`
2. Navigate to `/admin/sales-flujo`
3. Select the sales project
4. Upload an Excel file with weekly cash flow data
5. Verify success message and summary display
6. Check Convex dashboard to confirm data insertion

---

## Error Handling

- Missing project selection: Alert displayed
- File processing error: Error message shown
- Network error: Catches and displays error
- Invalid file format: API will reject and return error
- Duplicate upload: Automatically replaces existing data

---

## Component Dependencies

**UI Components:**
- `@/components/ui/select`
- `@/components/ui/card`
- `@/components/ui/alert`

**Icons (Lucide React):**
- Upload
- FileSpreadsheet
- CheckCircle2
- XCircle
- Loader2
- BarChart3

**Convex:**
- `useQuery` - Fetch sales projects
- `useMutation` - Upload projections

---

## File Structure

```
src/
├── pages/
│   └── AdminSalesFlujo/
│       └── AdminSalesFlujoPage.tsx   ← New page
convex/
└── sales_projected_transactions.ts    ← New mutations/queries
```

---

**Implementation Complete! ✅**
