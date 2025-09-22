import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
    useQuery
} from "convex/react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AreaChart from "@/components/Charts/AreaChart";
import { DashboardTable } from "../Dashboard/Table";

// Mockup data
const mockData = {
    project: {
        name: "Larena - Torre I",
        type: "Proyecto"
    },
    metrics: {
        presupuestoAprobado: {
            amount: 94225001,
            percentage: 36,
            comparison: 103533069,
            comparisonLabel: "Presupuesto año anterior"
        },
        gastoTotal: {
            amount: 22759332,
            percentage: 42,
            comparison: null,
            comparisonLabel: "Avance 50%"
        },
        porGastar: {
            amount: 83240580,
            percentage: 10,
            comparison: null,
            comparisonLabel: "Restante 77% ↑"
        }
    },
    filters: {
        torres: ["Torre G", "Torre H", "Torre I"],
        analisis: ["Por partida", "Por familia", "Por fecha"],
        periodos: ["Mensual", "Semanal", "Diario"]
    },
    secondaryMetrics: {
        gasto: 1225001,
        porVencer: 634042,
        honorarios: 134042
    },
    chartData: [
        { month: "01 Sep", manoDeObra: 200000, materiales: 150000, contratistas: 100000, equipos: 80000 },
        { month: "05 Sep", manoDeObra: 250000, materiales: 180000, contratistas: 120000, equipos: 90000 },
        { month: "10 Sep", manoDeObra: 300000, materiales: 220000, contratistas: 150000, equipos: 110000 },
        { month: "15 Sep", manoDeObra: 350000, materiales: 280000, contratistas: 180000, equipos: 130000 },
        { month: "20 Sep", manoDeObra: 400000, materiales: 320000, contratistas: 200000, equipos: 150000 },
        { month: "25 Sep", manoDeObra: 450000, materiales: 350000, contratistas: 220000, equipos: 170000 },
        { month: "30 Sep", manoDeObra: 500000, materiales: 380000, contratistas: 240000, equipos: 190000 }
    ]
};

const formatNumber = (amount: number) => {
    return new Intl.NumberFormat('es-MX').format(amount);
};

