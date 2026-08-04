import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useQuery, usePaginatedQuery, useMutation } from "convex/react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  X, Plus,
  ChevronRight,
  RefreshCw,
  CalendarIcon,
  CreditCard,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { useIngresosModal } from "@/hooks/ingresos-modal";
import IngresosModal from "@/components/modals/ingresos-modal";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type CurrencyMetricProps = {
  amount: number;
  currency: string;
  className?: string;
  fractionClassName?: string;
};

function getCurrencyDisplayParts(amount: number, currency: string) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
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

function CurrencyMetric({ amount, currency, className, fractionClassName }: CurrencyMetricProps) {
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

export default function PresupuestoPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin = currentUser?.role === "admin";

  const [selectedPartidas, setSelectedPartidas] = useState<string[]>([]);
  const [selectedFamilias, setSelectedFamilias] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<"total" | "ultima_semana" | "este_mes" | "mes_pasado" | "rango">("total");
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [partidaSearchTerm, setPartidaSearchTerm] = useState("");
  const [familiaSearchTerm, setFamiliaSearchTerm] = useState("");
  const [isPartidaOpen, setIsPartidaOpen] = useState(false);
  const [isFamiliaOpen, setIsFamiliaOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [showPrecioUnitario, setShowPrecioUnitario] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Modals
  const addPaymentModal = useAddPaymentModal();
  const addPartidaModal = useAddPartidaModal();
  const ingresosModal = useIngresosModal();

  // Sync mutation
  const syncProjectData = useMutation(api.partida.syncProjectData);

  // Handler to open add payment modal
  const handleOpenAddPayment = () => {
    if (proyecto) {
      addPaymentModal.onOpen({
        projectId: proyecto._id,
      });
      setIsActionsOpen(false);
    }
  };

  // Handler to open ingresos modal
  const handleOpenIngresos = () => {
    if (proyecto) {
      ingresosModal.onOpen({
        projectId: proyecto._id,
        projectName: proyecto.nombre,
      });
      setIsActionsOpen(false);
    }
  };

  const handleOpenAddPartida = () => {
    if (proyecto) {
      addPartidaModal.onOpen({
        proyecto: proyecto._id,
        projectName: proyecto.nombre
      });
      setIsActionsOpen(false);
    }
  };

  // Handler for sync button
  const handleSync = async () => {
    if (!proyectoId) return;

    setIsSyncing(true);
    try {
      const result = await syncProjectData({
        projectId: proyectoId as Id<"desarrollos">
      });
      console.log("Sync completed:", result);
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
      setIsActionsOpen(false);
    }
  };

  // Function to toggle precio unitario columns visibility
  const togglePrecioUnitario = () => {
    setShowPrecioUnitario(!showPrecioUnitario);
  };

  // Compute date range from selected filter
  const dateRange = useMemo(() => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    switch (dateFilter) {
      case "total":
        return { start: undefined, end: undefined };
      case "ultima_semana": {
        const end = new Date(today);
        const start = new Date(today);
        start.setDate(today.getDate() - 7);
        return { start: fmt(start), end: fmt(end) };
      }
      case "este_mes": {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: fmt(start), end: fmt(today) };
      }
      case "mes_pasado": {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: fmt(start), end: fmt(end) };
      }
      case "rango": {
        const fmtFrom = calendarRange?.from ? fmt(calendarRange.from) : undefined;
        const fmtTo = calendarRange?.to ? fmt(calendarRange.to) : undefined;
        return { start: fmtFrom, end: fmtTo };
      }
      default:
        return { start: undefined, end: undefined };
    }
  }, [dateFilter, calendarRange]);

  // Fetch current project
  const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

  // Get project's default currency (efficient - uses cached field)
  const currencyInfo = useQuery(
    api.currency_helpers.getProjectDefaultCurrency,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const moneda = currencyInfo?.defaultCurrency || "MXN";

  const shouldFetchFilteredPayments =
    dateFilter !== "total" && Boolean(proyectoId) && Boolean(dateRange.start || dateRange.end);

  // Get payments filtered by date range. The "total" view already uses cached metrics,
  // so avoid asking Convex to scan every transaction/payment in the project.
  const filteredPayments = useQuery(
    api.pagos.getPaymentsByDateRange,
    shouldFetchFilteredPayments && proyectoId
      ? {
        proyecto_id: proyectoId as Id<"desarrollos">,
        start_date: dateRange.start,
        end_date: dateRange.end,
      }
      : "skip"
  );


  // Fetch all partidas for selected project with pagination
  const { results: allPartidas, status: partidasStatus, loadMore } = usePaginatedQuery(
    api.partida.getByProjectPaginated,
    proyectoId ? { projectId: proyectoId as Id<"desarrollos"> } : "skip",
    { initialNumItems: 5000 }
  );


  // Get metrics for a proyecto
  const metrics = useQuery(
    api.meticas_presupuesto.getByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Get ingresos totals for a proyecto
  const ingresosTotals = useQuery(
    api.ingresos.getTotalsByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  const ogcIngresosTotals = useQuery(
    api.ogc_movimientos.getIncomeTotalsByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Get unique partidas and familias for filters (filter out empty strings)
  const uniquePartidas = useMemo(() =>
    Array.from(new Set(allPartidas?.map(p => p.nombre).filter(n => n && n.trim() !== '') || [])),
    [allPartidas]
  );

  const uniqueFamilias = useMemo(() =>
    Array.from(new Set(allPartidas?.map(p => p.familia).filter(f => f && f.trim() !== '') || [])),
    [allPartidas]
  );

  // Filter partidas list for search
  const filteredPartidasForSelect = useMemo(() => {
    if (!partidaSearchTerm) return uniquePartidas;
    return uniquePartidas.filter(p =>
      p.toLowerCase().includes(partidaSearchTerm.toLowerCase())
    );
  }, [uniquePartidas, partidaSearchTerm]);

  // Filter familias list for search
  const filteredFamiliasForSelect = useMemo(() => {
    if (!familiaSearchTerm) return uniqueFamilias;
    return uniqueFamilias.filter(f =>
      f.toLowerCase().includes(familiaSearchTerm.toLowerCase())
    );
  }, [uniqueFamilias, familiaSearchTerm]);

  // Filter data based on selections
  const filteredPartidas = useMemo(() => {
    if (!allPartidas) return [];

    // When filtering by familia, we need to:
    // 1. Keep nivel 1 (partida) items only if they have matching nivel 2/3 children
    // 2. Keep nivel 2 (familia) items that match the selected familias
    // 3. Keep nivel 3 (sub-partida) items that match the selected familias

    // First, determine which partida names have matching familias
    const partidasWithMatchingFamilias = new Set<string>();
    if (selectedFamilias.length > 0) {
      allPartidas.forEach(p => {
        if (p.nivel === 2 || p.nivel === 3) {
          if (p.familia && selectedFamilias.includes(p.familia)) {
            // Add the parent partida name
            partidasWithMatchingFamilias.add(p.partida_nombre || p.nombre);
          }
        }
      });
    }

    return allPartidas.filter(p => {
      // Filter by selected partidas (nombre)
      if (selectedPartidas.length > 0 && !selectedPartidas.includes(p.nombre)) {
        // For nivel 2/3, also check partida_nombre
        if (p.nivel === 2 || p.nivel === 3) {
          if (!selectedPartidas.includes(p.partida_nombre || "")) return false;
        } else {
          return false;
        }
      }

      // Filter by selected familias
      if (selectedFamilias.length > 0) {
        if (p.nivel === 1) {
          // For nivel 1 (partida), only include if it has matching children
          if (!partidasWithMatchingFamilias.has(p.nombre)) return false;
        } else {
          // For nivel 2/3, check if familia matches
          if (!p.familia || !selectedFamilias.includes(p.familia)) return false;
        }
      }

      return true;
    });
  }, [allPartidas, selectedPartidas, selectedFamilias]);

  // Calculate percentage differences
  const presupuestoReduction = metrics && metrics.presupuesto_original > 0
    ? Math.round(((metrics.presupuesto_aprobado - metrics.presupuesto_original) / metrics.presupuesto_original) * 100)
    : 0;
  const avancePercentage = metrics && metrics.presupuesto_aprobado > 0
    ? Math.round((metrics.gasto_total / metrics.presupuesto_aprobado) * 100)
    : 0;
  const totalIngresos = (ingresosTotals?.total_ingresos || 0) + (ogcIngresosTotals?.total_ingresos || 0);


  // Loading state
  if (!proyecto || partidasStatus === "LoadingFirstPage") {
    return <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-500">Cargando datos...</p>
      </div>
    </div>;
  }

  return (
    <div className="bg-white py-6 space-y-12">
      <div className="max-w-full mx-auto space-y-12">
        {/* Header */}
        <div className="py-6 border-b border-gray-200 px-12 pb-12">
          <div className="flex items-end justify-between">
            <div className="flex flex-col text-left">
              <p className="text-base text-gray-500 mb-1">Presupuesto</p>
              <h1 className="text-2xl text-gray-900">{proyecto.nombre}</h1>
            </div>
            <div className="flex items-start gap-3">
              {/* <Button
                onClick={() => selectedDesarrollo && addPartidaModal.onOpen({
                  proyecto: selectedDesarrollo._id,
                  projectName: selectedDesarrollo.nombre
                })}
                variant={"outline"}
                size={"lg"}
                disabled={!selectedDesarrollo}
                className="flex justify-center items-center gap-2 rounded-none text-gray-500 py-6 "
              >
                Reporte
                <Download className="h-6 w-6 rounded-full shadow-none" />
              </Button> */}


              {/* Total Ingresos - Based on image reference */}
              <Card className="bg-transparent shadow-none border-none col-span-1 md:col-span-2 lg:col-span-1 mr-4">
                <CardContent className="p-0 text-left cursor-pointer rounded-md transition-colors hover:bg-gray-50" onClick={handleOpenIngresos}>
                  <div className="space-y-1 text-right">
                    <p className="text-sm text-muted-foreground text-right mr-0.5">Total Ingresos</p>
                    <div className="flex items-baseline space-x-2">
                      <CurrencyMetric
                        amount={totalIngresos}
                        currency={moneda}
                        className="text-3xl font-normal text-gray-900 leading-none"
                      />
                    </div>
                    <Badge variant="secondary" className="text-[10px] text-center font-normal py-1.5 leading-none bg-gray-100 text-gray-600 rounded-xl border-gray-400 min-w-24">
                      <span className="text-center">
                        Neto
                        {" "}
                        <CurrencyMetric
                          amount={totalIngresos - (metrics?.gasto_total || 0)}
                          currency={moneda}
                          fractionClassName="ml-0.5 text-[0.75em]"
                        />
                      </span>
                    </Badge>
                  </div>
                </CardContent>
              </Card>


              <Popover open={isActionsOpen} onOpenChange={setIsActionsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!proyecto}
                    className="h-10 w-10 text-[#898982] hover:bg-gray-100 hover:text-gray-900"
                  >
                    <span className="sr-only">Abrir acciones de presupuesto</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={6} className="w-64 overflow-hidden border-gray-200 bg-white p-1 text-gray-900 shadow-xl">
                  <Command className="bg-white text-gray-900">
                    <CommandList>
                      <CommandGroup>
                        {isAdmin ? (
                          <CommandItem
                            onSelect={() => {
                              setIsActionsOpen(false);
                              navigate(`/proyecto/${proyectoId}/reportes?sections=executive,financial,earned_value,cashflow,variances`);
                            }}
                            className="data-[selected=true]:bg-gray-100"
                          >
                            <FileText className="h-4 w-4" />
                            Crear reporte financiero
                          </CommandItem>
                        ) : null}
                        <CommandItem
                          onSelect={handleOpenIngresos}
                          className="data-[selected=true]:bg-gray-100"
                        >
                          <CreditCard className="h-4 w-4" />
                          Gestionar ingresos
                        </CommandItem>
                        <CommandItem
                          onSelect={handleOpenAddPayment}
                          className="data-[selected=true]:bg-gray-100"
                        >
                          <CreditCard className="h-4 w-4" />
                          Nuevo pago
                        </CommandItem>
                        <CommandItem
                          onSelect={handleOpenAddPartida}
                          className="data-[selected=true]:bg-gray-100"
                        >
                          <Plus className="h-4 w-4" />
                          Agregar partida
                        </CommandItem>
                      </CommandGroup>
                      <CommandSeparator className="bg-gray-200" />
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => { void handleSync(); }}
                          disabled={isSyncing}
                          className="data-[selected=true]:bg-gray-100"
                        >
                          <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                          {isSyncing ? "Sincronizando..." : "Sincronizar datos"}
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-12 mb-8 px-12">


          {/* Presupuesto Original */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="p-0 text-left">
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Presupuesto Original</p>
                <div className="flex items-baseline space-x-2">
                  <CurrencyMetric
                    amount={metrics?.presupuesto_original || 0}
                    currency={moneda}
                    className="text-3xl 2xl:text-4xl font-normal text-gray-900"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Presupuesto Aprobado */}
          <Card className="bg-transparent shadow-none border-none ">
            <CardContent className="p-0 text-left">
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Presupuesto aprobado</p>
                <div className="flex items-baseline space-x-2">
                  <CurrencyMetric
                    amount={metrics?.presupuesto_aprobado || 0}
                    currency={moneda}
                    className="text-3xl 2xl:text-4xl font-normal text-gray-900"
                  />
                </div>
                <div className="text-lg text-gray-500">
                  <Badge variant="secondary" className="ml-0 bg-green-100 text-green-800 rounded-xl border-green-800 text-[10px] font-normal py-1.5 leading-none">
                    {presupuestoReduction < 0 ? 'Reducción' : 'Aumento'} {Math.abs(presupuestoReduction)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gasto Total */}
          <Card className="bg-transparent shadow-none border-none ">
            <CardContent className="p-0 text-left">
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  {dateFilter === "total" ? "Gasto Total" : `Pagado (${dateFilter === "ultima_semana" ? "Últ. 7 días" : dateFilter === "este_mes" ? "Este mes" : dateFilter === "mes_pasado" ? "Mes pasado" : "Rango"})`}
                </p>
                <div className="flex items-baseline space-x-2">
                  <CurrencyMetric
                    amount={
                      dateFilter === "total"
                        ? (metrics?.gasto_total || 0)
                        : (filteredPayments?.total || 0)
                    }
                    currency={moneda}
                    className="text-3xl 2xl:text-4xl font-normal text-gray-900"
                  />
                </div>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  Avance {avancePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Por gastar */}
          <Card className="bg-transparent shadow-none border-none ">
            <CardContent className="p-0 text-left">
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Por ejercer</p>
                <div className="flex items-baseline space-x-2">
                  <CurrencyMetric
                    amount={metrics?.por_gastar || 0}
                    currency={moneda}
                    className="text-3xl 2xl:text-4xl font-normal text-gray-900"
                  />
                </div>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  Avance {avancePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Filters */}
        <div className="bg-white  pb-4 px-12">
          <div className="grid grid-cols-3 items-center gap-6">
            {/* Partida Filter - Multi-select */}
            <div className="flex flex-col space-y-1 text-left border-b border-gray-200">
              <span className="text-sm text-gray-500">Partida</span>
              <Popover open={isPartidaOpen} onOpenChange={setIsPartidaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="border-none shadow-none px-0 h-auto font-normal text-gray-900 hover:bg-transparent justify-start"
                  >
                    <span className="flex items-center gap-2">
                      {selectedPartidas.length === 0 ? (
                        "Todas"
                      ) : selectedPartidas.length === 1 ? (
                        selectedPartidas[0]
                      ) : (
                        `${selectedPartidas.length} seleccionadas`
                      )}
                      {/* <ChevronDown className="h-4 w-4 text-gray-400" /> */}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b">
                    <Input
                      placeholder="Buscar partidas..."
                      value={partidaSearchTerm}
                      onChange={(e) => setPartidaSearchTerm(e.target.value)}
                      className="h-8 rounded-none focus-visible:border-gray-300 focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                    {filteredPartidasForSelect.length > 0 ? (
                      filteredPartidasForSelect.map((partida) => (
                        <div key={partida} className="flex items-center space-x-2">
                          <Checkbox
                            id={`partida-${partida}`}
                            checked={selectedPartidas.includes(partida)}
                            className="border-gray-300"
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedPartidas([...selectedPartidas, partida]);
                              } else {
                                setSelectedPartidas(selectedPartidas.filter(p => p !== partida));
                              }
                            }}
                          />
                          <label
                            htmlFor={`partida-${partida}`}
                            className="text-base cursor-pointer flex-1"
                          >
                            {partida}
                          </label>
                        </div>
                      ))
                    ) : (
                      <p className="text-base text-gray-500 text-center py-2">
                        No se encontraron partidas
                      </p>
                    )}
                  </div>
                  {selectedPartidas.length > 0 && (
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-base text-gray-500">
                        {selectedPartidas.length} seleccionada(s)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPartidas([])}
                        className="h-7 text-base"
                      >
                        Limpiar
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {selectedPartidas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 items-center">
                  {selectedPartidas.map((partida) => (
                    <Badge
                      key={partida}
                      variant="secondary"
                    >
                      {partida.length > 15 ? `${partida.slice(0, 15)}...` : partida}
                      <X
                        className="h-3 w-3 cursor-pointer ml-1"
                        onClick={() => setSelectedPartidas(selectedPartidas.filter(p => p !== partida))}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Familia Filter - Multi-select */}
            <div className="flex flex-col space-y-1 text-left border-b border-gray-200">
              <span className="text-sm text-gray-500">Familia</span>
              <Popover open={isFamiliaOpen} onOpenChange={setIsFamiliaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="border-none shadow-none px-0 h-auto font-normal text-gray-900 hover:bg-transparent justify-start"
                  >
                    <span className="flex items-center gap-2">
                      {selectedFamilias.length === 0 ? (
                        "Todas"
                      ) : selectedFamilias.length === 1 ? (
                        selectedFamilias[0]
                      ) : (
                        `${selectedFamilias.length} seleccionadas`
                      )}
                      {/* <ChevronDown className="h-4 w-4 text-gray-400" /> */}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b">
                    <Input
                      placeholder="Buscar familias..."
                      value={familiaSearchTerm}
                      onChange={(e) => setFamiliaSearchTerm(e.target.value)}
                      className="h-8 rounded-none focus-visible:border-gray-300 focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                    {filteredFamiliasForSelect.length > 0 ? (
                      filteredFamiliasForSelect.map((familia) => (
                        <div key={familia} className="flex items-center space-x-2">
                          <Checkbox
                            id={`familia-${familia}`}
                            checked={selectedFamilias.includes(familia)}
                            className="border-gray-300"
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedFamilias([...selectedFamilias, familia]);
                              } else {
                                setSelectedFamilias(selectedFamilias.filter(f => f !== familia));
                              }
                            }}
                          />
                          <label
                            htmlFor={`familia-${familia}`}
                            className="text-base cursor-pointer flex-1"
                          >
                            {familia}
                          </label>
                        </div>
                      ))
                    ) : (
                      <p className="text-base text-gray-500 text-center py-2">
                        No se encontraron familias
                      </p>
                    )}
                  </div>
                  {selectedFamilias.length > 0 && (
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-base text-gray-500">
                        {selectedFamilias.length} seleccionada(s)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFamilias([])}
                        className="h-7 text-base"
                      >
                        Limpiar
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {selectedFamilias.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 items-center">
                  {selectedFamilias.map((familia) => (
                    <Badge
                      key={familia}
                      variant="secondary"
                    // className="text-base py-0.5 px-2 gap-1"
                    >
                      {familia.length > 15 ? `${familia.slice(0, 15)}...` : familia}
                      <X
                        className="h-3 w-3 cursor-pointer ml-1"
                        onClick={() => setSelectedFamilias(selectedFamilias.filter(f => f !== familia))}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Fecha Filter */}
            <div className="flex flex-col space-y-1 text-left border-b border-gray-200">
              <span className="text-sm text-gray-500">Fecha</span>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
                <SelectTrigger className="border-none shadow-none px-0 h-auto font-normal text-gray-900 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Hoy (total)</SelectItem>
                  <SelectItem value="ultima_semana">Última semana</SelectItem>
                  <SelectItem value="este_mes">Este mes</SelectItem>
                  <SelectItem value="mes_pasado">Mes pasado</SelectItem>
                  <SelectItem value="rango">Rango de fechas</SelectItem>
                </SelectContent>
              </Select>
              {dateFilter === "rango" && (
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "mt-1 h-8 justify-start text-left text-sm font-normal rounded-none",
                        !calendarRange?.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-400" />
                      {calendarRange?.from ? (
                        calendarRange.to ? (
                          <>
                            {calendarRange.from.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                            {" — "}
                            {calendarRange.to.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                          </>
                        ) : (
                          calendarRange.from.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                        )
                      ) : (
                        <span>Seleccionar rango</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={calendarRange}
                      onSelect={setCalendarRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>


      </div>

      <div className="flex flex-col gap-4">

        {/* toggle precio unitario */}



        <div className="flex items-center gap-6 px-4">
          <div onClick={togglePrecioUnitario} className="flex items-center space-x-2 w-fit text-gray-900 cursor-pointer">
            <small>Precio unitario</small>
            <Button
              className="text-left text-base font-medium text-muted-foreground rounded-full"
              onClick={togglePrecioUnitario}
              size={"icon"}
              variant={"ghost"}
            >
              <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showPrecioUnitario && "rotate-90")} />
            </Button>
          </div>

        </div>



        {/* Budget Table Component */}
        <PresupuestoTable
          data={filteredPartidas}
          status={partidasStatus}
          loadMore={loadMore}
          showPrecioUnitario={showPrecioUnitario}
          filteredPayments={dateFilter !== "total" ? filteredPayments?.paymentsByPartida : undefined}
          dateFilterLabel={dateFilter === "total" ? undefined : dateFilter === "ultima_semana" ? "Últ. 7 días" : dateFilter === "este_mes" ? "Este mes" : dateFilter === "mes_pasado" ? "Mes pasado" : "Rango"}
        />
      </div>

      {/* Ingresos Modal */}
      <IngresosModal />
    </div>
  );
}
