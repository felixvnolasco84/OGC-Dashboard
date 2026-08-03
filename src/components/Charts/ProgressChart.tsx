import React from "react";
import { AxisOptions, Chart } from "react-charts";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
    excelSerialToIsoDate,
    parseProjectDate,
} from "../../../convex/reportingUtils";
// import { Settings } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { useWeeklyAvanceModal } from "@/hooks/weekly-avance-modal";
// import WeeklyAvanceModal from "@/components/modals/weekly-avance-modal";

interface ChartDataPoint {
    date: string;
    gastoProgramado?: number;
    gastoTotal?: number;
    avanceReal?: number;
}

interface ProgressChartProps {
    data: ChartDataPoint[];
    proyectoId?: Id<"desarrollos"> | Id<"sales_projects">;
    height?: number;
    selectedPeriodo?: string; // "Diario", "Semanal", "Mensual"
    selectedRangoFecha?: string; // "Ultimos 7 dias", "Ultimos 30 dias", etc.
    isSalesProject?: boolean; // Flag to indicate if this is a sales project
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

const projectedColor = "#B6C3D0";
const realColor = "#93B0C3";
const toSafeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

export default function ProgressChart({
    data,
    proyectoId,
    height = 320,
    selectedPeriodo = "Diario",
    selectedRangoFecha = "Ultimos 30 dias",
    isSalesProject = false
}: ProgressChartProps) {
    const reactId = React.useId();
    const gradientIdPrefix = React.useMemo(() => `progress-chart-${toSafeId(reactId)}`, [reactId]);
    const projectedGradientId = `${gradientIdPrefix}-projected`;
    const realGradientId = `${gradientIdPrefix}-real`;

    // Query weekly projected totals if proyectoId is provided (only for regular projects)
    const projectedData = useQuery(
        api.weekly_projected_totals.getCumulativeTotals,
        proyectoId && !isSalesProject ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip"
    );

    // Query weekly avance real data (only for regular projects)
    const weeklyAvanceData = useQuery(
        api.weekly_avance_real.getByProyecto,
        proyectoId && !isSalesProject ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip"
    );

    // Query project info for modal
    // const proyecto = useQuery(
    //     api.desarrollos.getById,
    //     proyectoId ? { id: proyectoId } : "skip"
    // );

    // Modal hook
    // const weeklyAvanceModal = useWeeklyAvanceModal();

    // Helper: Get date range based on filter
    const getDateRangeFilter = React.useMemo(() => {
        const now = new Date();
        
        // For "Todo el tiempo", return null for startDate but still limit endDate to today
        if (selectedRangoFecha === "Todo el tiempo") {
            return { startDate: null, endDate: now };
        }

        const daysMap: { [key: string]: number } = {
            "Ultimos 7 dias": 7,
            "Ultimos 30 dias": 30,
            "Ultimos 60 dias": 60,
            "Ultimos 90 dias": 90,
            "Ultimos 180 dias": 180,
            "Ultimos 365 dias": 365,
        };

        const days = daysMap[selectedRangoFecha] || 30;
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - days);

        return { startDate, endDate: now };
    }, [selectedRangoFecha]);

    // State for zoom range
    const [dateRange] = React.useState<{ start: Date | null; end: Date | null }>({
        start: null,
        end: null,
    });

    // Use real data if available, otherwise check for projected data, finally fall back to mock
    const rawData = React.useMemo(() => {
        if (data.length > 0) return data;
        if (projectedData && projectedData.length > 0) return [];
        return [];
    }, [data, projectedData]);

    // All chart joins use ISO calendar dates. This is the same normalization
    // used by report snapshots and prevents locale parsing from changing totals.
    const excelDateToString = (serial: number): string => {
        return excelSerialToIsoDate(serial) || "";
    };

    // Helper to parse date string to Date object
    const parseDateFromLabel = (dateLabel: string | undefined): Date => {
        const iso = parseProjectDate(dateLabel);
        return iso ? new Date(`${iso}T12:00:00`) : new Date(Number.NaN);
    };

