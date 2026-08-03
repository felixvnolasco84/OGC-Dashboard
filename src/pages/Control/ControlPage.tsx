import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import {
    useQuery,
} from "convex/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ProgressChart from "@/components/Charts/ProgressChart";
import FamiliaChart from "@/components/Charts/FamiliaChart";
import TopVariancePartidasTable from "@/components/Charts/TopVariancePartidasTable";
import AutorizacionesObraPage from "../AutorizacionesObra/AutorizacionesObraPage";
import ChartConfigModal from "@/components/Charts/ChartConfigModal";
import { useChartConfig } from "@/hooks/useChartConfig";
import { FileText } from "lucide-react";
// import { useAddPartidaModal } from "@/hooks/add-partida-modal";

import { Id } from "convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const CHART_PERIODO = "Diario";
const CHART_RANGO_FECHA = "Todo el tiempo";

const formatNumber = (amount: number) => {
    return new Intl.NumberFormat('es-MX').format(amount);
};

const toFiniteNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
};

const trimTrailingZero = (value: number) => {
    return value.toFixed(1).replace(/\.0$/, "");
};

const formatCurrencyCompact = (amount: number) => {
    const safeAmount = toFiniteNumber(amount);
    const sign = safeAmount < 0 ? "-" : "";
    const absoluteAmount = Math.abs(safeAmount);

    if (absoluteAmount >= 1_000_000) {
        return `${sign}$${trimTrailingZero(absoluteAmount / 1_000_000)}M`;
    }

    if (absoluteAmount >= 1_000) {
        return `${sign}$${trimTrailingZero(absoluteAmount / 1_000)}K`;
    }

    return `${sign}$${formatNumber(Math.round(absoluteAmount))}`;
};

type CurrencyMetricProps = {
    amount: number;
    currency?: string;
    className?: string;
    fractionClassName?: string;
};

function getCurrencyDisplayParts(amount: number, currency: string) {
    const safeAmount = toFiniteNumber(amount);
    const formatter = new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const parts = formatter.formatToParts(safeAmount);
    const decimalIndex = parts.findIndex((part) => part.type === "decimal");

    if (decimalIndex === -1) {
        return {
            whole: formatter.format(safeAmount),
            fraction: "",
        };
    }

    return {
        whole: parts.slice(0, decimalIndex).map((part) => part.value).join(""),
        fraction: parts.slice(decimalIndex).map((part) => part.value).join(""),
    };
}

function CurrencyMetric({ amount, currency = "MXN", className, fractionClassName }: CurrencyMetricProps) {
    const { whole, fraction } = getCurrencyDisplayParts(amount, currency);

    return (
        <span className={cn("inline-flex items-baseline whitespace-nowrap tabular-nums", className)}>
            <span>{whole}</span>
            {fraction ? (
                <span className={cn("ml-1 text-[0.5em] leading-none", fractionClassName)}>
                    {fraction}
                </span>
            ) : null}
        </span>
    );
}

const formatDecimalMetric = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return "N/D";
    return value.toFixed(2);
};

type ControlMetricCardProps = {
    label: string;
    value: string;
    tone?: "default" | "danger" | "success";
};

function ControlMetricCard({ label, value, tone = "default" }: ControlMetricCardProps) {
    const toneClass = {
        default: "text-gray-900",
        danger: "text-[#802424]",
        success: "text-[#1A5D21]",
    }[tone];

    return (
        <Card className="bg-white shadow-none border border-[#E6E4DE] rounded-md min-w-0">
            <CardContent className="px-8 py-7 text-left min-h-[116px] flex flex-col justify-center bg-[#FCFCFC] rounded-md">
                <p className="text-sm text-[#6F6E68] mb-2">{label}</p>
                <p className={`text-3xl 2xl:text-4xl leading-tight break-words tabular-nums ${toneClass}`}>
                    {value}
                </p>
            </CardContent>
        </Card>
    );
}


