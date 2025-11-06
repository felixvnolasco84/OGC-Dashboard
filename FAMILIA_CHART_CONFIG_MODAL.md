# FamiliaChart Configuration Modal

## Overview
Each `FamiliaChart` component now has a configuration modal that allows users to customize:
- **Chart title** - Custom name for the chart
- **Chart color** - Visual color for the area chart
- **Partidas filter** - Select specific nivel 1 partidas to include
- **Familias filter** - Select specific familias to include  
- **Sub-partidas filter** - Select specific nivel 3 sub-partidas to include

## Architecture

### 1. Hook (`familia-chart-config-modal.ts`)
Manages modal state using Zustand:
```typescript
interface FamiliaChartConfig {
  chartId: string;
  title: string;
  color: string;
  partidas: string[];
  familias: string[];
  sub_partidas: string[];
}
```

**Functions:**
- `open(config, options)` - Opens modal with chart configuration and available options
- `close()` - Closes the modal
- `updateConfig(updates)` - Updates configuration (not typically used directly)
- `setAvailableOptions(options)` - Sets dropdown options

### 2. Modal Component (`FamiliaChartConfigModal.tsx`)
Interactive modal with:
- **Title input** - Text field for chart title
- **Color picker** - Native HTML color input
- **Multi-select lists** - Checkbox lists for partidas, familias, and sub-partidas
- **Selected items display** - Pills showing selected items with remove buttons
- **Summary section** - Shows count of selected filters

### 3. FamiliaChart Component Updates
- Added `chartId` prop for identification
- Added `onConfigClick` callback prop
- Settings button (⚙️) in header to open configuration modal
- Dynamic title and color from configuration

### 4. ControlPage Integration
- Chart configurations stored in component state
- Available options extracted from project partidas
- Dynamic query generation based on configuration
- Separate data fetching for each configured chart

## Usage

### Initial Setup in ControlPage

```typescript
const [chartConfigs, setChartConfigs] = useState<Record<string, FamiliaChartConfig>>({
  chart1: {
    chartId: "chart1",
    title: "Gasto Mano de Obra",
    color: "#3B82F6",
    partidas: [],
    familias: ["ALBAÑILERÍAS"],
    sub_partidas: [],
  },
  chart2: {
    chartId: "chart2",
    title: "Indirectos",
    color: "#10B981",
    partidas: [],
    familias: ["HONORARIOS"],
    sub_partidas: [],
  },
});
```

### Rendering FamiliaChart with Configuration

```typescript
<FamiliaChart
  chartId={chartConfigs.chart1.chartId}
  data={chart1Data?.dataPoints || []}
  title={chartConfigs.chart1.title}
  total={chart1Data?.total || 0}
  color={chartConfigs.chart1.color}
  onConfigClick={() => handleOpenConfig("chart1")}
/>
```

### Handling Configuration Changes

```typescript
const handleConfigSave = (config: FamiliaChartConfig) => {
  setChartConfigs(prev => ({
    ...prev,
    [config.chartId]: config,
  }));
};

const handleOpenConfig = (chartId: string) => {
  const config = chartConfigs[chartId];
  if (config) {
    openConfigModal(config, availableOptions);
  }
};
```

### Including the Modal

```typescript
<FamiliaChartConfigModal onSave={handleConfigSave} />
```

## User Workflow

1. **User clicks settings icon (⚙️)** on a FamiliaChart
2. **Modal opens** with current configuration pre-populated
3. **User customizes:**
   - Changes chart title
   - Picks a new color
   - Selects/deselects partidas
   - Selects/deselects familias  
   - Selects/deselects sub-partidas
4. **User clicks "Guardar Configuración"**
5. **Chart updates** with new filters and displays updated data
6. **Query re-fetches** data based on new filter criteria

## Features

### Multi-Selection
- Click checkbox or label to select/deselect items
- Visual feedback with checkmarks
- Selected items shown as pills below each section
- Click X on pill to remove selection

### Color Customization
- Native HTML color picker
- Real-time preview of hex value
- Applied to chart area fill

