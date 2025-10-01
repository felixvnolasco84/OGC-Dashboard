# ProgramaGanttChart Component

A Gantt chart component built with `wx-react-gantt` library for visualizing project timelines and progress in the OGC Dashboard.

## Features

- **Hierarchical Data Support**: Displays partidas and familias in a tree structure
- **Timeline Visualization**: Shows project tasks across months
- **Progress Tracking**: Visual progress bars showing completion percentage
- **Budget Display**: Shows presupuesto and actual spending
- **Responsive Design**: Adapts to different screen sizes
- **Mexican Peso Formatting**: Currency values formatted for Mexican market

## Installation

The required library is already installed in your project:

```bash
npm install wx-react-gantt
```

## Usage

### Basic Example

```tsx
import ProgramaGanttChart from "@/components/Charts/ProgramaGanttChart";

function MyComponent() {
  const programaData = [
    {
      id: "partida-1",
      partida: "Cimentación",
      presupuesto: 2345020,
      expanded: false,
      level: 0,
      timeline: {
        start: 1,        // January (1-12)
        duration: 2,     // 2 months
        color: "bg-green-500",
        progress: 85,    // 85%
        actualAmount: 2200000
      },
      children: []
    }
  ];

  return <ProgramaGanttChart data={programaData} startYear={2025} />;
}
```

### Integration with ProgramaObra Page

**Option 1: Add as alternative view**

```tsx
// Add to ProgramaObra.tsx
import ProgramaGanttChart from "@/components/Charts/ProgramaGanttChart";
import { Button } from "@/components/ui/button";

export default function ProgramaObra() {
  const [viewMode, setViewMode] = useState<'gantt' | 'table'>('table');
  
  // ... your existing code ...

  return (
    <div className="bg-white px-12 py-6">
      {/* ... header and filters ... */}
      
      {/* View Toggle */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={viewMode === 'table' ? 'default' : 'outline'}
          onClick={() => setViewMode('table')}
        >
          Vista de Tabla
        </Button>
        <Button
          variant={viewMode === 'gantt' ? 'default' : 'outline'}
          onClick={() => setViewMode('gantt')}
        >
          Vista Gantt
        </Button>
      </div>

      {viewMode === 'gantt' ? (
        <ProgramaGanttChart data={filteredData} startYear={2025} />
      ) : (
        // Your existing table view
      )}
    </div>
  );
}
```

**Option 2: Replace existing Gantt implementation**

Simply replace the entire Gantt chart section with:

```tsx
<ProgramaGanttChart 
  data={programaDataState} 
  startYear={2025} 
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `ProgramaItem[]` | Required | Array of programa items with timeline data |
| `startYear` | `number` | `2025` | The year to display in the Gantt chart |

### ProgramaItem Type

```typescript
type ProgramaItem = {
  id: string;
  partida: string;
  presupuesto: number;
  expanded: boolean;
  level: number;
  timeline: {
    start: number;        // Month number (1-12)
    duration: number;     // Duration in months
    color: string;        // Tailwind color class
    progress: number;     // Progress percentage (0-100)
    actualAmount: number; // Amount spent
  } | null;
  children: ProgramaItem[];
};
```

## Columns Displayed

1. **Partida - Familia**: Task/project name with tree structure
2. **Presupuesto**: Budget amount in Mexican Peso
3. **Avance**: Progress percentage

## Customization

### Modify Columns

Edit the `columns` array in `ProgramaGanttChart.tsx`:

```tsx
const columns: GanttColumn[] = [
  { name: "text", label: "Partida - Familia", width: 280, tree: true },
  { name: "budget", label: "Presupuesto", width: 150, align: "right" },
  { name: "progress", label: "Avance", width: 100, align: "center" },
  // Add custom columns here
  { name: "spent", label: "Gastado", width: 150, align: "right" },
];
```

### Modify Timeline Scale

Edit the `scales` array:

```tsx
const scales: GanttScale[] = [
  { unit: "month", step: 1, format: "%F %Y" },  // Month view
  { unit: "week", step: 1, format: "Week %W" }  // Add week view
];
```

### Change Height

Modify the style prop on the container div:

```tsx
<div style={{ height: "800px" }}>
  {/* Gantt component */}
</div>
```

## Notes

- Timeline `start` values are month numbers (1 = January, 12 = December)
- Progress values should be between 0-100 (percentage)
- The component automatically flattens hierarchical data for display
- Items without timeline data are not displayed in the chart
- Currency formatting uses Mexican Peso (MXN) format

## Troubleshooting

### Library Type Errors

If you see TypeScript errors about `wx-react-gantt`, make sure the type declaration file exists at:
`/src/types/wx-react-gantt.d.ts`

### Chart Not Displaying

1. Check that your data has `timeline` objects
2. Verify `start` and `duration` values are valid
3. Ensure container has explicit height
4. Check browser console for errors

### Progress Not Showing

The `wx-react-gantt` library displays progress bars automatically based on the `progress` property (0-1 range). The component converts your percentage (0-100) to the correct format.

## Example Data Structure

```typescript
const exampleData = [
  {
    id: "partida-cimentacion",
    partida: "Cimentación",
    presupuesto: 2500000,
    expanded: true,
    level: 0,
    timeline: null, // Parent has no timeline
    children: [
      {
        id: "familia-excavacion",
        partida: "Excavación",
        presupuesto: 500000,
        expanded: false,
        level: 1,
        timeline: {
          start: 1,      // January
          duration: 2,   // 2 months
          color: "bg-green-500",
          progress: 75,
          actualAmount: 375000
        },
        children: []
      }
    ]
  }
];
```

## Related Files

- Component: `/src/components/Charts/ProgramaGanttChart.tsx`
- Type Definitions: `/src/types/wx-react-gantt.d.ts`
- Usage Example: `/src/components/Charts/ProgramaGanttChart.example.tsx`
- Integration: `/src/pages/Programa Obra/ProgramaObra.tsx`