    // Deduplicate and aggregate data points with the same date
    const chartData = React.useMemo(() => {
        // Process actual transaction data
        const actualDataMap = new Map<string, ChartDataPoint>();
        rawData.forEach((point) => {
            const normalizedDate = parseProjectDate(point.date);
            if (!normalizedDate) return;
            const existing = actualDataMap.get(normalizedDate);
            if (existing) {
                // Keep the highest values for duplicate dates (cumulative should be increasing)
                actualDataMap.set(normalizedDate, {
                    date: normalizedDate,
                    gastoProgramado: 0,
                    gastoTotal: Math.max(existing.gastoTotal || 0, point.gastoTotal || 0),
                    // avanceReal: Math.max(existing.avanceReal || 0, point.avanceReal || 0),
                });
            } else {
                actualDataMap.set(normalizedDate, {
                    date: normalizedDate,
                    gastoProgramado: 0,
                    gastoTotal: point.gastoTotal || 0,
                    avanceReal: point.avanceReal || 0,
                });
            }
        });

        // Process weekly avance real data
        // const avanceRealMap = new Map<string, number>();
        // if (weeklyAvanceData && weeklyAvanceData.length > 0) {
        //     weeklyAvanceData.forEach((avanceRecord) => {
        //         // Convert Excel serial date to the same format used in the chart
        //         const dateLabel = excelDateToString(avanceRecord.week_date);
        //         avanceRealMap.set(dateLabel, avanceRecord.avance_real);
        //     });
        // }

        // Process projected data separately
        const projectedDataMap = new Map<string, number>();
        if (projectedData && projectedData.length > 0) {
            // Filter projected data by date range - always limit to endDate (today) to prevent future projections
            const filteredProjections = projectedData.filter((projection) => {
                const isoDate = excelSerialToIsoDate(projection.week_date);
                const projDate = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date(Number.NaN);
                // Always filter by endDate to prevent showing future projections
                if (getDateRangeFilter.endDate && projDate > getDateRangeFilter.endDate) {
                    return false;
                }
                // If startDate is set, also filter by it
                if (getDateRangeFilter.startDate && projDate < getDateRangeFilter.startDate) {
                    return false;
                }
                return true;
            });

            // Apply period aggregation if needed
            let dataToUse = filteredProjections;

            if (selectedPeriodo === "Semanal") {
                // Weekly data is already aggregated, just use it
                dataToUse = filteredProjections;
            } else if (selectedPeriodo === "Mensual") {
                // Group by month
                const monthlyMap = new Map<string, typeof filteredProjections[0]>();
                filteredProjections.forEach((projection) => {
                    const isoDate = excelSerialToIsoDate(projection.week_date);
                    const monthKey = isoDate?.slice(0, 7) || "invalid";

                    // Keep the last week of each month (highest cumulative)
                    const existing = monthlyMap.get(monthKey);
                    if (!existing || projection.cumulative_total > (existing.cumulative_total || 0)) {
                        monthlyMap.set(monthKey, projection);
                    }
                });
                dataToUse = Array.from(monthlyMap.values());
            }
            // For "Diario", we use weekly data as-is since it's the finest granularity we have

            // Store projected data in separate map
            dataToUse.forEach((projection) => {
                const dateLabel = excelDateToString(projection.week_date);
                projectedDataMap.set(dateLabel, projection.cumulative_total || 0);
            });
        }

        // Combine all datasets: create unified date set
        const allDates = new Set([
            ...actualDataMap.keys(),
            ...projectedDataMap.keys(),
            // ...avanceRealMap.keys()
        ]);

        const dataMap = new Map<string, ChartDataPoint>();
        allDates.forEach(date => {
            const actualData = actualDataMap.get(date);
            const projectedAmount = projectedDataMap.get(date);
            // const weeklyAvance = avanceRealMap.get(date);

            dataMap.set(date, {
                date: date,
                gastoProgramado: projectedAmount || 0,
                gastoTotal: actualData?.gastoTotal || 0,
                // avanceReal: weeklyAvance || actualData?.avanceReal || 0,
            });
        });

        // Filter the final data by date range - always limit to endDate to prevent future data
        const allData = Array.from(dataMap.values());

        return allData.filter((point) => {
            const pointDate = parseDateFromLabel(point.date);
            // Always filter by endDate to prevent showing future data
            if (getDateRangeFilter.endDate && pointDate > getDateRangeFilter.endDate) {
                return false;
            }
            // If startDate is set, also filter by it
            if (getDateRangeFilter.startDate && pointDate < getDateRangeFilter.startDate) {
                return false;
            }
            return true;
        });
    }, [rawData, projectedData, weeklyAvanceData, selectedPeriodo, getDateRangeFilter]);

