# Control Sale Page Implementation Status

## Overview
Attempted to fully implement all features from `ControlPage.tsx` in `ControlSalePage.tsx` for sales projects. Discovered that several backend queries and components need to be adapted to support `Id<"sales_projects">` instead of `Id<"desarrollos">`.

## What Was Implemented ✅

### 1. Page Structure
- ✅ Header with project name
- ✅ Main metrics cards (Presupuesto aprobado, Gasto total, Por gastar)
- ✅ Filter section (Proyecto, Rango de fecha, Periodo)
- ✅ Secondary metrics display (Gasto, Por ejercer)
- ✅ Progress Chart section
- ✅ Layout and styling matching ControlPage

### 2. State Management
- ✅ `selectedPeriodo` state
- ✅ `selectedRangoFecha` state
- ✅ `activeChartId` state for modal management

### 3. Data Fetching (Partial)
- ✅ Project data: `api.sales_projects.getById`
- ✅ Budget metrics: `api.sales_meticas_presupuesto.getByProyecto`
- ⚠️ Filtered metrics: Currently uses `api.sales_meticas_presupuesto.getFilteredMetrics` but field mismatch

## What Needs Backend Support ❌

### 1. Missing Backend Queries

**`api.sales_transacciones.getProgressChartData`**
- **Status**: Does NOT exist
- **Purpose**: Fetch progress data for ProgressChart
- **Current workaround**: Query returns undefined, chart shows no data
- **Needs**: Backend query that returns progress data for sales projects

**`api.sales_transacciones.getFamiliaChartData`**
- **Status**: Does NOT exist
- **Purpose**: Fetch familia/partida chart data for FamiliaChart components
- **Current workaround**: Queries return undefined, charts show no data
- **Needs**: Backend query that returns aggregated familia data for sales projects

**`api.sales_meticas_presupuesto.getFilteredMetrics`**
- **Status**: May exist but has different fields
- **Issue**: Regular version has `honorarios` field, sales version doesn't
- **Current**: Uses `gasto`, `por_ejercer`, but `honorarios` defaults to 0
- **Needs**: Verify if sales metrics should have `honorarios` or use different field (e.g., `comision`)

### 2. Component Compatibility Issues

**`useChartConfig` Hook**
- **Issue**: Expects `Id<"desarrollos">`, not `Id<"sales_projects">`
- **Status**: TypeScript error, will save configs with wrong project type
- **Needs**: Either:
  - Make hook generic to support multiple table types
  - Create separate `useSalesChartConfig` hook
  - Update backend schema to support both project types

**`ProgressChart` Component**
- **Issue**: `proyectoId` prop expects `Id<"desarrollos">`
- **Status**: TypeScript error
- **Needs**: Update component prop type to accept `Id<"desarrollos"> | Id<"sales_projects">`

**`DashboardTable` Component**
- **Issue**: `proyectoId` prop expects `Id<"desarrollos">`
- **Status**: TypeScript error
- **Needs**: Either:
  - Update component to support both types
  - Create separate `SalesDashboardTable` component
  - Make component generic

**`ChartConfigModal` Component**
- **Issue**: `proyectoId` prop expects `Id<"desarrollos">`
- **Status**: TypeScript error
- **Needs**: Update component to support both project types

### 3. Missing Fields in Sales Metrics

**`honorarios` Field**
- **Regular projects**: Has `honorarios` (fees/payments to professionals)
- **Sales projects**: Doesn't have `honorarios`, has `comision` instead
- **Current**: Defaults to 0 in secondary metrics display
- **Needs**: Decide if sales should show:
  - `comision` (commission from sales)
  - Different metric entirely
  - Remove the third metric for sales

## Recommended Implementation Path

### Option A: Backend-First Approach (Recommended)

**Step 1: Create Sales-Specific Queries**
```typescript
// convex/sales_transacciones.ts

export const getProgressChartData = query({
  args: { proyecto_id: v.id("sales_projects") },
  handler: async (ctx, args) => {
    // Aggregate sales_transacciones by date
    // Return format matching ProgressChart expectations
  }
});

export const getFamiliaChartData = query({
  args: {
    proyecto_id: v.id("sales_projects"),
    partidas: v.optional(v.array(v.string())),
    familias: v.optional(v.array(v.string())),
    sub_partidas: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Aggregate sales_transacciones/sales_pagos by familia
    // Return format matching FamiliaChart expectations
  }
});
```

**Step 2: Update `sales_meticas_presupuesto`**
```typescript
// Clarify if sales should have honorarios or use comision
export const getFilteredMetrics = query({
  // ...
  handler: async (ctx, args) => {
    return {
      gasto: ...,
      por_ejercer: ...,
      comision: ..., // or honorarios: ...
      presupuesto_aprobado: ...,
    };
  }
});
```

