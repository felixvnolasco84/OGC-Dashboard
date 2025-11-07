import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import {
    useQuery,
    usePaginatedQuery
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
import { DashboardTable } from "../Dashboard/Table";
import FamiliaChartConfigModal from "@/components/modals/FamiliaChartConfigModal";
import { useFamiliaChartConfigModal, FamiliaChartConfig } from "@/hooks/familia-chart-config-modal";
// import { Plus } from "lucide-react";
// import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { Id } from "convex/_generated/dataModel";

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
        rango_fechas: ["Ultimos 7 dias", "Ultimos 30 dias", "Ultimos 60 dias", "Ultimos 90 dias", "Ultimos 180 dias", "Ultimos 365 dias", "Todo el tiempo"],
        periodos: ["Mensual", "Semanal", "Diario"]
    },

};

const formatNumber = (amount: number) => {
    return new Intl.NumberFormat('es-MX').format(amount);
};


export default function ControlPage() {
    const { proyectoId } = useParams<{ proyectoId: string }>();

    // Progress chart filters    
    const [selectedPeriodo, setSelectedPeriodo] = useState("Diario");
    const [selectedRangoFecha, setSelectedRangoFecha] = useState("Ultimos 30 dias");
    
    // Chart configurations state
    const [chartConfigs, setChartConfigs] = useState<Record<string, FamiliaChartConfig>>({
        chart1: {
            chartId: "chart1",
            title: "Gasto Mano de Obra",
            color: "#3B82F6",
            partidas: [],
            familias: ["ALBAÑILERÍAS"],
            sub_partidas: [],
        },
        chart2: {
            chartId: "chart2",
            title: "Indirectos",
            color: "#10B981",
            partidas: [],
            familias: ["HONORARIOS"],
            sub_partidas: [],
        },
    });
    
    const { open: openConfigModal } = useFamiliaChartConfigModal();

    // Add partida modal
    // const addPartidaModal = useAddPartidaModal();

    // const createPayment = useMutation(api.pagos.create);
    // Fetch current project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");
    
    // Fetch metrics
    const metrics = useQuery(api.partida.getProjectMetrics, proyectoId ? { projectId: proyectoId as Id<"desarrollos"> } : "skip");

    // Fetch all partidas for the table with pagination
    const { results: allPartidas } = usePaginatedQuery(
        api.partida.getByProjectPaginated,
        proyectoId ? { projectId: proyectoId as Id<"desarrollos"> } : "skip",
        { initialNumItems: 100 }
    );

    // Fetch progress chart data
    const progressChartData = useQuery(
        api.transacciones.getProgressChartData,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    // Extract available options from all partidas for the modal
    const availableOptions = useMemo(() => {
        if (!allPartidas) return { availablePartidas: [], availableFamilias: [], availableSubPartidas: [] };
        
        const partidasSet = new Set<string>();
        const familiasSet = new Set<string>();
        const subPartidasSet = new Set<string>();
        
        allPartidas.forEach(p => {
            if (p.nombre) partidasSet.add(p.nombre);
            if (p.partida_nombre) partidasSet.add(p.partida_nombre);
            if (p.familia) familiasSet.add(p.familia);
            if (p.sub_partida) subPartidasSet.add(p.sub_partida);
        });
        
        return {
            availablePartidas: Array.from(partidasSet).filter(Boolean).sort(),
            availableFamilias: Array.from(familiasSet).filter(Boolean).sort(),
            availableSubPartidas: Array.from(subPartidasSet).filter(Boolean).sort(),
        };
    }, [allPartidas]);

    // Build query parameters from chart configs
    const getQueryParams = (config: FamiliaChartConfig) => {
        if (!proyectoId) return "skip" as const;
        
        const params: {
            proyecto_id: Id<"desarrollos">;
            partidas?: string[];
            familias?: string[];
            sub_partidas?: string[];
        } = {
            proyecto_id: proyectoId as Id<"desarrollos">,
        };
        
        if (config.partidas.length > 0) {
            params.partidas = config.partidas;
        }
        if (config.familias.length > 0) {
            params.familias = config.familias;
        }
        if (config.sub_partidas.length > 0) {
            params.sub_partidas = config.sub_partidas;
        }
        
        return params;
    };

    // Fetch data for each chart based on its configuration
    const chart1Data = useQuery(
        api.transacciones.getFamiliaChartData,
        getQueryParams(chartConfigs.chart1)
    );


    console.log("chart1Data", chart1Data);

    // RESPONSE EXAMPLE FROM API CHART1DATA
//     {
//     "dataPoints": [
//         {
//             "date": "2025-11-06 Ene",
//             "monto": 12000
//         },
//         {
//             "date": "2025-11-06 Ene",
//             "monto": 24000
//         }
//     ],
//     "total": 24000
// }

    const chart2Data = useQuery(
        api.transacciones.getFamiliaChartData,
        getQueryParams(chartConfigs.chart2)
    );
    
    // Handle config updates from modal
    const handleConfigSave = (config: FamiliaChartConfig) => {
        setChartConfigs(prev => ({
            ...prev,
            [config.chartId]: config,
        }));
    };
    
    // Handle opening config modal for a specific chart
    const handleOpenConfig = (chartId: string) => {
        const config = chartConfigs[chartId];
        if (config) {
            openConfigModal(config, availableOptions);
        }
    };


    const por_liquidar = allPartidas?.reduce((sum, p) => sum + p.presupuesto_aprobado || 0, 0) || 0;
    // Calculate secondary metrics from allPartidas
    const secondaryMetrics = {
        gasto: allPartidas?.reduce((sum, p) => sum + p.pagado || 0, 0) || 0,
        porVencer: por_liquidar,
        honorarios: allPartidas?.filter(p => p.familia === "HONORARIOS").reduce((sum, p) => sum + p.pagado || 0, 0) || 0
    };



    if (!proyecto || !metrics) {
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
                    <div className="grid grid-cols-3 items-center space-x-12">
                        <div className="flex items-center space-x-3 text-left border-b border-gray-600 py-4 h-full">
                            <div className="text-gray-900">{proyecto.nombre}</div>
                        </div>

                        <div className="flex flex-col space-y-1 text-left border-b border-gray-600 py-4">
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

                        <div className="flex flex-col space-y-1 text-left border-b border-gray-600 py-4">
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
                    <div className="lg:col-span-4 p-4 border rounded-md bg-[#F7F7F7]">

                        {/* New Progress Chart Section */}

                        <Card className="bg-transparent border-none shadow-none">
                            <CardContent className="px-0 pt-4 pb-0">
                                {/* Metrics Row */}
                                <div className="flex items-start justify-between mb-8 gap-4">
                                    <div className="flex items-center space-x-12">
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Gasto</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.gasto))}<span className="text-sm text-gray-400">.10</span></p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Por ejercer</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.porVencer))}<span className="text-sm text-gray-400">.10</span></p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-500">Honorarios</p>
                                            <p className="text-3xl">${formatNumber(Math.round(secondaryMetrics.honorarios))}<span className="text-sm text-gray-400">.10</span></p>
                                        </div>
                                    </div>

                                    {/* Legend for Progress Chart */}
                                    <div className="flex items-center space-x-6 flex-wrap">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#BFCFDC' }}></div>
                                            <span className="text-sm text-gray-600">Gasto Proyectado</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#79AAAF' }}></div>
                                            <span className="text-sm text-gray-600">Gasto Real</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-8 h-0.5 border-t-2 border-dashed border-gray-500"></div>
                                            <span className="text-sm text-gray-600">Avance %</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Progress Chart */}
                                <div className="w-full h-80">
                                    {proyectoId === "jh777ebcj1d1vy5nc61cp4hbp97txj0s" && (
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

                    {/* Familia Charts - Configurable charts */}
                    <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        {/* Chart 1 */}
                        <FamiliaChart
                            chartId={chartConfigs.chart1.chartId}
                            data={chart1Data?.dataPoints || []}
                            title={chartConfigs.chart1.title}
                            total={chart1Data?.total || 0}
                            color={chartConfigs.chart1.color}
                            onConfigClick={() => handleOpenConfig("chart1")}
                        />

                        {/* Chart 2 */}
                        <FamiliaChart
                            chartId={chartConfigs.chart2.chartId}
                            data={chart2Data?.dataPoints || []}
                            title={chartConfigs.chart2.title}
                            total={chart2Data?.total || 0}
                            color={chartConfigs.chart2.color}
                            onConfigClick={() => handleOpenConfig("chart2")}
                        />
                    </div>

                    <div className="col-span-4 py-12">
                        <DashboardTable />
                    </div>
                </div>
            </div>
            
            {/* Configuration Modal */}
            <FamiliaChartConfigModal onSave={handleConfigSave} />
        </div>
    );
}