    // Transform data for react-charts format
    const transformedDataWithOrder = React.useMemo(() => {
        if (chartData.length === 0) return { series: [] as ReactChartsSeries[], isRealLarger: false };

        const parseDateString = (dateStr: string | undefined): Date => {
            return parseDateFromLabel(dateStr);
        };

        // Filter out any data points with invalid dates first
        const validData = chartData.filter((d) =>
            Boolean(parseProjectDate(d.date)));

        // Sort data by date to prevent vertical spikes
        const sortedData = [...validData].sort((a, b) => {
            const dateA = parseDateString(a.date);
            const dateB = parseDateString(b.date);
            return dateA.getTime() - dateB.getTime();
        });

        // Filter by date range if set
        const filteredData = sortedData.filter((d) => {
            if (!dateRange.start || !dateRange.end) return true;
            const date = parseDateString(d.date);
            return date >= dateRange.start && date <= dateRange.end;
        });

        // Gasto Proyectado (Light blue area) - from weekly projected totals
        const proyectadoData = filteredData
            .filter(d => (d.gastoProgramado || 0) > 0)
            .map((d) => ({
                primary: parseDateString(d.date),
                secondary: d.gastoProgramado || 0,
            }));

        // Gasto Real (Darker blue area) - actual spending from transactions
        const realData = filteredData
            .filter(d => (d.gastoTotal || 0) > 0)
            .map((d) => ({
                primary: parseDateString(d.date),
                secondary: d.gastoTotal || 0,
            }));

        // Find the overall max date from both series to extend shorter series
        const allDataPoints = [...proyectadoData, ...realData];
        let overallMaxDate: Date | undefined = undefined;
        for (const d of allDataPoints) {
            if (!overallMaxDate || d.primary > overallMaxDate) {
                overallMaxDate = d.primary;
            }
        }

        // Extend proyectadoData to the max date if it ends earlier
        // This prevents the "floating" appearance where one series ends before the other
        if (proyectadoData.length > 0 && overallMaxDate !== undefined) {
            const lastProyectado = proyectadoData[proyectadoData.length - 1];
            const maxDate = overallMaxDate;
            if (lastProyectado.primary.getTime() < maxDate.getTime()) {
                // Add a point at the max date with the last known value to extend the area
                proyectadoData.push({
                    primary: maxDate,
                    secondary: lastProyectado.secondary,
                });
            }
        }

        // Extend realData to the max date if it ends earlier
        if (realData.length > 0 && overallMaxDate !== undefined) {
            const lastReal = realData[realData.length - 1];
            const maxDate = overallMaxDate;
            if (lastReal.primary.getTime() < maxDate.getTime()) {
                realData.push({
                    primary: maxDate,
                    secondary: lastReal.secondary,
                });
            }
        }

        // Calculate max values for each series to determine render order
        const maxProyectado = proyectadoData.length > 0 
            ? Math.max(...proyectadoData.map(d => d.secondary)) 
            : 0;
        const maxReal = realData.length > 0 
            ? Math.max(...realData.map(d => d.secondary)) 
            : 0;

        // Build series array with larger series first (rendered in back)
        // This ensures the smaller series overlays the larger one properly
        const series: ReactChartsSeries[] = [];

        if (maxProyectado >= maxReal) {
            // Proyectado is larger or equal - render it first (back)
            if (proyectadoData.length > 0) {
                series.push({
                    label: 'Gasto Proyectado',
                    data: proyectadoData,
                });
            }
            if (realData.length > 0) {
                series.push({
                    label: 'Gasto Real',
                    data: realData,
                });
            }
        } else {
            // Real is larger - render it first (back)
            if (realData.length > 0) {
                series.push({
                    label: 'Gasto Real',
                    data: realData,
                });
            }
            if (proyectadoData.length > 0) {
                series.push({
                    label: 'Gasto Proyectado',
                    data: proyectadoData,
                });
            }
        }

        // Avance % (Dashed line)
        const avanceData = filteredData
            .filter(d => d.avanceReal !== undefined && d.avanceReal > 0)
            .map((d) => ({
                primary: parseDateString(d.date),
                secondary: d.avanceReal || 0,
            }));

        if (avanceData.length > 0) {
            series.push({
                label: 'Avance %',
                data: avanceData,
            });
        }

        // Return series with color order info
        return {
            series,
            isRealLarger: maxReal > maxProyectado
        };
    }, [chartData, dateRange.start, dateRange.end]);

