import { useState } from "react";
import { useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import {
    useQuery,
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
// import { Button } from "@/components/ui/button";
import ProgressChart from "@/components/Charts/ProgressChart";
import FamiliaChart from "@/components/Charts/FamiliaChart";
import AutorizacionesObraPage from "../AutorizacionesObra/AutorizacionesObraPage";
import { cn } from "@/lib/utils";
import ChartConfigModal from "@/components/Charts/ChartConfigModal";
import { useChartConfig } from "@/hooks/useChartConfig";
// import { Plus } from "lucide-react";
// import { useAddPartidaModal } from "@/hooks/add-partida-modal";

import { Id } from "convex/_generated/dataModel";

// Mockup data
const mockData = {
    filters: {
        // rango_fechas: ["Ultimos 7 dias", "Ultimos 30 dias", "Ultimos 60 dias", "Ultimos 90 dias", "Ultimos 180 dias", "Ultimos 365 dias", "Todo el tiempo"],
        rango_fechas: ["Ultimos 30 dias", "Ultimos 60 dias", "Ultimos 90 dias", "Ultimos 180 dias", "Ultimos 365 dias", "Todo el tiempo"],
        periodos: ["Mensual", "Semanal", "Diario"]
    },

};

const formatNumber = (amount: number) => {
    return new Intl.NumberFormat('es-MX').format(amount);
};


export default function ControlPage() {
    const { proyectoId } = useParams<{ proyectoId: string }>();

    // Tab state
    const [activeTab, setActiveTab] = useState<"permisos" | "presupuestos" | "imss">("permisos");

    // Progress chart filters    
    const [selectedPeriodo, setSelectedPeriodo] = useState("Diario");
    const [selectedRangoFecha, setSelectedRangoFecha] = useState("Todo el tiempo");

    // Modal state
    const [activeChartId, setActiveChartId] = useState<string | null>(null);

    // Persistent chart configurations
    const chart1Config = useChartConfig({
        proyectoId: proyectoId as Id<"desarrollos">,
        chartId: "control-chart-1",
        defaultConfig: {
            title: "Gasto Mano de Obra",
            color: "#3B82F6",
            height: 300,
            familias: [],
        },
    });

    const chart2Config = useChartConfig({
        proyectoId: proyectoId as Id<"desarrollos">,
        chartId: "control-chart-2",
        defaultConfig: {
            title: "Indirectos",
            color: "#10B981",
            height: 300,
            familias: [],
        },
    });

    // Add partida modal
    // const addPartidaModal = useAddPartidaModal();

    // const createPayment = useMutation(api.pagos.create);
    // Fetch current project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

    // Fetch metrics from meticas_presupuesto (same as PresupuestoPage)
    const budgetMetrics = useQuery(
        api.meticas_presupuesto.getByProyecto,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    // Fetch all partidas for the table with pagination
    // const { results: allPartidas } = usePaginatedQuery(
    //     api.partida.getByProjectPaginated,
    //     proyectoId ? { projectId: proyectoId as Id<"desarrollos"> } : "skip",
    //     { initialNumItems: 100 }
    // );

    // Fetch progress chart data
    const progressChartData = useQuery(
        api.transacciones.getProgressChartData,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    // Fetch data for chart 1 based on its persisted configuration
    const chart1Data = useQuery(
        api.transacciones.getFamiliaChartData,
        proyectoId && !chart1Config.isLoading
            ? {
                proyecto_id: proyectoId as Id<"desarrollos">,
                partidas: chart1Config.config.partidas,
                familias: chart1Config.config.familias,
                sub_partidas: chart1Config.config.sub_partidas,
            }
            : "skip"
    );


    // Fetch data for chart 2 based on its persisted configuration
    const chart2Data = useQuery(
        api.transacciones.getFamiliaChartData,
        proyectoId && !chart2Config.isLoading
            ? {
                proyecto_id: proyectoId as Id<"desarrollos">,
                partidas: chart2Config.config.partidas,
                familias: chart2Config.config.familias,
                sub_partidas: chart2Config.config.sub_partidas,
            }
            : "skip"
    );

    // Fetch filtered metrics based on selected date range
    const filteredMetrics = useQuery(
        api.meticas_presupuesto.getFilteredMetrics,
        proyectoId
            ? {
                proyecto_id: proyectoId as Id<"desarrollos">,
                rango_fechas: selectedRangoFecha,
            }
            : "skip"
    );

    // Get current chart config for modal
    const getActiveChartConfig = () => {
        if (activeChartId === "control-chart-1") return chart1Config;
        if (activeChartId === "control-chart-2") return chart2Config;
        return null;
    };

    const activeConfig = getActiveChartConfig();

    // Use filtered metrics from query instead of calculating locally
    const secondaryMetrics = {
        gasto: filteredMetrics?.gasto || 0,
        porVencer: filteredMetrics?.por_ejercer || 0,
        honorarios: filteredMetrics?.honorarios || 0
    };



    if (!proyecto || !budgetMetrics) {
        return <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
            <p className="text-gray-500">Cargando datos...</p>
        </div>;
    }

    return (
        <div className="bg-white px-12 py-6">
            <div className="max-w-full mx-auto space-y-6">
                {/* Header */}
                <div className="rounded-lg py-6">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col text-left">
                            <p className="text-sm text-gray-500 mb-1">Proyecto</p>
                            <h1 className="text-2xl text-gray-900">{proyecto.nombre}</h1>
                        </div>
                        {/* {selectedDesarrollo && (
                            <Button
                                onClick={() => addPartidaModal.onOpen({
                                    proyecto: selectedDesarrollo._id,
                                    projectName: selectedDesarrollo.nombre
                                })}
                                variant="outline"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Agregar Partida
                            </Button>
                        )} */}
                    </div>
                </div>

                {/* Main Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 w-full xl:w-3/4">
                    {/* Presupuesto Aprobado */}
                    <Card className="bg-transparent shadow-none border-none">
                        <CardContent className="pl-0 text-left">
                            <div className="space-y-2">
                                <p className="text-xs text-[#777770]">Presupuesto aprobado</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-4xl text-gray-900">
                                        ${formatNumber(Math.round(budgetMetrics.presupuesto_aprobado || 0))}
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
                                <p className="text-xs text-[#777770]">Gasto total</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-4xl text-[#802424]">
                                        ${formatNumber(Math.round(budgetMetrics.gasto_total || 0))}
                                    </span>
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                                    Avance {budgetMetrics.presupuesto_aprobado > 0 ? Math.round((budgetMetrics.gasto_total / budgetMetrics.presupuesto_aprobado) * 100) : 0}%
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Por Gastar */}
                    <Card className="bg-white shadow-none border-none">
                        <CardContent className="pl-0 text-left">
                            <div className="space-y-2">
                                <p className="text-xs text-[#777770]">Por gastar</p>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-4xl text-[#4CC684]">
                                        ${formatNumber(Math.round(budgetMetrics.por_gastar || 0))}
                                    </span>
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                                    Pendiente {budgetMetrics.presupuesto_aprobado > 0 ? Math.round((budgetMetrics.por_gastar / budgetMetrics.presupuesto_aprobado) * 100) : 0}%
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <div className="bg-white">
                    <div className="grid grid-cols-3 items-center space-x-12">
                        <div className="flex flex-col items-start space-y-1 text-left border-b border-[#AFAEA2] py-2 h-full">
                            <span className="text-xs text-gray-500">Proyecto</span>
                            <div className="text-gray-900">{proyecto.nombre}</div>
                        </div>

                        <div className="flex flex-col space-y-1 text-left border-b border-[#AFAEA2] py-2">
                            <span className="text-xs text-gray-500">Rango de fecha</span>
                            <Select value={selectedRangoFecha} onValueChange={setSelectedRangoFecha}>
                                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {mockData.filters.rango_fechas.map((periodo) => (
                                        <SelectItem key={periodo} value={periodo}>
                                            {periodo}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col space-y-1 text-left border-b border-[#AFAEA2] py-2">
                            <span className="text-xs text-gray-500">Periodo</span>
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


                    </div>

                </div>

                {/* Secondary Metrics and Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Chart Area with integrated metrics */}
                    <div className="lg:col-span-4 py-8 px-10 border rounded-md bg-[#fcfcfc]">

                        {/* New Progress Chart Section */}

                        <Card className="bg-transparent border-none shadow-none">
                            <CardContent className="p-0">
                                {/* Metrics Row */}
                                <div className="flex items-start justify-between mb-8 gap-4">
                                    <div className="flex items-center space-x-12">
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-[#5A5A50]">Gasto</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.gasto))}</p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-[#5A5A50]">Por ejercer</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.porVencer))}</p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-[#5A5A50]">Honorarios</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.honorarios))}</p>
                                        </div>
                                    </div>

                                    {/* Legend for Progress Chart */}
                                    <div className="flex items-center space-x-6 flex-wrap text-xs">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#BFCFDC' }}></div>
                                            <span className=" text-gray-600 leading-none">Gasto Proyectado</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#79AAAF' }}></div>
                                            <span className=" text-gray-600 leading-none">Gasto Real</span>
                                        </div>
                                        {/* <div className="flex items-center space-x-2">
                                            <div className="w-8 h-0.5 border-t-2 border-dashed border-gray-500"></div>
                                            <span className=" text-gray-600">Avance %</span>
                                        </div> */}
                                    </div>
                                </div>

                                {/* Progress Chart */}
                                <div className="w-full h-64">
                                    {(
                                        <ProgressChart
                                            data={progressChartData || []}
                                            proyectoId={proyectoId as Id<"desarrollos">}
                                            selectedPeriodo={selectedPeriodo}
                                            selectedRangoFecha={selectedRangoFecha}
                                        />
                                    )}
                                </div>
                            </CardContent>
                        </Card>


                    </div>

                    {/* Familia Charts - Configurable charts with persistent user settings */}
                    <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        {/* Chart 1 - Mano de Obra */}
                        {chart1Config.isLoading ? (
                            <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                                <p className="text-gray-500">Cargando configuración...</p>
                            </div>
                        ) : (
                            <FamiliaChart
                                chartId="control-chart-1"
                                data={chart1Data?.dataPoints || []}
                                title={chart1Config.config.title}
                                total={chart1Data?.total || 0}
                                color={chart1Config.config.color}
                                height={chart1Config.config.height}
                                partidas={chart1Config.config.partidas}
                                familias={chart1Config.config.familias}
                                sub_partidas={chart1Config.config.sub_partidas}
                                onConfigClick={() => setActiveChartId("control-chart-1")}
                            />
                        )}

                        {/* Chart 2 - Indirectos */}
                        {chart2Config.isLoading ? (
                            <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                                <p className="text-gray-500">Cargando configuración...</p>
                            </div>
                        ) : (
                            <FamiliaChart
                                chartId="control-chart-2"
                                data={chart2Data?.dataPoints || []}
                                title={chart2Config.config.title}
                                total={chart2Data?.total || 0}
                                color={chart2Config.config.color}
                                height={chart2Config.config.height}
                                partidas={chart2Config.config.partidas}
                                familias={chart2Config.config.familias}
                                sub_partidas={chart2Config.config.sub_partidas}
                                onConfigClick={() => setActiveChartId("control-chart-2")}
                            />
                        )}
                    </div>

                    {/* Tabs Section */}
                    <div className="col-span-4">

                        {/* Tab Content */}
                        <div className="">
                            {activeTab === "permisos" && (
                                <AutorizacionesObraPage embedded />
                            )}
                            {activeTab === "presupuestos" && (
                                <div className="py-12 text-center text-gray-400">
                                    <p className="text-lg">Presupuestos y contratos</p>
                                    <p className="text-sm mt-1">Próximamente</p>
                                </div>
                            )}
                            {activeTab === "imss" && (
                                <div className="py-12 text-center text-gray-400">
                                    <p className="text-lg">IMSS y SIROC</p>
                                    <p className="text-sm mt-1">Próximamente</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Persistent Configuration Modal */}
            {activeChartId && activeConfig && proyectoId && (
                <ChartConfigModal
                    isOpen={true}
                    onClose={() => setActiveChartId(null)}
                    proyectoId={proyectoId as Id<"desarrollos">}
                    chartId={activeChartId}
                    currentConfig={activeConfig.config}
                    onSave={activeConfig.saveConfig}
                    onReset={activeConfig.resetConfig}
                />
            )}
        </div>
    );
}