export default function ControlPage() {
    const { proyectoId } = useParams<{ proyectoId: string }>();
    const navigate = useNavigate();

    // Tab state
    const [activeTab] = useState<"permisos" | "presupuestos" | "imss">("permisos");

    // Modal state
    const [activeChartId, setActiveChartId] = useState<string | null>(null);

    // Persistent chart configurations
    const chart1Config = useChartConfig({
        proyectoId: proyectoId as Id<"desarrollos">,
        chartId: "control-chart-1",
        defaultConfig: {
            title: "Gasto Mano de Obra",
            color: "#256A34",
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

    const currencyInfo = useQuery(
        api.currency_helpers.getProjectDefaultCurrency,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );
    const moneda = currencyInfo?.defaultCurrency || "MXN";

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

    const programaObraSchedules = useQuery(
        api.programa_obra.getSchedulesByProyecto,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    const programaObraDetalles = useQuery(
        api.programa_obra.getDetallesByProyecto,
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

    const topVariancePartidas = useQuery(
        api.transacciones.getTopVariancePartidas,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    // Get current chart config for modal
    const getActiveChartConfig = () => {
        if (activeChartId === "control-chart-1") return chart1Config;
        if (activeChartId === "control-chart-2") return chart2Config;
        return null;
    };

    const activeConfig = getActiveChartConfig();

    const earnedValueMetrics = useMemo(() => {
        const approvedBudget = Math.max(toFiniteNumber(budgetMetrics?.presupuesto_aprobado), 0);
        const actualCost = Math.max(toFiniteNumber(budgetMetrics?.gasto_total), 0);
        const schedules = programaObraSchedules || [];
        const detalles = programaObraDetalles || [];
        const scheduleProgress = schedules.map((schedule) => {
            const childDetails = detalles.filter((detalle) => detalle.programa_obra_id === schedule._id);
            const familiaDetails = childDetails.filter((detalle) => detalle.nivel === 2);
            const detailsForProgress = familiaDetails.length > 0 ? familiaDetails : childDetails;
            const progressDetails = detailsForProgress.filter((detalle) => Number.isFinite(detalle.avance_porcentaje));
            const totalChildWeight = progressDetails.reduce((sum, detalle) => sum + Math.max(toFiniteNumber(detalle.peso), 0), 0);
            const progress = totalChildWeight > 0
                ? progressDetails.reduce((sum, detalle) => (
                    sum + clamp(toFiniteNumber(detalle.avance_porcentaje), 0, 100) * Math.max(toFiniteNumber(detalle.peso), 0)
                ), 0) / totalChildWeight
                : progressDetails.length > 0
                    ? progressDetails.reduce((sum, detalle) => sum + clamp(toFiniteNumber(detalle.avance_porcentaje), 0, 100), 0) / progressDetails.length
                    : 0;

            return {
                progress: clamp(progress, 0, 100),
                weight: Math.max(toFiniteNumber(schedule.peso), 0),
            };
        });
        const totalScheduleWeight = scheduleProgress.reduce((sum, item) => sum + item.weight, 0);
        const physicalProgressPercent = scheduleProgress.length === 0
            ? 0
            : totalScheduleWeight > 0
                ? scheduleProgress.reduce((sum, item) => sum + item.progress * item.weight, 0) / totalScheduleWeight
                : scheduleProgress.reduce((sum, item) => sum + item.progress, 0) / scheduleProgress.length;
        const earnedValue = approvedBudget * (physicalProgressPercent / 100);
        const cpi = actualCost > 0 ? earnedValue / actualCost : null;
        const remainingBudget = approvedBudget - actualCost;
        const eac = cpi && cpi > 0 ? (actualCost + remainingBudget) / cpi : null;

        return {
            approvedBudget,
            physicalProgressPercent,
            earnedValue,
            actualCost,
            cpi,
            eac,
        };
    }, [budgetMetrics, programaObraSchedules, programaObraDetalles]);

    if (!proyecto || !budgetMetrics || !programaObraSchedules || !programaObraDetalles) {
        return <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
            <p className="text-gray-500">Cargando datos...</p>
        </div>;
    }

    return (
        <div className="bg-white px-12 py-6">
            <div className="max-w-full mx-auto space-y-6">
                {/* Header */}
                <div className="rounded-lg py-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-col text-left">
                            <p className="text-sm text-gray-500 mb-1">Proyecto</p>
                            <h1 className="text-2xl text-gray-900">{proyecto.nombre}</h1>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => navigate(`/proyecto/${proyectoId}/reportes?sections=executive,financial,earned_value,cashflow,variances,program`)}
                        >
                            <FileText className="mr-2 h-4 w-4" />
                            Reporte
                        </Button>
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
                                    <CurrencyMetric
                                        amount={budgetMetrics.presupuesto_aprobado || 0}
                                        currency={moneda}
                                        className="text-4xl text-gray-900"
                                    />
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
                                    <CurrencyMetric
                                        amount={budgetMetrics.gasto_total || 0}
                                        currency={moneda}
                                        className="text-4xl text-[#802424]"
                                    />
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
                                    <CurrencyMetric
                                        amount={budgetMetrics.por_gastar || 0}
                                        currency={moneda}
                                        className="text-4xl text-[#1A5D21]"
                                    />
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                                    Pendiente {budgetMetrics.presupuesto_aprobado > 0 ? Math.round((budgetMetrics.por_gastar / budgetMetrics.presupuesto_aprobado) * 100) : 0}%
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Earned Value Metrics */}
                <div className="bg-white pt-10 border-t border-[#D8D6CF]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
                        <ControlMetricCard
                            label="Avance físico real"
                            value={`${Math.round(earnedValueMetrics.physicalProgressPercent)}%`}
                        />
                        <ControlMetricCard
                            label="Valor ganado (EV)"
                            value={formatCurrencyCompact(earnedValueMetrics.earnedValue)}
                        />
                        <ControlMetricCard
                            label="Costo real acum. (AC)"
                            value={formatCurrencyCompact(earnedValueMetrics.actualCost)}
                        />
                        <ControlMetricCard
                            label="CPI"
                            value={formatDecimalMetric(earnedValueMetrics.cpi)}
                            tone={earnedValueMetrics.cpi === null ? "default" : earnedValueMetrics.cpi > 1 ? "success" : earnedValueMetrics.cpi < 1 ? "danger" : "default"}
                        />
                        <ControlMetricCard
                            label="EAC (Costo al cierre)"
                            value={earnedValueMetrics.eac === null ? "N/D" : formatCurrencyCompact(earnedValueMetrics.eac)}
                            tone={
                                earnedValueMetrics.eac === null || earnedValueMetrics.approvedBudget <= 0
                                    ? "default"
                                    : earnedValueMetrics.eac < earnedValueMetrics.approvedBudget
                                        ? "success"
                                        : earnedValueMetrics.eac > earnedValueMetrics.approvedBudget
                                            ? "danger"
                                            : "default"
                            }
                        />
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
                                            <p className="text-3xl">${formatNumber(Math.round(budgetMetrics.gasto_total || 0))}</p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-[#5A5A50]">Por ejercer</p>
                                            <p className="text-3xl">${formatNumber(Math.round(budgetMetrics.por_gastar || 0))}</p>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs text-gray-[#5A5A50]">Honorarios</p>
                                            <p className="text-3xl">${formatNumber(Math.round(budgetMetrics.honorarios_monto || 0))}</p>
                                        </div>
                                    </div>

                                    {/* Legend for Progress Chart */}
                                    <div className="flex items-center space-x-6 flex-wrap text-xs">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#B6C3D0' }}></div>
                                            <span className=" text-gray-600 leading-none">Gasto Proyectado</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#93B0C3' }}></div>
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
                                            selectedPeriodo={CHART_PERIODO}
                                            selectedRangoFecha={CHART_RANGO_FECHA}
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

                    <div className="lg:col-span-4">
                        <TopVariancePartidasTable
                            rows={topVariancePartidas || []}
                            isLoading={Boolean(proyectoId) && topVariancePartidas === undefined}
                            currency={moneda}
                        />
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
