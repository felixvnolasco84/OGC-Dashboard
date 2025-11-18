# Sales Flujo de Caja Implementation

## Overview
Successfully ported all features from `ProyectoFlujoPage.tsx` to `SalesProyectoFlujoPage.tsx`, creating a complete cash flow projection system for sales projects.

## Features Implemented

### 1. **Statistics Dashboard**
Four key metric cards displaying:
- **Total Proyectado**: Total projected cash flow amount
- **Semanas**: Number of unique weeks with projections
- **Partidas**: Number of unique partidas (line items)
- **Promedio Semanal**: Average weekly projection

Each card includes:
- Icon indicators (DollarSign, Calendar, BarChart3, TrendingUp)
- Formatted currency displays
- Color-coded icons

### 2. **Upload Metadata Display**
Shows information about the uploaded Excel file:
- File name
- Upload date (formatted in Spanish locale)
- File icon

### 3. **Partida Filter**
- Dropdown select with "Todas las partidas" option
- Dynamically populated with unique partidas from projections
- Real-time filtering of weekly data

### 4. **Weekly Breakdown Table**
Comprehensive table showing:
- **Week column**: Excel date serial numbers converted to DD/MM/YYYY format
- **Partidas column** (when "all" selected): Visual badges for each partida
- **Total/Monto column**: Weekly totals with currency formatting
- **Footer**: Grand total and partida count

Table features:
- Alternating row colors for readability
- Responsive layout
- Conditional columns based on filter selection

### 5. **Empty States**
Two empty states:
- **No data loaded**: Shows when no projections exist
- **Loading**: Animated spinner while fetching data

### 6. **Data Processing**
- **Excel date conversion**: Converts Excel serial dates to readable format
- **Grouping**: Groups projections by week
- **Aggregation**: Sums amounts by partida and week
- **Filtering**: Real-time filter by partida
- **Statistics calculation**: Dynamic stats based on filtered data

## API Integration

Uses the following Convex queries:
```typescript
api.sales_projects.getById
api.sales_projected_transactions_queries.getBySalesProject
api.sales_projected_transactions_queries.getUploadMetadata
```

## Technical Details

### Data Structure
```typescript
// Projected transaction from DB
{
  sales_proyecto: Id<"sales_projects">,
  week_date: number,        // Excel serial date
  partida: string,          // Line item name
  amount: number,           // Projected amount
  upload_id: string,
  file_name: string,
  uploaded_at: number
}
```

### State Management
```typescript
const [selectedPartida, setSelectedPartida] = useState<string>("all");
```

### Computed Values
- `uniquePartidas`: Array of unique partida names (sorted)
- `filteredProjections`: Projections filtered by selected partida
- `stats`: Calculated statistics (total, weeks, partidas)
- `weeklyData`: Grouped and sorted weekly data

## UI Components Used

- **shadcn/ui**: Card, CardContent, CardHeader, CardTitle, CardDescription
- **shadcn/ui**: Select, SelectContent, SelectItem, SelectTrigger, SelectValue
- **lucide-react**: BarChart3, Calendar, TrendingUp, DollarSign, FileSpreadsheet

## Responsive Design

- Grid layout adapts from 1 to 4 columns on larger screens
- Table scrolls horizontally on small screens
- Select dropdown adjusts width on different screen sizes

## Formatting

### Currency
```typescript
${new Intl.NumberFormat('es-MX', { 
  maximumFractionDigits: 0 
}).format(amount)}
```

### Dates
```typescript
new Date(timestamp).toLocaleDateString('es-MX', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})
```

### Excel Dates
```typescript
const excelDateToString = (serial: number): string => {
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 24 * 60 * 60 * 1000;
  const date = new Date(excelEpoch.getTime() + serial * msPerDay);
  return `${day}/${month}/${year}`;
};
```

## Comparison: Regular vs Sales Projects

| Feature | ProyectoFlujoPage | SalesProyectoFlujoPage |
|---------|------------------|------------------------|
| Data source | `projected_transactions` | `sales_projected_transactions` |
| Project type | `desarrollos` | `sales_projects` |
| Query prefix | `projected_transactions` | `sales_projected_transactions_queries` |
| Route param | `proyectoId` | `salesProyectoId` |
| All other features | ✅ Identical | ✅ Identical |

## Usage

1. **Navigate to sales project**:
   ```
   /sales-proyectos/{salesProyectoId}/flujo
   ```

2. **Admin uploads Excel file** with projected transactions

3. **View statistics** at a glance

4. **Filter by partida** to see specific line item projections

5. **Review weekly breakdown** to understand cash flow timeline

## Future Enhancements

Potential additions:
- Export to Excel/PDF
- Chart visualizations (line chart, bar chart)
- Date range filters
- Currency conversion support
- Comparison with actual transactions
- Budget variance analysis

## Files Modified

```
src/pages/SalesProyectoFlujo/SalesProyectoFlujoPage.tsx
```

Total lines: 343 (matching the structure and functionality of ProyectoFlujoPage.tsx)

## Testing Checklist

- [ ] Page loads without errors
- [ ] Statistics display correctly
- [ ] Upload metadata shows when file is uploaded
- [ ] Partida filter works and updates table
- [ ] Weekly breakdown shows correct totals
- [ ] Excel dates convert properly
- [ ] Empty state displays when no data
- [ ] Loading state shows while fetching
- [ ] Responsive layout works on mobile/desktop
- [ ] Currency formatting is correct (MXN locale)

---

**Status**: ✅ Complete - Full feature parity with regular project flujo page