    // Extract series and color order from transformed data
    const transformedData = transformedDataWithOrder.series;
    const isRealLarger = transformedDataWithOrder.isRealLarger;

    // Dynamic colors based on series order - larger series gets lighter color (back), smaller gets darker (front)
    const chartColors = React.useMemo(() => {
        if (isRealLarger) {
            // Real is larger (rendered first/back) - Real gets light, Proyectado gets dark
            return [realColor, projectedColor];
        } else {
            // Proyectado is larger or equal (rendered first/back) - Proyectado gets light, Real gets dark
            return [projectedColor, realColor];
        }
    }, [isRealLarger]);

    // Calculate the actual date range from all series data
    const dateRangeBounds = React.useMemo(() => {
        if (transformedData.length === 0) return { min: undefined, max: undefined };
        
        let minDate: Date | undefined;
        let maxDate: Date | undefined;
        
        transformedData.forEach(series => {
            series.data.forEach(point => {
                if (!minDate || point.primary < minDate) {
                    minDate = point.primary;
                }
                if (!maxDate || point.primary > maxDate) {
                    maxDate = point.primary;
                }
            });
        });
        
        return { min: minDate, max: maxDate };
    }, [transformedData]);

    const primaryAxis = React.useMemo<AxisOptions<ReactChartsDataPoint>>(
        () => ({
            getValue: (datum) => datum.primary,
            scaleType: 'time',
            showGrid: true,
            // Set explicit min/max to prevent empty space at chart edges
            min: dateRangeBounds.min,
            max: dateRangeBounds.max,
            padBandRange: false,
        }),
        [dateRangeBounds]
    );