export default function HomePage() {
    const [selectedTorre, setSelectedTorre] = useState("Torre G");
    const [selectedAnalisis, setSelectedAnalisis] = useState("Por partida");
    const [selectedPeriodo, setSelectedPeriodo] = useState("Mensual");

    const data = useQuery(api.partida.getByFamily, { family: "ACERO" })

    if (!data) return <p>No data available</p>

    return (
        <div className="bg-white p-6">
            <div className="max-w-full mx-auto space-y-6">
                {/* Header */}
                <div className="rounded-lg py-6">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col text-left">
                            <p className="text-sm text-gray-500 mb-1">{mockData.project.type}</p>
                            <h1 className="text-2xl font-bold text-gray-900">{mockData.project.name}</h1>
                        </div>
                    </div>
                </div>

                {/* Main Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Presupuesto Aprobado */}
                    <Card className="bg-transparent">
                        <CardContent className="p-6 text-left">
                            <div className="space-y-2">
                                <p className="text-sm text-gray-500">Presupuesto aprobado</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-3xl font-bold text-gray-900">
                                        ${formatNumber(mockData.metrics.presupuestoAprobado.amount)}
                                    </span>
                                    {/* <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        {mockData.metrics.presupuestoAprobado.percentage}%
                                    </Badge> */}
                                </div>

                                <p className="text-sm text-gray-500">
                                    {/* ${formatNumber(mockData.metrics.presupuestoAprobado.comparison)} <Badge variant="secondary" className="bg-green-100 text-green-800 rounded-xl border-green-800">{mockData.metrics.presupuestoAprobado.comparisonLabel}</Badge> */}
                                    ${formatNumber(mockData.metrics.presupuestoAprobado.comparison)} <Badge variant="secondary" className="bg-green-100 text-green-800 rounded-xl border-green-800">{mockData.metrics.presupuestoAprobado.percentage}%</Badge>
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Gasto Total */}
                    <Card className="bg-white">
                        <CardContent className="p-6 text-left">
                            <div className="space-y-2">
                                <p className="text-sm text-gray-500">Gasto total</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-3xl font-bold text-red-600">
                                        ${formatNumber(mockData.metrics.gastoTotal.amount)}
                                    </span>
                                    {/* <Badge variant="secondary" className="bg-red-100 text-red-800">
                                        {mockData.metrics.gastoTotal.percentage}%
                                    </Badge> */}
                                </div>
                                <Badge variant="secondary" className="text-sm text-gray-500 rounded-xl border-gray-400">{mockData.metrics.gastoTotal.percentage}%</Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Por Gastar */}
                    <Card className="bg-white">
                        <CardContent className="p-6 text-left">
                            <div className="space-y-2">
                                <p className="text-sm text-gray-500">Por gastar</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-3xl font-bold text-green-600">
                                        ${formatNumber(mockData.metrics.porGastar.amount)}
                                    </span>
                                    {/* <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        {mockData.metrics.porGastar.percentage}%
                                    </Badge> */}
                                </div>
                                <Badge variant="secondary" className="text-sm text-gray-500 rounded-xl border-gray-400">{mockData.metrics.porGastar.comparisonLabel}</Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <Card className="bg-white">
                    <CardContent className="p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <span className="text-sm font-medium">🔍</span>
                                    <Select value={selectedTorre} onValueChange={setSelectedTorre}>
                                        <SelectTrigger className="w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {mockData.filters.torres.map((torre) => (
                                                <SelectItem key={torre} value={torre}>
                                                    {torre}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <span className="text-sm text-gray-500">Análisis</span>
                                    <Select value={selectedAnalisis} onValueChange={setSelectedAnalisis}>
                                        <SelectTrigger className="w-40">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {mockData.filters.analisis.map((analisis) => (
                                                <SelectItem key={analisis} value={analisis}>
                                                    {analisis}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <span className="text-sm text-gray-500">Rango de fecha</span>
                                    <Select value={selectedPeriodo} onValueChange={setSelectedPeriodo}>
                                        <SelectTrigger className="w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {mockData.filters.periodos.map((periodo) => (
                                                <SelectItem key={periodo} value={periodo}>
                                                    {periodo}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-500">Fecha</span>
                                <span className="text-sm font-medium">Septiembre</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Secondary Metrics and Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Secondary Metrics */}



                    {/* Chart Area */}
                    <div className="lg:col-span-4 space-y-4">
                        {/* TEST */}
                        <div className="space-y-4 grid grid-cols-3 gap-4">
                            <Card className="bg-white">
                                <CardContent className="p-4">
                                    <div className="space-y-1">
                                        <p className="text-sm text-gray-500">Gasto</p>
                                        <p className="text-xl font-bold">${formatNumber(mockData.secondaryMetrics.gasto)}</p>
                                        <p className="text-xs text-gray-400">10</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white">
                                <CardContent className="p-4">
                                    <div className="space-y-1">
                                        <p className="text-sm text-gray-500">Por vencer</p>
                                        <p className="text-xl font-bold">${formatNumber(mockData.secondaryMetrics.porVencer)}</p>
                                        <p className="text-xs text-gray-400">10</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white">
                                <CardContent className="p-4">
                                    <div className="space-y-1">
                                        <p className="text-sm text-gray-500">Honorarios</p>
                                        <p className="text-xl font-bold">${formatNumber(mockData.secondaryMetrics.honorarios)}</p>
                                        <p className="text-xs text-gray-400">10</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="bg-white h-96">
                            <CardContent className="p-6 h-full">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center space-x-4">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                            <span className="text-sm text-gray-600">Mano de obra</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                            <span className="text-sm text-gray-600">Materiales</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                            <span className="text-sm text-gray-600">Contratistas</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                            <span className="text-sm text-gray-600">Equipos y acabados</span>
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        1er Sept 2024 - $1,200,001
                                    </div>
                                </div>

                                {/* Placeholder for chart - will be replaced with actual chart component */}
                                <div className="w-full h-full">
                                    <AreaChart data={mockData.chartData} />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="col-span-4">
                        <DashboardTable data={data} />
                    </div>
                </div>
            </div>
        </div>
    );
}
