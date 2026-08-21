"use client";

import { useMemo } from 'react';
import { Doc } from 'convex/_generated/dataModel';

interface GanttData {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  amount: number;
  category: string;
  color: string;
  items: Doc<"partidas">[];
}

interface GanttChartProps {
  data: Doc<"partidas">[];
}

interface GroupedData {
  partida: string;
  sub_partida: string;
  familia: string;
  items: (Doc<"partidas"> & { parsedDate: Date; numericAmount: number })[];
  totalAmount: number;
}

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#F97316', '#06B6D4', '#84CC16', '#EC4899', '#6366F1'
];

const CATEGORY_COLORS: { [key: string]: string } = {
  'MANO_OBRA': '#3B82F6',
  'HERRAMIENTA_MENOR': '#EF4444',
  'CIMBRA': '#10B981',
  'ACERO': '#F59E0B',
  'CEMENTANTES': '#8B5CF6',
  'AGREGADOS': '#F97316',
  'CONCRETOS': '#06B6D4',
  'SUBCONTRATOS': '#84CC16',
  'EXCAVACIÓN': '#EC4899',
  'CONSUMIBLES': '#6366F1'
};

export default function GanttChart({ data }: GanttChartProps) {
  const { ganttData, timeRange, maxAmount } = useMemo(() => {
    if (!data || data.length === 0) return { ganttData: [], timeRange: { start: new Date(), end: new Date() }, maxAmount: 0 };

    // Parse dates and convert amounts
    const processedData = data.map(item => ({
      ...item,
      parsedDate: new Date(item._creationTime),
      numericAmount: item.precio_unitario
    })).filter(item => !isNaN(item.parsedDate.getTime()) && !isNaN(item.numericAmount));

    // Group by partida and sub_partida
    const grouped = processedData.reduce((acc, item) => {
      const key = `${item.nombre}-${item.sub_partida}`;
      if (!acc[key]) {
        acc[key] = {
          partida: item.nombre,
          sub_partida: item.sub_partida,
          familia: item.familia,
          items: [],
          totalAmount: 0
        };
      }
      acc[key].items.push(item);
      acc[key].totalAmount += item.numericAmount;
      return acc;
    }, {} as Record<string, GroupedData>);

    // Create Gantt data
    const ganttItems: GanttData[] = Object.entries(grouped).map(([key, group]) => {
      const dates = group.items.map(item => item.parsedDate.getTime());
      const startDate = new Date(Math.min(...dates));
      const endDate = new Date(Math.max(...dates));

      return {
        id: key,
        name: group.sub_partida,
        startDate,
        endDate,
        amount: group.totalAmount,
        category: group.familia,
        color: CATEGORY_COLORS[group.familia] || COLORS[Object.keys(grouped).indexOf(key) % COLORS.length],
        items: group.items
      };
    });

    // Sort by start date
    ganttItems.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    // Calculate time range
    const allDates = processedData.map(item => item.parsedDate.getTime());
    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));

    // Add padding to the range
    const startPadding = new Date(minDate);
    startPadding.setDate(startPadding.getDate() - 7);
    const endPadding = new Date(maxDate);
    endPadding.setDate(endPadding.getDate() + 7);

    const maxAmount = Math.max(...ganttItems.map(item => item.amount));

    return {
      ganttData: ganttItems,
      timeRange: { start: startPadding, end: endPadding },
      maxAmount
    };
  }, [data]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getBarWidth = (startDate: Date, endDate: Date) => {
    const totalDuration = timeRange.end.getTime() - timeRange.start.getTime();
    const itemDuration = endDate.getTime() - startDate.getTime();
    const minWidth = 2; // Minimum width for single-day items
    return Math.max(minWidth, (itemDuration / totalDuration) * 100);
  };

  const getBarLeft = (startDate: Date) => {
    const totalDuration = timeRange.end.getTime() - timeRange.start.getTime();
    const offsetFromStart = startDate.getTime() - timeRange.start.getTime();
    return (offsetFromStart / totalDuration) * 100;
  };

  const getBarHeight = (amount: number) => {
    const minHeight = 20;
    const maxHeight = 40;
    const ratio = amount / maxAmount;
    return minHeight + (ratio * (maxHeight - minHeight));
  };

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const markers = [];
    const current = new Date(timeRange.start);
    current.setDate(1); // Start from first day of month

    while (current <= timeRange.end) {
      const position = getBarLeft(current);
      markers.push({
        date: new Date(current),
        position
      });
      current.setMonth(current.getMonth() + 1);
    }
    return markers;
  }, [timeRange]);

  if (ganttData.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-background rounded-lg">
        <p className="text-subtle-foreground">No hay datos disponibles para mostrar</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-card rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-foreground">Diagrama de Gantt - Costos por Tiempo</h3>
        <p className="text-sm text-muted-foreground">
          Visualización temporal de costos por categoría y subcategoría
        </p>
      </div>

      <div className="p-4">
        {/* Legend */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-foreground mb-2">Categorías:</h4>
          <div className="flex flex-wrap gap-3">
            {Object.entries(CATEGORY_COLORS).map(([category, color]) => (
              <div key={category} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-muted-foreground">{category.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart Container */}
        <div className="relative">
          {/* Time axis */}
          <div className="relative h-8 mb-4 border-b border-border">
            {timeMarkers.map((marker, index) => (
              <div
                key={index}
                className="absolute top-0 h-full border-l border-border-strong"
                style={{ left: `${marker.position}%` }}
              >
                <span className="absolute top-full mt-1 text-xs text-subtle-foreground transform -translate-x-1/2">
                  {formatDate(marker.date)}
                </span>
              </div>
            ))}
          </div>

          {/* Gantt bars */}
          <div className="space-y-3">
            {ganttData.map((item) => (
              <div key={item.id} className="relative">
                {/* Task label */}
                <div className="flex items-center mb-1">
                  <div className="w-64 pr-4 text-sm font-medium text-foreground truncate">
                    {item.name}
                  </div>
                  <div className="text-xs text-subtle-foreground">
                    {formatCurrency(item.amount)}
                  </div>
                </div>

                {/* Timeline container */}
                <div className="relative h-10 bg-background rounded">
                  {/* Gantt bar */}
                  <div
                    className="absolute top-1/2 transform -translate-y-1/2 rounded shadow-sm cursor-pointer transition-all hover:shadow-md group"
                    style={{
                      left: `${getBarLeft(item.startDate)}%`,
                      width: `${getBarWidth(item.startDate, item.endDate)}%`,
                      height: `${getBarHeight(item.amount)}px`,
                      backgroundColor: item.color,
                      opacity: 0.8
                    }}
                    title={`${item.name}: ${formatDate(item.startDate)} - ${formatDate(item.endDate)}`}
                  >
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-inverse text-on-color text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      <div>{item.name}</div>
                      <div>{formatDate(item.startDate)} - {formatDate(item.endDate)}</div>
                      <div>{formatCurrency(item.amount)}</div>
                      <div className="text-disabled-foreground">{item.items.length} transacciones</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-foreground">Total de actividades: </span>
              <span className="text-foreground">{ganttData.length}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">Período: </span>
              <span className="text-foreground">
                {formatDate(timeRange.start)} - {formatDate(timeRange.end)}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">Costo total: </span>
              <span className="text-foreground font-semibold">
                {formatCurrency(ganttData.reduce((sum, item) => sum + item.amount, 0))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
