import { useState, useEffect } from "react";
import React from "react";
import { api } from "../../../convex/_generated/api";
import {
    // useMutation,    
    useQuery
} from "convex/react";
import { Doc } from "convex/_generated/dataModel";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AreaChart from "@/components/Charts/AreaChart";
import { DashboardTable } from "../Dashboard/Table";
import { Search, Plus } from "lucide-react";
import { useAddPartidaModal } from "@/hooks/add-partida-modal";

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
    const [selectedProject, setSelectedProject] = useState<Doc<"desarrollos"> | undefined>(undefined)
    const [selectedAnalisis, setSelectedAnalisis] = useState("Por partida");
    const [selectedPeriodo, setSelectedPeriodo] = useState("Mensual");
    
    // Add partida modal
    const addPartidaModal = useAddPartidaModal();



    // const createPayment = useMutation(api.pagos.create);

    // Fetch projects
    const projects = useQuery(api.desarrollos.getAll);

    // Set default project when projects load
    useEffect(() => {
        if (projects && projects.length > 0 && !selectedProject) {
            setSelectedProject(projects[0]);
        }
    }, [projects, selectedProject]);

    // Fetch metrics
    const metrics = useQuery(api.partida.getProjectMetrics, selectedProject ? { projectId: selectedProject._id } : "skip");

    // Fetch all partidas for the table (table shows individual records)
    const allPartidas = useQuery(
        api.partida.getByProject,
        selectedProject ? { projectId: selectedProject._id } : "skip"
    );

    // Calculate secondary metrics from allPartidas
    const secondaryMetrics = {
        gasto: allPartidas?.reduce((sum, p) => sum + parseFloat(p.pagado || "0"), 0) || 0,
        porVencer: allPartidas?.reduce((sum, p) => sum + parseFloat(p.por_liquidar || "0"), 0) || 0,
        honorarios: allPartidas?.filter(p => p.familia === "HONORARIOS").reduce((sum, p) => sum + parseFloat(p.pagado || "0"), 0) || 0
    };

    // Get unique familias for the legend and chart
    const uniqueFamilias = Array.from(new Set(allPartidas?.map(p => p.familia) || []));

    // Define colors for each familia
    const familiaColors: Record<string, string> = {
        "ACERO": "#60A5FA",
        "CONCRETO": "#34D399",
        "MATERIALES": "#FB923C",
        "MANO DE OBRA": "#F87171",
        "EQUIPOS": "#A78BFA",
        "HONORARIOS": "#FBBF24"
    };

    // Get color for familia (with fallback)
    const getColorForFamilia = (familia: string, index: number) => {
        return familiaColors[familia] || `hsl(${index * 137.5}, 70%, 60%)`;
    };

    // Transform data for chart - create cumulative view across time
    const chartData = React.useMemo(() => {
        if (!allPartidas || allPartidas.length === 0) return [];

        // Sort partidas by creation time or by index to create a progression
        const sortedPartidas = [...allPartidas].sort((a, b) => {
            return a._creationTime - b._creationTime;
        });

        // Create time periods (distribute across dates for visualization)
        const numPoints = Math.min(sortedPartidas.length, 10); // Show max 10 data points
        const partidasPerPoint = Math.ceil(sortedPartidas.length / numPoints);
        
        const baseDate = new Date('2024-09-01'); // Start date for visualization
        const dataPoints: { date: string; [key: string]: string | number }[] = [];

        for (let i = 0; i < numPoints; i++) {
            const startIdx = i * partidasPerPoint;
            const endIdx = Math.min(startIdx + partidasPerPoint, sortedPartidas.length);

            // Calculate cumulative totals up to this point
            const cumulativePartidas = sortedPartidas.slice(0, endIdx);
            const familiasTotals: Record<string, number> = {};

            cumulativePartidas.forEach(partida => {
                const familia = partida.familia || 'Otros';
                if (!familiasTotals[familia]) {
                    familiasTotals[familia] = 0;
                }
                familiasTotals[familia] += parseFloat(partida.pagado || "0");
            });

            // Create date label (spread across the month)
            const dayOffset = Math.floor((i / numPoints) * 30);
            const pointDate = new Date(baseDate);
            pointDate.setDate(baseDate.getDate() + dayOffset);
            const dateLabel = pointDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

            const dataPoint: { date: string; [key: string]: string | number } = { date: dateLabel };
            uniqueFamilias.forEach(familia => {
                dataPoint[familia] = familiasTotals[familia] || 0;
            });
            dataPoints.push(dataPoint);
        }

        return dataPoints;
    }, [allPartidas, uniqueFamilias]);

    if (!projects || !metrics) {
        return <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
            <p className="text-gray-500">Cargando datos...</p>
        </div>;
    }

    // console.log('Metrics:', metrics);
    // console.log('All Partidas:', allPartidas);
    // console.log('Chart Data:', chartData);

    return (
        <div className="bg-white px-12 py-6">
            <div className="max-w-full mx-auto space-y-6">
                {/* Header */}
                <div className="rounded-lg py-6">
                    <div className="flex items-start justify-between">
                        {selectedProject && (
                            <div className="flex flex-col text-left">
                                <p className="text-sm text-gray-500 mb-1">Proyecto</p>
                                <h1 className="text-2xl text-gray-900">{selectedProject.nombre}</h1>
                            </div>
                        )}
                        {selectedProject && (
                            <Button
                                onClick={() => addPartidaModal.onOpen({
                                    proyecto: selectedProject._id,
                                    projectName: selectedProject.nombre
                                })}
                                variant="outline"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Agregar Partida
                            </Button>
                        )}
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
                                        ${formatNumber(Math.round(metrics.presupuestoAprobado))}
                                    </span>
                                </div>

                                {/* <div className="text-lg text-gray-500">
                                    <span className="text-sm text-gray-400">Total partidas: {metrics.totalPartidas}</span>
                                </div> */}
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
                                        ${formatNumber(Math.round(metrics.gastoTotal))}
                                    </span>
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                                    Avance {metrics.presupuestoAprobado > 0 ? Math.round((metrics.gastoTotal / metrics.presupuestoAprobado) * 100) : 0}%
                                </Badge>
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
                                        ${formatNumber(Math.round(metrics.porGastar))}
                                    </span>
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                                    Pendiente {metrics.presupuestoAprobado > 0 ? Math.round((metrics.porGastar / metrics.presupuestoAprobado) * 100) : 0}%
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <div className="bg-white">

                    <div className="grid grid-cols-4 items-center space-x-12">
                        <div className="flex items-center space-x-3 text-left border-b border-gray-600 py-4 h-full">
                            <Search className="w-4 h-4 text-gray-400" />
                            <Select defaultValue={selectedProject?._id} value={selectedProject?._id}
                                onValueChange={(value) => {
                                    const project = projects?.find(p => p._id === value);
                                    setSelectedProject(project);
                                }}>
                                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
                                    <SelectValue placeholder="Selecciona un proyecto" />
                                </SelectTrigger>
                                <SelectContent>
                                    {projects?.map((project) => (
                                        <SelectItem key={project._id} value={project._id}>
                                            {project.nombre}
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
                                <div className="flex items-start justify-between mb-8 gap-4">
                                    <div className="flex items-center space-x-12">
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Gasto</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.gasto))}</p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Por vencer</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.porVencer))}</p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Honorarios</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.honorarios))}</p>
                                        </div>
                                    </div>

                                    {/* Legend - Dynamic based on familias */}
                                    <div className="flex items-center space-x-6 flex-wrap">
                                        {uniqueFamilias.map((familia, index) => (
                                            <div key={familia} className="flex items-center space-x-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: getColorForFamilia(familia, index) }}
                                                ></div>
                                                <span className="text-sm text-gray-600">{familia}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Chart */}
                                <div className="w-full h-80">
                                    <AreaChart data={chartData.length > 0 ? chartData : mockData.chartData} />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="col-span-4 py-12">
                        <DashboardTable data={allPartidas || []} />
                    </div>
                </div>
            </div>
        </div>
    );
}
