# Chart Configuration System

Persistent, user-specific chart configurations for the OGC Dashboard.

## Overview

This system allows authenticated users to save personalized configurations for charts (like `FamiliaChart`) including:
- Chart title
- Color scheme
- Height
- Data filters (partidas, familias, sub-partidas)

Each user's configuration is saved independently per project, enabling a personalized dashboard experience.

## Architecture

### 1. Database Schema (`convex/schema.ts`)

```typescript
chart_configurations: defineTable({
  user_id: v.id("users"),
  proyecto_id: v.id("desarrollos"),
  chart_id: v.string(),
  title: v.string(),
  color: v.string(),
  height: v.optional(v.number()),
  partidas: v.optional(v.array(v.string())),
  familias: v.optional(v.array(v.string())),
  sub_partidas: v.optional(v.array(v.string())),
  created_at: v.number(),
  updated_at: v.number(),
})
```

**Indices:**
- `by_user`: Find all configs for a user
- `by_proyecto`: Find all configs for a project
- `by_user_proyecto`: Find user's configs for specific project
- `by_user_proyecto_chart`: Find specific chart config

### 2. Convex Functions (`convex/chart_configurations.ts`)

**Queries:**
- `getUserChartConfigs(proyecto_id)` - Get all user's chart configs for a project
- `getChartConfig(proyecto_id, chart_id)` - Get specific chart config

**Mutations:**
- `saveChartConfig(...)` - Create or update a chart configuration
- `deleteChartConfig(config_id)` - Delete a configuration
- `resetChartConfig(proyecto_id, chart_id)` - Reset to defaults
- `saveMultipleChartConfigs(...)` - Bulk save multiple configs

### 3. React Hook (`src/hooks/useChartConfig.ts`)

```typescript
const { config, saveConfig, resetConfig, isLoading, hasSavedConfig } = useChartConfig({
  proyectoId: "abc123",
  chartId: "familia-chart-1",
  defaultConfig: {
    title: "Albañilerías",
    color: "#3B82F6",
    height: 300,
    familias: ["ALBAÑILERÍAS"]
  }
});
```

**Returns:**
- `config` - Current configuration (saved or default)
- `saveConfig(newConfig)` - Save updated configuration
- `resetConfig()` - Reset to default values
- `isLoading` - Whether config is being fetched
- `hasSavedConfig` - Whether user has saved a config

### 4. Configuration Modal (`src/components/Charts/ChartConfigModal.tsx`)

Interactive modal allowing users to:
- Edit chart title
- Choose color (color picker + hex input)
- Adjust height
- Select partidas filters (multi-select)
- Select familias filters (multi-select)
- Select sub-partidas filters (multi-select)

## Usage

### Basic Integration

```tsx
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import FamiliaChart from "@/components/Charts/FamiliaChart";
import ChartConfigModal from "@/components/Charts/ChartConfigModal";
import { useChartConfig } from "@/hooks/useChartConfig";

function MyDashboard({ proyectoId }) {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Load saved configuration
  const { config, saveConfig, resetConfig } = useChartConfig({
    proyectoId,
    chartId: "familia-chart-1",
    defaultConfig: {
      title: "Familia Chart",
      color: "#3B82F6",
      height: 300,
      familias: ["ALBAÑILERÍAS"]
    }
  });

  // Fetch data with config filters
  const chartData = useQuery(api.transacciones.getFamiliaChartData, {
    proyecto_id: proyectoId,
    familias: config.familias,
    partidas: config.partidas,
    sub_partidas: config.sub_partidas,
  });

  return (
    <>
      <FamiliaChart
        chartId="familia-chart-1"
        data={chartData?.dataPoints || []}
        title={config.title}
        total={chartData?.total || 0}
        color={config.color}
        height={config.height}
        onConfigClick={() => setIsConfigModalOpen(true)}
      />

      <ChartConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        proyectoId={proyectoId}
        chartId="familia-chart-1"
        currentConfig={config}
        onSave={saveConfig}
        onReset={resetConfig}
      />
    </>
  );
}
```

### Multiple Charts

