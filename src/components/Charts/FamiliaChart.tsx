import React from "react";
import { AxisOptions, Chart } from "react-charts";
import { Settings } from "lucide-react";

interface ChartDataPoint {
    date: string;
    monto: number;
}

/**
 * FamiliaChart - Displays cumulative spending over time for filtered partidas
 * 
 * @param data - Chart data points from getFamiliaChartData query
 * @param title - Chart title displayed in header
 * @param total - Total cumulative amount displayed in header
 * @param color - Color for the area chart
 * @param height - Chart height in pixels (default: 300)
 * @param partidas - Filter by specific partida names (nivel 1)
 * @param familias - Filter by specific familia names
 * @param sub_partidas - Filter by specific sub-partida names
 * 
 * @example
 * // Basic usage with single familia filter (in query):
 * const data = useQuery(api.transacciones.getFamiliaChartData, {
 *   proyecto_id: projectId,
 *   familia: "ALBAÑILERÍAS"
 * });
 * <FamiliaChart data={data?.dataPoints || []} title="..." total={data?.total || 0} color="#3B82F6" />
 * 
 * @example
 * // Advanced usage with multiple filters (in query):
 * const data = useQuery(api.transacciones.getFamiliaChartData, {
 *   proyecto_id: projectId,
 *   partidas: ["CIMENTACIÓN", "ESTRUCTURA"],
 *   familias: ["CONCRETOS", "ACEROS"]
 * });
 * <FamiliaChart data={data?.dataPoints || []} title="..." total={data?.total || 0} color="#10B981" />
 */
interface FamiliaChartProps {
    chartId: string; // Unique identifier for this chart instance
    data: ChartDataPoint[];
    title: string;
    total: number;
    color: string;
    height?: number;
    onConfigClick?: () => void; // Callback to open configuration modal
    // Optional filters - NOTE: These are informational only. 
    // Actual filtering happens in the getFamiliaChartData query, not in this component
    partidas?: string[]; // Filter by specific partida names
    familias?: string[]; // Filter by specific familia names
    sub_partidas?: string[]; // Filter by specific sub-partida names
}

// Data structure that matches react-charts expected format
type ReactChartsDataPoint = {
    primary: Date;
    secondary: number;
};

type ReactChartsSeries = {
    label: string;
    data: ReactChartsDataPoint[];
};

const formatNumber = (amount: number) => {
    if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
        return `$${(amount / 1000).toFixed(0)}K`;
    }
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

