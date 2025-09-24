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
import { Search } from "lucide-react";

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
            comparisonLabel: "Pendiente 77%"
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
        { month: "01 Sep", manoDeObra: 200000, materiales: 150000, contratistas: 100000, equipos: 80000, date: "01 Sep" },
        { month: "05 Sep", manoDeObra: 250000, materiales: 180000, contratistas: 120000, equipos: 90000, date: "05 Sep" },
        { month: "10 Sep", manoDeObra: 300000, materiales: 220000, contratistas: 150000, equipos: 110000, date: "10 Sep" },
        { month: "15 Sep", manoDeObra: 350000, materiales: 280000, contratistas: 180000, equipos: 130000, date: "15 Sep" },
        { month: "20 Sep", manoDeObra: 400000, materiales: 320000, contratistas: 200000, equipos: 150000, date: "20 Sep" },
        { month: "25 Sep", manoDeObra: 450000, materiales: 350000, contratistas: 220000, equipos: 170000, date: "25 Sep" },
        { month: "30 Sep", manoDeObra: 500000, materiales: 380000, contratistas: 240000, equipos: 190000, date: "30 Sep" }
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
        <div className="bg-white px-12 py-6">
            <div className="max-w-full mx-auto space-y-6">
                {/* Header */}
                <div className="rounded-lg py-6">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col text-left">
                            <p className="text-sm text-gray-500 mb-1">{mockData.project.type}</p>
                            <h1 className="text-2xl text-gray-900">{mockData.project.name}</h1>
                        </div>
                    </div>
                </div>

                {/* Main Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 w-full xl:w-3/4">
                    {/* Presupuesto Aprobado */}
                    <Card className="bg-transparent shadow-none border-none">
                        <CardContent className="pl-0 text-left">
                            <div className="space-y-2">
                                <p className="text-xs text-gray-500">Presupuesto aprobado</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-4xl text-gray-900">
                                        ${formatNumber(mockData.metrics.presupuestoAprobado.amount)}
                                    </span>
                                    {/* <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        {mockData.metrics.presupuestoAprobado.percentage}%
                                    </Badge> */}
                                </div>

                                <p className="text-lg text-gray-500">
                                    {/* ${formatNumber(mockData.metrics.presupuestoAprobado.comparison)} <Badge variant="secondary" className="bg-green-100 text-green-800 rounded-xl border-green-800">{mockData.metrics.presupuestoAprobado.comparisonLabel}</Badge> */}
                                    ${formatNumber(mockData.metrics.presupuestoAprobado.comparison)} <Badge variant="secondary" className="ml-6 bg-green-100 text-green-800 rounded-xl border-green-800 text-[10px] font-normal py-1.5 leading-none">
                                        <span>Reducción {mockData.metrics.presupuestoAprobado.percentage}%</span>
                                    </Badge>
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Gasto Total */}
                    <Card className="bg-white shadow-none border-none">
                        <CardContent className="pl-0 text-left">
                            <div className="space-y-2">
                                <p className="text-xs text-gray-500">Gasto total</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-4xl text-[#802424]">
                                        ${formatNumber(mockData.metrics.gastoTotal.amount)}
                                    </span>
                                    {/* <Badge variant="secondary" className="bg-red-100 text-red-800">
                                        {mockData.metrics.gastoTotal.percentage}%
                                    </Badge> */}
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">Avance {mockData.metrics.gastoTotal.percentage}%</Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Por Gastar */}
                    <Card className="bg-white shadow-none border-none">
                        <CardContent className="pl-0 text-left">
                            <div className="space-y-2">
                                <p className="text-xs text-gray-500">Por gastar</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-4xl text-[#1A5D21]">
                                        ${formatNumber(mockData.metrics.porGastar.amount)}
                                    </span>
                                    {/* <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        {mockData.metrics.porGastar.percentage}%
                                    </Badge> */}
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">{mockData.metrics.porGastar.comparisonLabel}</Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <div className="bg-white">

                    <div className="grid grid-cols-4 items-center space-x-12">
                        <div className="flex items-center space-x-3 text-left border-b border-gray-600 py-4 h-full">
                            <Search className="w-4 h-4 text-gray-400" />
                            <Select value={selectedTorre} onValueChange={setSelectedTorre}>
                                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
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

                        <div className="flex flex-col space-y-1 text-left border-b border-gray-600 py-4">
                            <span className="text-xs text-gray-500">Análisis</span>
                            <Select value={selectedAnalisis} onValueChange={setSelectedAnalisis}>
                                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
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

                        <div className="flex flex-col space-y-1 text-left border-b border-gray-600 py-4">
                            <span className="text-xs text-gray-500">Rango de fecha</span>
                            <Select value={selectedPeriodo} onValueChange={setSelectedPeriodo}>
                                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
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

                        <div className="flex flex-col space-y-1 text-left border-b border-gray-600 py-4">
                            <span className="text-xs text-gray-500">Fecha</span>
                            <span className="text-sm font-normal text-gray-900">Septiembre</span>
                        </div>
                    </div>

                </div>

                {/* Secondary Metrics and Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Chart Area with integrated metrics */}
                    <div className="lg:col-span-4">
                        <Card className="bg-white border-none shadow-none">
                            <CardContent className="px-0 pt-12 pb-0">
                                {/* Metrics Row */}
                                <div className="flex items-start justify-between mb-8">
                                    <div className="flex items-center space-x-12">
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Gasto</p>
                                            <p className="text-3xl">${formatNumber(mockData.secondaryMetrics.gasto)}<span className="text-sm font-normal text-gray-500">.10</span></p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Por vencer</p>
                                            <p className="text-3xl">${formatNumber(mockData.secondaryMetrics.porVencer)}<span className="text-sm font-normal text-gray-500">.10</span></p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Honorarios</p>
                                            <p className="text-3xl">${formatNumber(mockData.secondaryMetrics.honorarios)}<span className="text-sm font-normal text-gray-500">.10</span></p>
                                        </div>
                                    </div>

                                    {/* Legend */}
                                    <div className="flex items-center space-x-6">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                                            <span className="text-sm text-gray-600">Mano de obra</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                                            <span className="text-sm text-gray-600">Materiales</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-orange-400 rounded-full"></div>
                                            <span className="text-sm text-gray-600">Contratistas</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                                            <span className="text-sm text-gray-600">Equipos y acabados</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Chart */}
                                <div className="w-full h-80">
                                    <AreaChart data={mockData.chartData} />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    {/* <div className="col-span-4 py-12"> */}
                    <DashboardTable data={[]} />
                    {/* </div> */}
                </div>
            </div>
        </div>
    );
}