```tsx
function Dashboard({ proyectoId }) {
  // Each chart has its own unique chartId
  const chart1 = useChartConfig({
    proyectoId,
    chartId: "chart-concretos",
    defaultConfig: { title: "Concretos", color: "#3B82F6", familias: ["CONCRETOS"] }
  });

  const chart2 = useChartConfig({
    proyectoId,
    chartId: "chart-aceros",
    defaultConfig: { title: "Aceros", color: "#EF4444", familias: ["ACEROS"] }
  });

  return (
    <div className="grid grid-cols-2 gap-6">
      <FamiliaChart {...chart1.config} chartId="chart-concretos" />
      <FamiliaChart {...chart2.config} chartId="chart-aceros" />
    </div>
  );
}
```

### Bulk Configuration Updates

For dashboard layouts where multiple charts need to be saved together:

```tsx
import { useMultipleChartConfigs } from "@/hooks/useChartConfig";

function DashboardSettings({ proyectoId }) {
  const { saveConfigs } = useMultipleChartConfigs(proyectoId);

  const handleSaveAll = async () => {
    await saveConfigs([
      {
        chart_id: "chart-1",
        title: "Title 1",
        color: "#3B82F6",
        height: 300,
        familias: ["CONCRETOS"]
      },
      {
        chart_id: "chart-2",
        title: "Title 2",
        color: "#EF4444",
        height: 400,
        partidas: ["CIMENTACIÓN"]
      }
    ]);
  };

  return <button onClick={handleSaveAll}>Save All Charts</button>;
}
```

## Key Features

### 1. User-Specific
Each user's configurations are isolated. User A's settings don't affect User B's view.

### 2. Project-Specific
Configurations are scoped to projects. The same chart can have different configs across projects.

### 3. Persistent
Configurations survive page refreshes and browser sessions.

### 4. Fallback to Defaults
If no saved configuration exists, the system uses the provided default values.

### 5. Reset Capability
Users can reset their configurations to default values at any time.

## Security

- All mutations verify user authentication via Clerk
- Users can only read/write their own configurations
- Project access is validated through existing user permissions

## Best Practices

### 1. Unique Chart IDs
Use descriptive, unique chart IDs:
```typescript
// Good
chartId: "control-page-familia-chart-concretos"
chartId: "dashboard-overview-chart-1"

// Avoid
chartId: "chart1"
chartId: "familia"
```

### 2. Sensible Defaults
Provide meaningful default configurations:
```typescript
defaultConfig: {
  title: "Albañilerías",  // Descriptive
  color: "#10B981",        // Brand color
  height: 300,             // Standard height
  familias: ["ALBAÑILERÍAS"] // Pre-filtered to relevant data
}
```

### 3. Loading States
Always handle loading states:
```typescript
if (isLoading) {
  return <ChartSkeleton />;
}
```

### 4. Error Handling
Handle save/reset errors gracefully:
```typescript
const result = await saveConfig(newConfig);
if (!result.success) {
  toast.error("Failed to save configuration");
}
```

## Example Components

See:
- `src/components/Charts/FamiliaChartWithConfig.example.tsx` - Complete working example
- `src/components/Charts/ChartConfigModal.tsx` - Configuration UI

## Testing

To test the system:

1. **Create a chart with default config:**
   ```tsx
   <FamiliaChart chartId="test-chart" defaultTitle="Test" />
   ```

2. **Click the settings icon** in the chart header

3. **Modify settings:**
   - Change title
   - Pick a new color
   - Select filters

4. **Click "Save"**

5. **Refresh the page** - settings should persist

6. **Click "Reset"** - should restore defaults

7. **Switch users** - each user should see their own config

## Troubleshooting

### Config not saving
- Check browser console for authentication errors
- Verify user is authenticated via Clerk
- Ensure `proyectoId` is valid

### Config not loading
- Check that `chartId` matches exactly
- Verify query is not in "skip" state
- Check Convex dashboard for stored configs

### Filters not working
- Ensure the chart's data query uses the config filters
- Verify filter values match database field values exactly
- Check that partidas/familias exist in the project

## Future Enhancements

Potential improvements:
- Import/export configurations
- Share configurations between users
- Configuration templates
- Layout presets (dashboard arrangements)
- Versioning/history of configurations
