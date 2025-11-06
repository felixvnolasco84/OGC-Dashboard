# FamiliaChart Filtering Feature

## Overview
The `FamiliaChart` component now supports granular filtering by **partidas**, **familias**, and **sub-partidas**. This allows you to create custom charts showing spending over time for specific combinations of budget items.

## How It Works

### 1. Backend Query (`getFamiliaChartData`)
Located in: `convex/transacciones.ts`

The query accepts multiple optional filter parameters:

```typescript
{
  proyecto_id: Id<"desarrollos">,
  familia?: string,           // Single familia (backward compatible)
  partidas?: string[],        // Array of partida names (nivel 1)
  familias?: string[],        // Array of familia names
  sub_partidas?: string[]     // Array of sub-partida names
}
```

### 2. Frontend Component (`FamiliaChart`)
Located in: `src/components/Charts/FamiliaChart.tsx`

The component displays the filtered data as a cumulative area chart.

## Usage Examples

### Example 1: Single Familia (Backward Compatible)
```tsx
const manoDeObraData = useQuery(
  api.transacciones.getFamiliaChartData,
  { 
    proyecto_id: proyectoId,
    familia: "ALBAÑILERÍAS" 
  }
);

<FamiliaChart
  data={manoDeObraData?.dataPoints || []}
  title="Gasto Mano de Obra"
  total={manoDeObraData?.total || 0}
  color="#3B82F6"
/>
```

### Example 2: Multiple Familias
```tsx
const materialesData = useQuery(
  api.transacciones.getFamiliaChartData,
  { 
    proyecto_id: proyectoId,
    familias: ["CONCRETOS", "ACEROS", "BLOCK Y TABIQUE"]
  }
);

<FamiliaChart
  data={materialesData?.dataPoints || []}
  title="Gasto en Materiales"
  total={materialesData?.total || 0}
  color="#10B981"
/>
```

### Example 3: Specific Partidas
Filter by nivel 1 partidas (e.g., "CIMENTACIÓN", "ESTRUCTURA"):

```tsx
const estructuraData = useQuery(
  api.transacciones.getFamiliaChartData,
  { 
    proyecto_id: proyectoId,
    partidas: ["CIMENTACIÓN", "ESTRUCTURA"]
  }
);

<FamiliaChart
  data={estructuraData?.dataPoints || []}
  title="Gasto en Estructura"
  total={estructuraData?.total || 0}
  color="#F59E0B"
/>
```

### Example 4: Combined Filters
Combine partida and familia filters:

```tsx
const customData = useQuery(
  api.transacciones.getFamiliaChartData,
  { 
    proyecto_id: proyectoId,
    partidas: ["ESTRUCTURA"],
    familias: ["CONCRETOS", "ACEROS"]
  }
);

<FamiliaChart
  data={customData?.dataPoints || []}
  title="Concretos y Aceros - Estructura"
  total={customData?.total || 0}
  color="#8B5CF6"
/>
```

### Example 5: Specific Sub-Partidas
Filter by specific nivel 3 items:

```tsx
const concretoData = useQuery(
  api.transacciones.getFamiliaChartData,
  { 
    proyecto_id: proyectoId,
    sub_partidas: ["Concreto f'c=250", "Concreto f'c=300"]
  }
);

<FamiliaChart
  data={concretoData?.dataPoints || []}
  title="Concreto Específico"
  total={concretoData?.total || 0}
  color="#EF4444"
/>
```

## Filter Logic

The filters work with **AND** logic:
- If you specify `partidas: ["CIMENTACIÓN"]`, it includes all items from that partida
- If you add `familias: ["CONCRETOS"]`, it narrows down to only concrete items within CIMENTACIÓN
- If you add `sub_partidas: ["Concreto f'c=250"]`, it further narrows to that specific sub-partida

**Example:**
```typescript
{
  proyecto_id: proyectoId,
  partidas: ["ESTRUCTURA", "ACABADOS"],
  familias: ["CONCRETOS", "ACEROS"]
}
```
This returns: All CONCRETOS and ACEROS items that belong to either ESTRUCTURA or ACABADOS partidas.

## Data Structure

### Input (from query):
```typescript
{
  dataPoints: [
    { date: "01 Sep", monto: 50000 },
    { date: "05 Sep", monto: 150000 },
    // ... cumulative amounts over time
  ],
  total: 450000 // Total cumulative amount
}
```

### Chart Display:
- X-axis: Date (formatted as "DD Mon")
- Y-axis: Cumulative amount (formatted as currency)
- Area fill: Specified color
- Tooltip: Shows exact amount on hover

## Integration in ControlPage

In `src/pages/Control/ControlPage.tsx`, you can see examples of both basic and advanced usage:

```tsx
// Basic: Single familia filter
const manoDeObraData = useQuery(
  api.transacciones.getFamiliaChartData,
  proyectoId ? { 
    proyecto_id: proyectoId as Id<"desarrollos">, 
    familia: "ALBAÑILERÍAS"
  } : "skip"
);

// Advanced: Custom combination (commented out example)
// const customData = useQuery(
//   api.transacciones.getFamiliaChartData,
//   proyectoId ? { 
//     proyecto_id: proyectoId as Id<"desarrollos">,
//     partidas: ["CIMENTACIÓN", "ESTRUCTURA"],
//     familias: ["CONCRETOS", "ACEROS"]
//   } : "skip"
// );
```

## Technical Details

### Database Hierarchy
```
Partida (nivel 1) → nombre
  └── Familia (nivel 2) → familia
        └── Sub-partida (nivel 3) → sub_partida
```

### Filter Matching
- **partidas**: Matches `nombre` or `partida_nombre` fields
- **familias**: Matches `familia` field
- **sub_partidas**: Matches `sub_partida` field

### Performance
The query:
1. Fetches all partidas for the project
2. Applies filters in memory (efficient for typical project sizes)
3. Collects all pagos for matched partidas
4. Sorts by transaction date
5. Calculates cumulative amounts

## Tips

1. **Backward Compatibility**: Existing code using `familia: "STRING"` continues to work
2. **Empty Filters**: If no filters match, returns `{ dataPoints: [], total: 0 }`
3. **Multiple Charts**: Create multiple FamiliaChart instances with different filters for comparison
4. **Dynamic Filtering**: Filters can be controlled by UI dropdowns/selects for interactive dashboards

## Future Enhancements

Potential improvements:
- Add nivel filtering (e.g., only nivel 3 items)
- Support regex patterns for name matching
- Add date range filtering
- Support OR logic between filter groups
- Add transaction status filtering