    const secondaryAxes = React.useMemo<AxisOptions<ReactChartsDataPoint>[]>(
        () => {
            return [
                {
                    getValue: (datum) => datum.secondary,
                    scaleType: 'linear',
                    elementType: "area",
                    showGrid: false,
                    showDatumElements: false, // Hide data point markers for cleaner look
                    min: 0, // Always start Y-axis from 0
                    // Let react-charts auto-calculate the max from all series data
                    formatters: {
                        scale: (value: number) => {
                            if (value >= 1000000) {
                                return `$${(value / 1000000).toFixed(1)}M`;
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
            ];
        },
        [transformedData]
    );

    // const handleOpenAvanceModal = () => {
    //     if (proyectoId && proyecto) {
    //         weeklyAvanceModal.onOpen({
    //             proyectoId,
    //             proyectoNombre: proyecto.nombre,
    //         });
    //     }
    // };

    return (
        <div className="w-full h-full relative flex flex-col items-end space-y-2">
            {/* Configure Avance Button */}
            {/* {proyectoId && (
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleOpenAvanceModal}
                    className="bg-white hover:bg-gray-50"
                >
                    <Settings className="h-4 w-4" />
                </Button>
            )} */}

            {/* Info message when no projected data */}
            {proyectoId && (!projectedData || projectedData.length === 0) && (
                <div className="absolute top-12 left-1/2 transform -translate-x-1/2 z-40 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800">
                    ℹ️ No hay totales semanales proyectados cargados. Carga los datos desde la página de Admin.
                </div>
            )}

            {/* Show empty state if no data */}
            {transformedData.length === 0 ? (
                <div className="w-full flex items-center justify-center" style={{ height: `${height}px` }}>
                    <div className="text-center text-gray-400">
                        <p className="text-sm">No hay datos disponibles para mostrar</p>
                    </div>
                </div>
            ) : (
                <div
                    className="w-full pointer-events-none relative progress-chart-container"
                    style={{
                        height: `${height}px`,
                        background: '#fbfbfa'
                    }}
                >
                    <style>
                        {`
                            .progress-chart-container .Axis .domain,
                            .progress-chart-container .Axis .domainAndTicks > .tick line {
                                stroke: transparent !important;
                            }

                            .progress-chart-container .Axis .grid line {
                                stroke: #EAEAEA !important;
                                stroke-width: 1;
                            }

                            .progress-chart-container .Axis text.tickLabel {
                                fill: #777770 !important;
                                font-size: 12px !important;
                                font-weight: 400;
                            }

                            .progress-chart-container svg path {
                                transition: none;
                            }
                        `}
                    </style>

                    <div className="pointer-events-auto w-full h-full">
                        <Chart
                            options={{
                                data: transformedData,
                                primaryAxis,
                                secondaryAxes,
                                // Dynamic colors based on series order - larger series in back gets lighter color
                                defaultColors: chartColors,
                                getSeriesStyle: (series) => {
                                    const isProjected = series.label === 'Gasto Proyectado';
                                    const seriesColor = isProjected ? projectedColor : realColor;
                                    const gradientId = isProjected ? projectedGradientId : realGradientId;

                                    return {
                                        color: seriesColor,
                                        area: {
                                            fill: `url(#${gradientId})`,
                                            opacity: 1,
                                            stroke: "none",
                                        },
                                        line: {
                                            stroke: "transparent",
                                            strokeWidth: 0,
                                        },
                                    };
                                },
                                dark: false,
                                interactionMode: "primary",
                                renderSVG: () => (
                                    <defs>
                                        <linearGradient id={projectedGradientId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={projectedColor} stopOpacity="0.52" />
                                            <stop offset="45%" stopColor={projectedColor} stopOpacity="0.36" />
                                            <stop offset="78%" stopColor={projectedColor} stopOpacity="0.24" />
                                            <stop offset="100%" stopColor={projectedColor} stopOpacity="0.16" />
                                        </linearGradient>
                                        <linearGradient id={realGradientId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={realColor} stopOpacity="0.58" />
                                            <stop offset="45%" stopColor={realColor} stopOpacity="0.42" />
                                            <stop offset="78%" stopColor={realColor} stopOpacity="0.30" />
                                            <stop offset="100%" stopColor={realColor} stopOpacity="0.20" />
                                        </linearGradient>
                                    </defs>
                                ),
                                
                                tooltip: {
                                    show: true,
                                    align: 'auto',
                                    render: ({ focusedDatum }) => {
                                        if (!focusedDatum) return null;

                                        const date = focusedDatum.primaryValue as Date;
                                        const dateStr = date.toLocaleDateString('es-MX', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric'
                                        });

                                        const formatCurrency = (val: number) => {
                                            return new Intl.NumberFormat('es-MX', {
                                                style: 'currency',
                                                currency: 'MXN',
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 0,
                                            }).format(val);
                                        };

                                        // Find all series values at this date
                                        // Collect all series and their values at the focused date
                                        const seriesData: Array<{ label: string; value: number; color: string }> = [];
                                        let cumulativeGastoReal = 0; // Store cumulative value for total

                                        // Define expected series
                                        const expectedSeries = ['Gasto Proyectado', 'Gasto Real'];

                                        expectedSeries.forEach((expectedLabel) => {
                                            const series = transformedData.find(s => s.label === expectedLabel);

                                            if (series) {
                                                // Find the closest data point to the focused date
                                                let closestPoint = series.data[0];
                                                let closestPointIndex = 0;
                                                let minDiff = Math.abs(series.data[0].primary.getTime() - date.getTime());

                                                series.data.forEach((d, index) => {
                                                    const diff = Math.abs(d.primary.getTime() - date.getTime());
                                                    if (diff < minDiff) {
                                                        minDiff = diff;
                                                        closestPoint = d;
                                                        closestPointIndex = index;
                                                    }
                                                });

                                                // Only use the value if it's within a reasonable timeframe (e.g., 7 days)
                                                const daysDiff = minDiff / (1000 * 60 * 60 * 24);
                                                let value = daysDiff <= 7 ? closestPoint.secondary : 0;

                                                // For Gasto Real, store cumulative value for total display
                                                if (expectedLabel === 'Gasto Real') {
                                                    cumulativeGastoReal = value; // Store cumulative for total
                                                }

                                                // For both series, calculate weekly amount (non-cumulative) for breakdown
                                                if (value > 0 && closestPointIndex > 0) {
                                                    const previousPoint = series.data[closestPointIndex - 1];
                                                    value = closestPoint.secondary - previousPoint.secondary; // Weekly amount for breakdown
                                                }

                                                seriesData.push({
                                                    label: expectedLabel,
                                                    value: value,
                                                    color: expectedLabel === 'Gasto Proyectado' ? projectedColor : realColor
                                                });
                                            } else {
                                                // Series doesn't exist, show 0
                                                seriesData.push({
                                                    label: expectedLabel,
                                                    value: 0,
                                                    color: expectedLabel === 'Gasto Proyectado' ? projectedColor : realColor
                                                });
                                            }
                                        });

                                        // Use cumulative Gasto Real for total
                                        const total = cumulativeGastoReal;

                                        return (
                                            <div style={{

                                                minWidth: '200px'
                                            }}>
                                                {/* Date */}
                                                <div style={{
                                                    fontSize: '12px',
                                                    fontWeight: '500',
                                                    width: 'fit-content',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    marginBottom: '4px',
                                                }}>
                                                    <div style={{
                                                        padding: '8px',
                                                        borderRadius: '4px',

                                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                        backgroundColor: '#AFAEA2',
                                                        color: 'white',
                                                        width: 'fit-content',
                                                    }}>

                                                        {dateStr}
                                                    </div>
                                                    <div style={{
                                                        padding: '8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #e5e7eb',
                                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                        backgroundColor: '#fff',
                                                        color: '#111827',
                                                        width: 'fit-content',


                                                    }}>
                                                        {formatCurrency(total)}
                                                    </div>
                                                </div>

                                                {/* Series breakdown */}
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px',
                                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                    padding: '8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #e5e7eb',
                                                    backgroundColor: '#fff',
                                                }}>
                                                    {seriesData.map((item, idx) => (
                                                        <div key={idx} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '12px',
                                                            fontSize: '12px'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <div style={{
                                                                    width: '8px',
                                                                    height: '8px',
                                                                    borderRadius: '50%',
                                                                    backgroundColor: item.color
                                                                }}></div>
                                                                <span style={{ color: '#6B7280' }}>{item.label}</span>
                                                            </div>
                                                            <span style={{
                                                                fontWeight: '500',
                                                                color: '#111827'
                                                            }}>
                                                                {formatCurrency(item.value)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                },
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Weekly Avance Modal */}
            {/* <WeeklyAvanceModal /> */}
        </div>
    );
}