**Step 3: Make Components Generic**
```typescript
// Update component prop types
interface ProgressChartProps {
  proyectoId: Id<"desarrollos"> | Id<"sales_projects">;
  // ...
}

// Or create type union
type ProjectId = Id<"desarrollos"> | Id<"sales_projects">;
```

**Step 4: Update useChartConfig Hook**
```typescript
// Make generic or create sales version
export function useChartConfig<T extends "desarrollos" | "sales_projects">(params: {
  proyectoId: Id<T>;
  chartId: string;
  defaultConfig: ChartConfig;
}) {
  // Implementation
}
```

### Option B: Frontend-Only Approach (Not Recommended)

Keep features commented out until backend is ready:
- Comment out FamiliaCharts
- Comment out chart configuration
- Keep only basic metrics and ProgressChart
- Note in UI: "Análisis avanzado próximamente"

## Current File Status

### ControlSalePage.tsx
- **Lines of Code**: 412
- **Commented Sections**: None (all uncommented for implementation)
- **TypeScript Errors**: 9 errors related to type mismatches
- **Runtime Status**: Will load but charts will show no data

### Files That Need Updates

**Backend:**
1. `convex/sales_transacciones.ts` - Add missing queries
2. `convex/sales_meticas_presupuesto.ts` - Verify/update fields

**Frontend:**
3. `src/hooks/useChartConfig.ts` - Make generic or create sales version
4. `src/components/Charts/ProgressChart.tsx` - Update prop types
5. `src/components/Charts/FamiliaChart.tsx` - Verify compatibility
6. `src/pages/Dashboard/DashboardTable.tsx` - Update prop types or create sales version
7. `src/components/Charts/ChartConfigModal.tsx` - Update prop types

## Testing Checklist (Once Backend is Ready)

- [ ] Page loads without TypeScript errors
- [ ] Main metrics display correctly
- [ ] Filters work (Rango de fecha, Periodo)
- [ ] Secondary metrics show correct values
- [ ] ProgressChart displays sales transaction data
- [ ] FamiliaChart 1 shows correct categorized data
- [ ] FamiliaChart 2 shows correct payment data
- [ ] Chart configuration modal opens
- [ ] Chart settings persist across page reloads
- [ ] DashboardTable shows sales partidas
- [ ] All data queries use correct sales_projects ID

## Comparison: Regular vs Sales Control Page

| Feature | ControlPage (Regular) | ControlSalePage (Sales) | Status |
|---------|----------------------|------------------------|--------|
| **Main Metrics** | Presupuesto, Gasto, Por gastar | Same | ✅ Working |
| **Filters** | Proyecto, Rango, Periodo | Same | ✅ Working |
| **Secondary Metrics** | Gasto, Por ejercer, Honorarios | Gasto, Por ejercer, ?? | ⚠️ Field mismatch |
| **Progress Chart** | Gasto proyectado vs real | Same intent | ❌ No backend query |
| **Familia Chart 1** | Configurable categories | Configurable categories | ❌ No backend query |
| **Familia Chart 2** | Configurable categories | Configurable categories | ❌ No backend query |
| **Dashboard Table** | All partidas | All sales_partidas | ❌ Type incompatibility |
| **Chart Config Modal** | Persistent settings | Persistent settings | ❌ Type incompatibility |
| **Data Source** | `transacciones`, `pagos` | `sales_transacciones`, `sales_pagos` | ⚠️ Partial |

## Next Steps (Priority Order)

### High Priority
1. **Create `getProgressChartData` for sales** - Most visible feature
2. **Fix metrics field mismatch** - Shows wrong/missing data
3. **Update component prop types** - Eliminate TypeScript errors

### Medium Priority
4. **Create `getFamiliaChartData` for sales** - Important analytics
5. **Make `useChartConfig` generic** - Enable persistence

### Low Priority
6. **Update/create DashboardTable for sales** - Duplicate of presupuesto page
7. **Add chart customization** - Nice to have

## Estimated Effort

**Backend Queries**: 4-6 hours
- `getProgressChartData`: 2-3 hours (aggregate by date/period)
- `getFamiliaChartData`: 2-3 hours (aggregate by familia/partida)

**Component Updates**: 2-3 hours
- Update prop types across 4-5 components
- Test compatibility

**Hook Updates**: 1-2 hours
- Make useChartConfig generic or create sales version

**Total**: ~8-11 hours for full implementation

---

**Current Status**: 🟡 Partially Complete
- ✅ UI Structure: 100%
- ⚠️ Data Integration: 40%
- ❌ Feature Parity: 50%

**Blockers**: Backend queries missing, type incompatibilities
**Recommendation**: Implement backend queries first, then fix frontend types
