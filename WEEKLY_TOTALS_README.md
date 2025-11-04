# Weekly Projected Totals - Documentation

## Overview

A new table `weekly_projected_totals` has been created to store aggregated weekly projection totals. This complements the existing `projected_transactions` table by providing a summary view of weekly totals.

## Database Schema

### Table: `weekly_projected_totals`

```typescript
{
  proyecto: Id<"desarrollos">,           // Reference to project
  week_date: number,                     // Excel serial date
  week_date_formatted: string,           // Human-readable date (D/M/YYYY)
  weekly_total: number,                  // Total amount for the week
  position: number,                      // Week index (0-based)
  upload_id: string,                     // Upload batch ID
  uploaded_at: number,                   // Timestamp
}
```

### Indices
- `by_proyecto` - Query all weeks for a project
- `by_proyecto_week` - Query specific week for a project
- `by_upload_id` - Query by upload batch

## Usage

### 1. Upload Weekly Totals

Navigate to `/admin` in your browser to access the Admin page.

The page includes:
- Statistics showing total weeks, weeks with data, and total projected amount
- Data preview of the first 5 weeks
- Upload button to load the 104 weeks of data
- Delete button to remove existing data

**Steps:**
1. Select a project from the sidebar
2. Click "Cargar Datos" to upload
3. The system will replace any existing weekly totals for that project

### 2. Query Weekly Totals

#### Get all weekly totals
```typescript
const weeklyTotals = useQuery(
  api.weekly_projected_totals.getByProject,
  { proyecto: projectId }
);
```

#### Get cumulative totals
```typescript
const cumulativeTotals = useQuery(
  api.weekly_projected_totals.getCumulativeTotals,
  { proyecto: projectId }
);
```

#### Get specific week
```typescript
const weekTotal = useQuery(
  api.weekly_projected_totals.getByDate,
  { proyecto: projectId, week_date: 45286 } // Excel serial date
);
```

#### Get summary statistics
```typescript
const summary = useQuery(
  api.weekly_projected_totals.getSummary,
  { proyecto: projectId }
);
// Returns: { totalWeeks, totalAmount, averageWeekly, maxWeekly, minWeekly, firstWeek, lastWeek }
```

## Data Source

The data includes 104 weeks from **6/1/2025** to **28/12/2026**:
- Total weeks: 104
- Weeks with data (non-zero): 83
- Weeks with zero: 21 (from August 2026 onwards)
- **Total projected amount: $109,763,951.26**

### Key Data Points
- Week 30/6/2025: **$688,167.33** (matches your Excel verification)
- Week 7/7/2025: **$5,662,564.61** (largest single week)
- Week 10/11/2025: **$6,811,176.12**
- Week 17/11/2025: **$7,143,511.10** (second largest week)

## Files Created

1. **convex/schema.ts** - Added `weekly_projected_totals` table
2. **convex/weekly_projected_totals.ts** - Queries and mutations
3. **src/utils/uploadWeeklyTotals.ts** - Data array and utilities
4. **src/components/UploadWeeklyTotals.tsx** - Upload UI component
5. **src/pages/Admin/AdminPage.tsx** - Admin page with upload interface
6. **src/main.tsx** - Added `/admin` route

## API Reference

### Mutations

#### `uploadWeeklyTotals`
```typescript
await uploadWeeklyTotals({
  proyecto: Id<"desarrollos">,
  weeklyData: Array<{ date: string, amount: string }>
});
```
Deletes existing data and uploads new weekly totals.

#### `deleteByProject`
```typescript
await deleteByProject({
  proyecto: Id<"desarrollos">
});
```
Deletes all weekly totals for a project.

### Queries

#### `getByProject`
Returns all weekly totals sorted by position.

#### `getCumulativeTotals`
Returns weekly totals with cumulative sums.

#### `getByDate`
Returns total for a specific week.

#### `getSummary`
Returns statistical summary of weekly totals.

## Verification

To verify the upload was successful:

1. Check the browser console for upload confirmation
2. Use the summary query to verify:
   - Total weeks: 104
   - Total amount: ~$109.7M
   - First week (6/1/2025): $54,517.68
   - Week 30/6/2025: $688,167.33

## Notes

- Amounts use European format in the source data (dots for thousands, comma for decimal)
- Conversion happens automatically during upload
- Zero amounts ($ -) are stored as 0 in the database
- All data is project-specific and can be replaced by re-uploading
