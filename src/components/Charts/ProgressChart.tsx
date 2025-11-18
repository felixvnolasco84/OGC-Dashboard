import React from "react";
import { AxisOptions, Chart } from "react-charts";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
// import { Settings } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { useWeeklyAvanceModal } from "@/hooks/weekly-avance-modal";
import WeeklyAvanceModal from "@/components/modals/weekly-avance-modal";

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

export default function ProgressChart({
    data,
    proyectoId,
    height = 320,
    selectedPeriodo = "Diario",
    selectedRangoFecha = "Ultimos 30 dias",
    isSalesProject = false
}: ProgressChartProps) {

    console.log(data)

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
        // For "Todo el tiempo", return null to skip date filtering
        if (selectedRangoFecha === "Todo el tiempo") {
            return { startDate: null, endDate: null };
        }

        const now = new Date();
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

    // Convert Excel serial date to formatted date string
    const excelDateToString = (serial: number): string => {
        const date = new Date((serial - 25569) * 86400 * 1000);
        const day = date.getDate();
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const monthName = monthNames[date.getMonth()];
        const year = date.getFullYear();
        return `${String(day).padStart(2, '0')} ${monthName} ${year}`;
    };

    // Helper to parse date string to Date object
    const parseDateFromLabel = (dateLabel: string | undefined): Date => {
        // Safety check for undefined/null
        if (!dateLabel) {
            console.warn('parseDateFromLabel called with undefined/null dateLabel');
            return new Date();
        }

        const parts = dateLabel.split(' ');
        const monthMap: { [key: string]: number } = {
            'Ene': 0, 'Feb': 1, 'Mar': 2, 'Abr': 3, 'May': 4, 'Jun': 5,
            'Jul': 6, 'Ago': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dic': 11
        };

        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = monthMap[parts[1]] ?? 0;
            const year = parseInt(parts[2], 10);
            return new Date(year, month, day);
        }
        return new Date();
    };

    // Deduplicate and aggregate data points with the same date
    const chartData = React.useMemo(() => {
        // Process actual transaction data
        const actualDataMap = new Map<string, ChartDataPoint>();
        rawData.forEach((point) => {
            const existing = actualDataMap.get(point.date);
            if (existing) {
                // Keep the highest values for duplicate dates (cumulative should be increasing)
                actualDataMap.set(point.date, {
                    date: point.date,
                    gastoProgramado: 0,
                    gastoTotal: Math.max(existing.gastoTotal || 0, point.gastoTotal || 0),
                    // avanceReal: Math.max(existing.avanceReal || 0, point.avanceReal || 0),
                });
            } else {
                actualDataMap.set(point.date, {
                    date: point.date,
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
            // Filter projected data by date range (skip filter if dates are null - "Todo el tiempo")
            const filteredProjections = projectedData.filter((projection) => {
                // If no date filter (Todo el tiempo), include all data
                if (!getDateRangeFilter.startDate || !getDateRangeFilter.endDate) {
                    return true;
                }
                const projDate = new Date((projection.week_date - 25569) * 86400 * 1000);
                return projDate >= getDateRangeFilter.startDate && projDate <= getDateRangeFilter.endDate;
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
                    const projDate = new Date((projection.week_date - 25569) * 86400 * 1000);
                    const monthKey = `${projDate.getFullYear()}-${projDate.getMonth()}`;

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

        // Filter the final data by date range (skip filter if dates are null - "Todo el tiempo")
        const allData = Array.from(dataMap.values());
        if (!getDateRangeFilter.startDate || !getDateRangeFilter.endDate) {
            // No date filtering - return all data
            return allData;
        }

        return allData.filter((point) => {
            const pointDate = parseDateFromLabel(point.date);
            return pointDate >= getDateRangeFilter.startDate && pointDate <= getDateRangeFilter.endDate;
        });
    }, [rawData, projectedData, weeklyAvanceData, selectedPeriodo, getDateRangeFilter]);

    // Transform data for react-charts format
    const transformedData: ReactChartsSeries[] = React.useMemo(() => {
        if (chartData.length === 0) return [];

        // Parse dates from string format "DD Mon YYYY"
        const parseDateString = (dateStr: string | undefined): Date => {
            // Safety check for undefined/null
            if (!dateStr) {
                console.warn('parseDateString called with undefined/null dateStr');
                return new Date();
            }

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

            if (parts.length === 3) {
                // Format: "DD Mon YYYY"
                const day = parseInt(parts[0], 10);
                const month = monthMap[parts[1]] ?? 0;
                const year = parseInt(parts[2], 10);
                return new Date(year, month, day);
            } else if (parts.length === 2) {
                // Legacy format: "DD Mon" (assume 2025)
                const day = parseInt(parts[0], 10);
                const month = monthMap[parts[1]] ?? 0;
                return new Date(2025, month, day);
            }

            // Fallback: return current date
            return new Date();
        };

        // Filter out any data points with invalid dates first
        const validData = chartData.filter(d => d.date && typeof d.date === 'string' && d.date.trim() !== '');

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

        const series: ReactChartsSeries[] = [];

        // Gasto Proyectado (Light blue area) - from weekly projected totals
        const proyectadoData = filteredData
            .filter(d => (d.gastoProgramado || 0) > 0)
            .map((d) => ({
                primary: parseDateString(d.date),
                secondary: d.gastoProgramado || 0,
            }));

        if (proyectadoData.length > 0) {
            series.push({
                label: 'Gasto Proyectado',
                data: proyectadoData,
            });
        }

        // Gasto Real (Darker blue area) - actual spending from transactions
        const realData = filteredData
            .filter(d => (d.gastoTotal || 0) > 0)
            .map((d) => ({
                primary: parseDateString(d.date),
                secondary: d.gastoTotal || 0,
            }));

        if (realData.length > 0) {
            series.push({
                label: 'Gasto Real',
                data: realData,
            });
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

        return series;
    }, [chartData, dateRange.start, dateRange.end]);

    const primaryAxis = React.useMemo<AxisOptions<ReactChartsDataPoint>>(
        () => ({
            getValue: (datum) => datum.primary,
            scaleType: 'time',
            showGrid: true, // Remove X-axis grid lines
            hardMin: transformedData.length > 0 && transformedData[0].data.length > 0
                ? transformedData[0].data[0].primary
                : undefined,
            hardMax: transformedData.length > 0 && transformedData[0].data.length > 0
                ? transformedData[0].data[transformedData[0].data.length - 1].primary
                : undefined,
        }),
        [transformedData]
    );

    const secondaryAxes = React.useMemo<AxisOptions<ReactChartsDataPoint>[]>(
        () => {
            // Calculate min and max values from ALL series to ensure proper scaling
            const allValues = transformedData.flatMap(series =>
                series.data.map(d => d.secondary)
            );
            const maxValue = allValues.length > 0 ? Math.max(...allValues) : undefined;

            return [
                {
                    getValue: (datum) => datum.secondary,
                    scaleType: 'linear',
                    elementType: "area",
                    showGrid: false, // Keep Y-axis grid lines
                    showDatumElements: true, // Remove data point markers
                    hardMin: 0, // Always start from 0
                    hardMax: maxValue, // Set max to accommodate all series data
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
                        background: 'linear-gradient(to bottom, #ffffff 0%, #f5f5f5 100%)'
                    }}
                >

                    <div className="pointer-events-auto w-full h-full">
                        <Chart
                            options={{
                                data: transformedData,
                                primaryAxis,
                                secondaryAxes,
                                // Light blue gradient for Gasto Programado, darker blue for Gasto Total
                                defaultColors: ['#BFCFDC', '#79AAAF'],
                                dark: false,
                                interactionMode: "primary",
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
                                                    color: expectedLabel === 'Gasto Proyectado' ? '#BFCFDC' : '#79AAAF'
                                                });
                                            } else {
                                                // Series doesn't exist, show 0
                                                seriesData.push({
                                                    label: expectedLabel,
                                                    value: 0,
                                                    color: expectedLabel === 'Gasto Proyectado' ? '#BFCFDC' : '#79AAAF'
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
            <WeeklyAvanceModal />
        </div>
    );
}