### Dynamic Options
Available options are extracted from project data:
```typescript
const availableOptions = useMemo(() => {
  if (!allPartidas) return { availablePartidas: [], availableFamilias: [], availableSubPartidas: [] };
  
  const partidasSet = new Set<string>();
  const familiasSet = new Set<string>();
  const subPartidasSet = new Set<string>();
  
  allPartidas.forEach(p => {
    if (p.nombre) partidasSet.add(p.nombre);
    if (p.partida_nombre) partidasSet.add(p.partida_nombre);
    if (p.familia) familiasSet.add(p.familia);
    if (p.sub_partida) subPartidasSet.add(p.sub_partida);
  });
  
  return {
    availablePartidas: Array.from(partidasSet).filter(Boolean).sort(),
    availableFamilias: Array.from(familiasSet).filter(Boolean).sort(),
    availableSubPartidas: Array.from(subPartidasSet).filter(Boolean).sort(),
  };
}, [allPartidas]);
```

### Query Generation
Charts automatically query with selected filters:
```typescript
const getQueryParams = (config: FamiliaChartConfig) => {
  if (!proyectoId) return "skip" as const;
  
  const params: {
    proyecto_id: Id<"desarrollos">;
    partidas?: string[];
    familias?: string[];
    sub_partidas?: string[];
  } = {
    proyecto_id: proyectoId as Id<"desarrollos">,
  };
  
  if (config.partidas.length > 0) {
    params.partidas = config.partidas;
  }
  if (config.familias.length > 0) {
    params.familias = config.familias;
  }
  if (config.sub_partidas.length > 0) {
    params.sub_partidas = config.sub_partidas;
  }
  
  return params;
};
```

## Styling

### Modal
- Max width: 3xl (768px)
- Max height: 90vh with scroll
- Sections: Title, Color, Partidas, Familias, Sub-partidas, Summary
- Each section has scrollable list (max-h-48)

### Checkboxes
- Custom styled with border and checkmark
- Different colors for each level:
  - Partidas: Blue (#3B82F6)
  - Familias: Green (#10B981)
  - Sub-partidas: Purple (#8B5CF6)

### Pills (Selected Items)
- Rounded full with X button
- Color-coded to match checkbox colors
- Wrap naturally with flex-wrap

### Settings Button
- Positioned top-right of chart header
- Hover effect with gray background
- Gear icon from lucide-react

## State Persistence

Currently, chart configurations are stored in component state and reset on page reload. To persist configurations across sessions, you could:

1. **Local Storage:**
```typescript
useEffect(() => {
  localStorage.setItem(`chartConfigs-${proyectoId}`, JSON.stringify(chartConfigs));
}, [chartConfigs, proyectoId]);

// On mount:
const savedConfigs = localStorage.getItem(`chartConfigs-${proyectoId}`);
if (savedConfigs) {
  setChartConfigs(JSON.parse(savedConfigs));
}
```

2. **Database Storage:**
```typescript
// Store in Convex database with user preferences
export const saveChartConfig = mutation({
  args: {
    userId: v.string(),
    proyectoId: v.id("desarrollos"),
    chartId: v.string(),
    config: v.object({...})
  },
  handler: async (ctx, args) => {
    // Save to user_preferences table
  }
});
```

## Adding More Charts

To add additional configurable charts:

1. **Add to chartConfigs state:**
```typescript
chart3: {
  chartId: "chart3",
  title: "Materiales",
  color: "#F59E0B",
  partidas: [],
  familias: ["CONCRETOS", "ACEROS"],
  sub_partidas: [],
}
```

2. **Add query:**
```typescript
const chart3Data = useQuery(
  api.transacciones.getFamiliaChartData,
  getQueryParams(chartConfigs.chart3)
);
```

3. **Render component:**
```typescript
<FamiliaChart
  chartId={chartConfigs.chart3.chartId}
  data={chart3Data?.dataPoints || []}
  title={chartConfigs.chart3.title}
  total={chart3Data?.total || 0}
  color={chartConfigs.chart3.color}
  onConfigClick={() => handleOpenConfig("chart3")}
/>
```

## Benefits

1. **Flexibility** - Users can create custom views without code changes
2. **Real-time** - Charts update immediately after configuration
3. **Visual** - Color customization for better data visualization
4. **Intuitive** - Simple UI with multi-select checkboxes
5. **Scalable** - Easy to add more charts with same pattern

## Technical Notes

- Modal uses Zustand for global state management
- Configuration stored in parent component (ControlPage) state
- Each chart has independent configuration
- Filters combine with AND logic (same as query behavior)
- Empty arrays mean "no filter" (include all)
- Available options dynamically generated from project data
