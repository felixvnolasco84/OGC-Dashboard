
interface ChartDataPoint {
    month: string;
    manoDeObra: number;
    materiales: number;
    contratistas: number;
    equipos: number;
}

interface AreaChartProps {
    data: ChartDataPoint[];
    height?: number;
}

export default function AreaChart({ data }: AreaChartProps) {
    // Calculate the maximum value for scaling
    const maxValue = Math.max(
        ...data.map(d => d.manoDeObra + d.materiales + d.contratistas + d.equipos)
    );

    // Create SVG path for each category
    const createPath = (points: number[], category: 'manoDeObra' | 'materiales' | 'contratistas' | 'equipos') => {
        const width = 100; // percentage
        const stepWidth = width / (data.length - 1);

        console.log(points);

        let path = '';
        const cumulativeValues: number[] = [];

        // Calculate cumulative values for stacking
        data.forEach((d) => {
            let cumulative = 0;
            if (category === 'manoDeObra') {
                cumulative = 0;
            } else if (category === 'materiales') {
                cumulative = d.manoDeObra;
            } else if (category === 'contratistas') {
                cumulative = d.manoDeObra + d.materiales;
            } else if (category === 'equipos') {
                cumulative = d.manoDeObra + d.materiales + d.contratistas;
            }
            cumulativeValues.push(cumulative);
        });

        // Create the top line of the area
        data.forEach((d, i) => {
            const x = i * stepWidth;
            const currentValue = cumulativeValues[i] + d[category];
            const y = 100 - (currentValue / maxValue) * 100;

            if (i === 0) {
                path += `M ${x} ${y}`;
            } else {
                path += ` L ${x} ${y}`;
            }
        });

        // Create the bottom line of the area (in reverse)
        for (let i = data.length - 1; i >= 0; i--) {
            const x = i * stepWidth;
            const y = 100 - (cumulativeValues[i] / maxValue) * 100;
            path += ` L ${x} ${y}`;
        }

        path += ' Z';
        return path;
    };

    const formatValue = (value: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
            notation: 'compact'
        }).format(value);
    };

    return (
        <div className="w-full h-full relative">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-400 pr-2">
                <span>{formatValue(maxValue)}</span>
                <span>{formatValue(maxValue * 0.75)}</span>
                <span>{formatValue(maxValue * 0.5)}</span>
                <span>{formatValue(maxValue * 0.25)}</span>
                <span>$0</span>
            </div>

            {/* Chart area */}
            <div className="ml-12 mr-4 h-full relative">
                <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="w-full h-full absolute inset-0"
                >
                    {/* Grid lines */}
                    <defs>
                        <pattern id="grid" width="20" height="25" patternUnits="userSpaceOnUse">
                            <path d="M 20 0 L 0 0 0 25" fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100" height="100" fill="url(#grid)" />

                    {/* Area paths */}
                    <path
                        d={createPath(data.map(d => d.manoDeObra), 'manoDeObra')}
                        fill="#3b82f6"
                        fillOpacity="0.7"
                    />
                    <path
                        d={createPath(data.map(d => d.materiales), 'materiales')}
                        fill="#10b981"
                        fillOpacity="0.7"
                    />
                    <path
                        d={createPath(data.map(d => d.contratistas), 'contratistas')}
                        fill="#f59e0b"
                        fillOpacity="0.7"
                    />
                    <path
                        d={createPath(data.map(d => d.equipos), 'equipos')}
                        fill="#ef4444"
                        fillOpacity="0.7"
                    />
                </svg>

                {/* X-axis labels */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-400 pt-2">
                    {data.map((d, i) => (
                        <span key={i} className="text-center">
                            {d.month}
                        </span>
                    ))}
                </div>

                {/* Hover tooltip area */}
                <div className="absolute inset-0 flex">
                    {data.map((d, i) => (
                        <div
                            key={i}
                            className="flex-1 relative group cursor-pointer"
                            title={`${d.month}: Total ${formatValue(d.manoDeObra + d.materiales + d.contratistas + d.equipos)}`}
                        >
                            {/* Hover line */}
                            <div className="absolute inset-x-0 top-0 bottom-6 border-l border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />

                            {/* Tooltip */}
                            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                <div>{d.month}</div>
                                <div>Mano de obra: {formatValue(d.manoDeObra)}</div>
                                <div>Materiales: {formatValue(d.materiales)}</div>
                                <div>Contratistas: {formatValue(d.contratistas)}</div>
                                <div>Equipos: {formatValue(d.equipos)}</div>
                                <div className="border-t border-gray-600 mt-1 pt-1">
                                    Total: {formatValue(d.manoDeObra + d.materiales + d.contratistas + d.equipos)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
