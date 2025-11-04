# Projected Transactions System

## Overview

The Projected Transactions system allows you to upload and manage weekly cash flow projections for construction projects. These projections come from Excel files containing planned spending by partida over multiple weeks.

## Features

### 1. Database Schema

**Table: `projected_transactions`**
- `proyecto`: Reference to the project (Id<"desarrollos">)
- `partida`: Partida name from Excel (e.g., "CIMENTACIÓN", "MUROS_PB")
- `week_date`: Excel serial date (days since 1/1/1900)
- `amount`: Projected amount for this week
- `position`: Week position index (0-based)
- `upload_id`: Unique ID for each upload batch
- `file_name`: Name of the uploaded Excel file
- `sheet_name`: Excel sheet name
- `uploaded_at`: Timestamp of upload

**Indices:**
- `by_proyecto`: Query all projections for a project
- `by_upload_id`: Query projections by upload batch
- `by_proyecto_partida`: Query projections for specific partida
- `by_proyecto_week`: Query projections by week

### 2. API Endpoints (Convex)

Located in `/convex/projected_transactions.ts`:

**Mutations:**
- `uploadProjections`: Upload bulk projections from Excel API response
- `deleteByProject`: Delete all projections for a project

**Queries:**
- `getByProject`: Get all projected transactions for a project
- `getGroupedByWeek`: Get weekly totals grouped by date
- `getCumulativeProjections`: Get cumulative projected spending over time
- `getByPartida`: Get projections for a specific partida
- `getUploadMetadata`: Get upload information (file name, date, etc.)

**Helper:**
- `excelDateToJSDate`: Convert Excel serial dates to JavaScript Date objects

### 3. Upload Process

#### Step 1: User Interface
From the Projects table page, users can click the "⋮" menu on any project and select "Subir Proyecciones".

#### Step 2: Excel File Processing
The Excel file is sent to the external API endpoint:
```
POST https://ogc-excel-reader.vercel.app/upload/projections
```

#### Step 3: API Response Format
The API returns a structured JSON with:
```typescript
{
  success: boolean,
  fileName: string,
  sheetName: string,
  summary: {
    totalPartidas: number,
    totalWeeks: number,
    grandTotal: number,
    startDate: number,  // Excel serial date
    endDate: number     // Excel serial date
  },
  projections: [
    {
      partida: string,
      total: number,
      weeklyProjections: [
        {
          week: number,      // Excel serial date
          amount: number,
          position: number   // Week index
        }
      ]
    }
  ]
}
```

#### Step 4: Database Storage
- **Replaces existing projections**: All existing projections for the project are deleted before inserting new ones
- **Bulk insert**: All weekly projections are inserted in a single transaction
- **Unique upload ID**: Each upload batch gets a unique identifier for tracking

### 4. User Interface Components

**Upload Modal** (`/src/components/modals/upload-projections-modal.tsx`):
- Drag-and-drop file upload
- Project name display
- File validation (.xlsx, .xls, max 10MB)
- Upload progress indicator
- Summary display after processing:
  - Total partidas
  - Total weeks
  - Grand total projected amount
  - Date range (start - end)

**Hook** (`/src/hooks/upload-projections-modal.ts`):
- State management for modal open/close
- Stores selected project ID

### 5. Integration with Charts

**✅ IMPLEMENTED: ProgressChart Integration**

The `ProgressChart` component now automatically displays projected spending data alongside actual spending when a `proyectoId` is provided.

**Features:**
- **Automatic Data Loading**: Chart queries projected data from the database
- **Date Synchronization**: Converts Excel serial dates to match actual transaction dates
- **Visual Comparison**: Shows projected spending (light blue) vs actual spending (dark blue)
- **User Feedback**: Displays info message when no projections are uploaded

**Updated ProgressChart Component** (`/src/components/Charts/ProgressChart.tsx`):
```typescript
<ProgressChart 
  data={progressChartData || []} 
  proyectoId={selectedDesarrollo?._id}  // Enables projected data
/>
```

**What the Chart Shows:**
- **Gasto Proyectado (Excel)**: Cumulative projected spending from uploaded Excel file (light blue area)
- **Gasto Real**: Actual cumulative spending from transactions (dark blue area)
- **Avance %**: Real progress percentage (dashed line)

**Data Flow:**
1. User uploads Excel with projections via "Subir Proyecciones"
2. Data stored in `projected_transactions` table
3. Chart queries `getCumulativeProjections` when `proyectoId` is provided
4. Projected data merged with actual data by date
5. Both series displayed together for comparison

**Legend Updates** (HomePage):
- "Gasto Programado" renamed to "Gasto Proyectado (Excel)" for clarity
- "Gasto Total" renamed to "Gasto Real"
- "Avance Real" renamed to "Avance %"

### 6. Excel Date Conversion

Excel stores dates as serial numbers (days since 1/1/1900). The system includes utilities to convert these:

```typescript
// Convert Excel serial to JS Date
const excelDateToJSDate = (serial: number): Date => {
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + serial * msPerDay);
};

// Format for display (DD/MM/YYYY)
const formatted = excelSerialToDate(45663); // "01/01/2025"
```

## Usage Example

### 1. Upload Projections
1. Navigate to Proyectos page
2. Click "⋮" menu on a project
3. Select "Subir Proyecciones"
4. Drag and drop Excel file or click "Explorar Archivos"
5. Review summary
6. Click "Subir Proyecciones"

### 2. View Projections Data
```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function ProjectionsSummary({ projectId }) {
  const metadata = useQuery(api.projected_transactions.getUploadMetadata, {
    proyecto: projectId
  });
  
  const cumulative = useQuery(api.projected_transactions.getCumulativeProjections, {
    proyecto: projectId
  });
  
  return (
    <div>
      {metadata && (
        <p>Uploaded: {metadata.file_name} on {new Date(metadata.uploaded_at).toLocaleDateString()}</p>
      )}
      {cumulative && (
        <p>Total Projected: ${cumulative[cumulative.length - 1].cumulative_amount}</p>
      )}
    </div>
  );
}
```

### 3. Compare with Actual Spending
```typescript
// Get both projected and actual data
const projections = useQuery(api.projected_transactions.getCumulativeProjections, {
  proyecto: projectId
});

const actuals = useQuery(api.transacciones.getProgressChartData, {
  proyecto: projectId
});

// Merge for comparison chart
const chartData = projections?.map(proj => ({
  date: excelDateToJSDate(proj.week_date),
  projected: proj.cumulative_amount,
  actual: actuals?.find(a => a.date === proj.week_date)?.gastoTotal || 0
}));
```

## Data Flow

```
Excel File
    ↓
Upload Modal
    ↓
External API (ogc-excel-reader.vercel.app)
    ↓
Parsed JSON Response
    ↓
Convex Mutation (uploadProjections)
    ↓
Database (projected_transactions table)
    ↓
Queries (getCumulativeProjections, etc.)
    ↓
Charts & UI Components
```

## Benefits

1. **Financial Planning**: Track projected vs actual spending
2. **Cash Flow Management**: Visualize weekly spending requirements
3. **Progress Tracking**: Compare planned vs actual progress
4. **Historical Analysis**: Keep track of projection accuracy over time
5. **Budget Control**: Identify spending variances early

## Future Enhancements

- **Projection Adjustments**: Allow manual adjustments to projections
- **Multiple Scenarios**: Support different projection scenarios (optimistic, realistic, pessimistic)
- **Automatic Alerts**: Notify when actual spending deviates significantly from projections
- **Variance Reports**: Generate reports showing projection vs actual variances
- **Historical Projections**: Keep multiple projection versions for comparison