export default function FamiliaChart({ 
    chartId, // Used for identification purposes when configuring
    data, 
    title, 
    total, 
    color, 
    height = 300,
    onConfigClick 
}: FamiliaChartProps) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    
    const _chartId = chartId; // Suppress unused warning - used for component identification

    console.log(_chartId);
    // Mock data if no data is provided
    const mockData: ChartDataPoint[] = [
        { date: '01 Sep', monto: 50000 },
        { date: '05 Sep', monto: 100000 },
        { date: '10 Sep', monto: 180000 },
        { date: '15 Sep', monto: 250000 },
        { date: '20 Sep', monto: 320000 },
        { date: '25 Sep', monto: 380000 },
        { date: '30 Sep', monto: 450000 },
    ];

    const rawData = data.length > 0 ? data : mockData;

    // Deduplicate and aggregate data points with the same date
    const chartData = React.useMemo(() => {
        const dataMap = new Map<string, ChartDataPoint>();

        rawData.forEach((point) => {
            const existing = dataMap.get(point.date);
            if (existing) {
                // Keep the highest value for duplicate dates (cumulative should be increasing)
                dataMap.set(point.date, {
                    date: point.date,
                    monto: Math.max(existing.monto || 0, point.monto || 0),
                });
            } else {
                dataMap.set(point.date, point);
            }
        });

        return Array.from(dataMap.values());
    }, [rawData]);

    // Transform data for react-charts format
    const transformedData: ReactChartsSeries[] = React.useMemo(() => {
        if (chartData.length === 0) return [];

        // Parse dates from string format "DD Mon"
        const parseDateString = (dateStr: string): Date => {
            const parts = dateStr.split(' ');
            const monthMap: { [key: string]: number } = {
                'Ene': 0, 'Enero': 0, 'Jan': 0, 'January': 0,
                'Feb': 1, 'Febrero': 1, 'February': 1,
                'Mar': 2, 'Marzo': 2, 'March': 2,
                'Abr': 3, 'Abril': 3, 'Apr': 3, 'April': 3,
                'May': 4, 'Mayo': 4,
                'Jun': 5, 'Junio': 5, 'June': 5,
                'Jul': 6, 'Julio': 6, 'July': 6,
                'Ago': 7, 'Agosto': 7, 'Aug': 7, 'August': 7,
                'Sep': 8, 'Septiembre': 8, 'September': 8,
                'Oct': 9, 'Octubre': 9, 'October': 9,
                'Nov': 10, 'Noviembre': 10, 'November': 10,
                'Dic': 11, 'Diciembre': 11, 'Dec': 11, 'December': 11
            };

            if (parts.length === 2) {
                const day = parseInt(parts[0], 10);
                const month = monthMap[parts[1]] ?? 8; // Default to September
                return new Date(2025, month, day);
            }

            // Fallback: return current date
            return new Date();
        };

        // Sort data by date to prevent vertical spikes
        const sortedData = [...chartData].sort((a, b) => {
            const dateA = parseDateString(a.date);
            const dateB = parseDateString(b.date);
            return dateA.getTime() - dateB.getTime();
        });

        const series: ReactChartsSeries[] = [];

        // Single series for this familia
        series.push({
            label: title,
            data: sortedData.map((d) => ({
                primary: parseDateString(d.date),
                secondary: d.monto || 0,
            })),
        });

        return series;
    }, [chartData, title]);

    const primaryAxis = React.useMemo<AxisOptions<ReactChartsDataPoint>>(
        () => ({
            getValue: (datum) => datum.primary,
        }),
        []
    );

    const secondaryAxes = React.useMemo<AxisOptions<ReactChartsDataPoint>[]>(
        () => [
            {
                getValue: (datum) => datum.secondary,
                elementType: "area",
                formatters: {
                    scale: (value: number) => {
                        if (value >= 1000000) {
                            return `$${(value / 1000000).toFixed(0)}M`;
                        } else if (value >= 1000) {
                            return `$${(value / 1000).toFixed(0)}K`;
                        }
                        return new Intl.NumberFormat('es-MX', {
                            style: 'currency',
                            currency: 'MXN',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                        }).format(value);
                    },
                    tooltip: (value: number) => {
                        return new Intl.NumberFormat('es-MX', {
                            style: 'currency',
                            currency: 'MXN',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                        }).format(value);
                    },
                },
            },
        ],
        []
    );

    return (
        <div className="w-full h-full relative bg-[#F7F7F7] p-6 rounded-lg border border-gray-200">
            {/* Header with title and total */}
            <div className="mb-6 text-left space-y-4">
                <div className="flex items-start justify-between">
                    <h3 className="text-lg font-normal text-gray-900 mb-1">{title}</h3>
                    {onConfigClick && (
                        <button
                            onClick={onConfigClick}
                            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            title="Configurar gráfica"
                        >
                            <Settings className="w-4 h-4 text-gray-600" />
                        </button>
                    )}
                </div>
                <div className="flex flex-col items-baseline">
                    <span className="text-xs text-gray-500">Total</span>
                    <span className="text-sm  text-gray-900">{formatNumber(total)}</span>
                </div>
            </div>

            {/* Chart */}
            <div className="w-full" style={{ height: `${height}px` }}>
                <Chart
                    options={{
                        data: transformedData,
                        primaryAxis,
                        secondaryAxes,
                        defaultColors: [color],
                        dark: false,
                        interactionMode: 'closest',
                        tooltip: {
                            show: true,
                        },
                    }}
                />
            </div>
        </div>
    );
}
