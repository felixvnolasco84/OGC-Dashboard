import React from "react";
import { AxisOptions, Chart } from "react-charts";

interface ChartDataPoint {
    date: string;
    manoDeObra: number;
    materiales: number;
    contratistas: number;
    equipos: number;
    isProjection?: boolean;
}

interface AreaChartProps {
    data: ChartDataPoint[];
    height?: number;
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

export default function AreaChart({ data  }: AreaChartProps) {
    // Get today's datex
    // const today = new Date();
    
    // Mock data with today's date as the dividing point
    const mockData: ChartDataPoint[] = [
        { date: '01 Sep', manoDeObra: 50000, materiales: 30000, contratistas: 20000, equipos: 15000 },
        { date: '05 Sep', manoDeObra: 80000, materiales: 45000, contratistas: 35000, equipos: 25000 },
        { date: '10 Sep', manoDeObra: 120000, materiales: 70000, contratistas: 50000, equipos: 40000 },
        { date: '15 Sep', manoDeObra: 150000, materiales: 85000, contratistas: 65000, equipos: 50000 },
        { date: '20 Sep', manoDeObra: 180000, materiales: 100000, contratistas: 75000, equipos: 60000 },
        { date: '24 Sep', manoDeObra: 200000, materiales: 110000, contratistas: 80000, equipos: 65000 }, // Today
        { date: '25 Sep', manoDeObra: 220000, materiales: 120000, contratistas: 85000, equipos: 70000, isProjection: true },
        { date: '30 Sep', manoDeObra: 280000, materiales: 150000, contratistas: 100000, equipos: 85000, isProjection: true },
    ];

    const chartData = data.length > 0 ? data : mockData;

    // Transform data for react-charts format
    const transformedData: ReactChartsSeries[] = React.useMemo(() => {
        const series = [
            { key: 'manoDeObra', label: 'Mano de obra', color: '#60A5FA' },
            { key: 'materiales', label: 'Materiales', color: '#34D399' },
            { key: 'contratistas', label: 'Contratistas', color: '#FB923C' },
            { key: 'equipos', label: 'Equipos y acabados', color: '#F87171' }
        ];

        return series.map(({ key, label }) => ({
            label,
            data: chartData.map((d, index) => {
                // Create date from string (simplified - in real app you'd parse properly)
                const date = new Date(2024, 8, index + 1); // September 2024
                return {
                    primary: date,
                    secondary: d[key as keyof ChartDataPoint] as number,
                };
            }),
        }));
    }, [chartData]);

    const primaryAxis = React.useMemo<AxisOptions<ReactChartsDataPoint>>(
        () => ({
            getValue: (datum) => datum.primary,
            // formatters: {
            //     scale: (value: Date) => {
            //         return value
            //         // return value.toLocaleDateString('es-ES', { 
            //         //     day: '2-digit', 
            //         //     month: 'short' 
            //         // });
            //     },
            // },
        }),
        []
    );

    const secondaryAxes = React.useMemo<AxisOptions<ReactChartsDataPoint>[]>(
        () => [
            {
                getValue: (datum) => datum.secondary,
                stacked: true,
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
                },
            },
        ],
        []
    );

    return (
        <div className="w-full h-full relative">
            <div className="w-full h-80">
                <Chart
                    options={{
                        data: transformedData,
                        primaryAxis,
                        secondaryAxes,
                        defaultColors: ['#60A5FA', '#34D399', '#FB923C', '#F87171'],
                        dark: false,
                        interactionMode: 'closest',
                    }}
                />
            </div>
        </div>
    );
}
