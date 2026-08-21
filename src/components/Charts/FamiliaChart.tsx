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

const toSafeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");
const referenceChartColor = "#256A34";

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
    chartId,
    data,
    title,
    total,
    color,
    height = 300,
    onConfigClick
}: FamiliaChartProps) {
    const gradientId = React.useMemo(() => `familia-chart-gradient-${toSafeId(chartId)}`, [chartId]);
    const chartColor = color.toUpperCase() === "#3B82F6" ? referenceChartColor : color;

    // Use real data from queries (filtered by configuration)
    const rawData = data;

    // Deduplicate and aggregate data points with the same date
    const chartData = React.useMemo(() => {
        const dataMap = new Map<string, ChartDataPoint>();

        rawData.forEach((point) => {
            const existing = dataMap.get(point.date);
            if (existing) {
                // Sum values for duplicate dates (aggregate all transactions on the same date)
                dataMap.set(point.date, {
                    date: point.date,
                    monto: (existing.monto || 0) + (point.monto || 0),
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

        // Parse dates from API format "YYYY-MM-DD Mon" or "DD Mon"
        const parseDateString = (dateStr: string): Date => {
            if (!dateStr || typeof dateStr !== 'string') {
                console.warn('Invalid date string:', dateStr);
                return new Date();
            }

            const parts = dateStr.trim().split(' ');

            // Format: "YYYY-MM-DD Mon" (e.g., "2025-11-06 Ene")
            if (parts.length >= 2 && parts[0].includes('-')) {
                const datePart = parts[0]; // "2025-11-06"
                const [year, month, day] = datePart.split('-').map(n => parseInt(n, 10));

                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    // Month is 1-based in the string, but Date constructor expects 0-based
                    return new Date(year, month - 1, day);
                }
            }

            // Format: "DD Mon" (e.g., "06 Ene")
            if (parts.length === 2) {
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

                const day = parseInt(parts[0], 10);
                const month = monthMap[parts[1]];

                if (!isNaN(day) && month !== undefined) {
                    return new Date(new Date().getFullYear(), month, day);
                }
            }

            // Fallback: try to parse as ISO date or return current date
            console.warn('Unable to parse date string, using fallback:', dateStr);
            const fallbackDate = new Date(dateStr);
            return isNaN(fallbackDate.getTime()) ? new Date() : fallbackDate;
        };

        // Sort data by date to prevent vertical spikes
        const sortedData = [...chartData].sort((a, b) => {
            const dateA = parseDateString(a.date);
            const dateB = parseDateString(b.date);
            return dateA.getTime() - dateB.getTime();
        });

        // Calculate cumulative values - each point should be sum of all previous + current
        // This ensures the chart only grows upward over time (like ProgressChart)
        let cumulativeTotal = 0;
        const cumulativeData = sortedData.map((d) => {
            cumulativeTotal += d.monto || 0;
            return {
                primary: parseDateString(d.date),
                secondary: cumulativeTotal,
            };
        });

        const series: ReactChartsSeries[] = [];

        // Single series for this familia with cumulative data
        series.push({
            label: title,
            data: cumulativeData,
        });

        return series;
    }, [chartData, title]);

    const primaryAxis = React.useMemo<AxisOptions<ReactChartsDataPoint>>(
        () => {
            // Calculate min and max dates from data to eliminate empty spaces
            const dates = transformedData.flatMap(series => series.data.map(d => d.primary.getTime()));
            const minDate = dates.length > 0 ? new Date(Math.min(...dates)) : undefined;
            const maxDate = dates.length > 0 ? new Date(Math.max(...dates)) : undefined;

            return {
                getValue: (datum) => datum.primary,
                padBandRange: false, // Remove empty spaces at start/end of chart
                hardMin: minDate, // Set exact start date
                hardMax: maxDate, // Set exact end date
                showGrid: false,
            };
        },
        [transformedData]
    );

    const secondaryAxes = React.useMemo<AxisOptions<ReactChartsDataPoint>[]>(
        () => [
            {
                getValue: (datum) => datum.secondary,
                elementType: "area",
                showGrid: true,
                shouldNice: true,
                showDatumElements: false,
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
        <div className="familia-chart w-full h-full relative bg-card p-8 md:p-10 rounded-md border border-border">
            <style>
                {`
                    .familia-chart .Axis .domain,
                    .familia-chart .Axis .domainAndTicks > .tick line {
                        stroke: transparent !important;
                    }

                    .familia-chart .Axis .grid line {
                        stroke: hsl(var(--border)) !important;
                        stroke-width: 1;
                        stroke-dasharray: 6 8;
                        stroke-linecap: round;
                    }

                    .familia-chart .Axis text.tickLabel {
                        fill: hsl(var(--muted-foreground)) !important;
                        font-size: 12px !important;
                        font-weight: 400;
                    }

                    .familia-chart svg path {
                        transition: none;
                    }
                `}
            </style>
            {/* Header with title and total */}
            <div className="mb-8 text-left space-y-8">
                <div className="flex items-start justify-between">
                    <h3 className="text-2xl md:text-xl leading-tight font-normal text-foreground mb-1">{title}</h3>
                    {onConfigClick && (
                        <button
                            onClick={onConfigClick}
                            className="p-2 hover:bg-[#eeece6] rounded-md transition-colors"
                            title="Configurar gráfica"
                        >
                            <Settings className="w-5 h-5 text-muted-foreground" />
                        </button>
                    )}
                </div>
                <div className="flex flex-col items-baseline">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-lg leading-tight text-foreground">{formatNumber(total)}</span>
                </div>
            </div>

            {/* Chart or Empty State */}
            <div className="w-full" style={{ height: `${height}px` }}>
                {transformedData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="text-disabled-foreground mb-2">
                            <svg
                                className="w-16 h-16 mx-auto mb-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                />
                            </svg>
                        </div>
                        <p className="text-sm text-subtle-foreground font-medium">Sin datos para mostrar</p>
                        <p className="text-xs text-disabled-foreground mt-1">
                            Ajusta los filtros para ver información
                        </p>
                    </div>
                ) : (
                    <Chart
                        options={{
                            data: transformedData,
                            primaryAxis,
                            secondaryAxes,
                            defaultColors: [chartColor],
                            padding: {
                                left: 6,
                                right: 24,
                                top: 8,
                                bottom: 10,
                            },
                            getSeriesStyle: () => ({
                                color: chartColor,
                                area: {
                                    fill: `url(#${gradientId})`,
                                    opacity: 1,
                                    stroke: "none",
                                },
                                line: {
                                    stroke: chartColor,
                                    strokeWidth: 2,
                                },
                            }),
                            dark: false,
                            interactionMode: 'closest',
                            tooltip: {
                                show: true,
                            },
                            renderSVG: () => (
                                <defs>
                                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={chartColor} stopOpacity="0.42" />
                                        <stop offset="52%" stopColor={chartColor} stopOpacity="0.24" />
                                        <stop offset="100%" stopColor="#fbfbfa" stopOpacity="0.02" />
                                    </linearGradient>
                                </defs>
                            ),
                        }}
                    />
                )}
            </div>
        </div>
    );
}
