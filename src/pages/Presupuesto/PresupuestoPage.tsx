import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useQuery, usePaginatedQuery, useMutation } from "convex/react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { InvoiceIntakeDialog } from "@/components/invoices/InvoiceIntakeDialog";
import { AddTransactionMenu } from "@/components/transactions/AddTransactionMenu";
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";

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
        <span className={cn("ml-1 text-xs leading-none", fractionClassName)}>
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
  const canCreateTransactions = Boolean(currentUser && currentUser.role !== "viewer");

  const [selectedPartidas, setSelectedPartidas] = useState<string[]>([]);
  const [selectedFamilias, setSelectedFamilias] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<"total" | "ultima_semana" | "este_mes" | "mes_pasado" | "rango">("total");
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [partidaSearchTerm, setPartidaSearchTerm] = useState("");
  const [familiaSearchTerm, setFamiliaSearchTerm] = useState("");
  const partidaSearchRef = useRef<HTMLInputElement>(null);
  const familiaSearchRef = useRef<HTMLInputElement>(null);
  const [isPartidaOpen, setIsPartidaOpen] = useState(false);
  const [isFamiliaOpen, setIsFamiliaOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [showPrecioUnitario, setShowPrecioUnitario] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  useEffect(() => {
    if (isPartidaOpen) partidaSearchRef.current?.focus();
  }, [isPartidaOpen]);

  useEffect(() => {
    if (isFamiliaOpen) familiaSearchRef.current?.focus();
  }, [isFamiliaOpen]);

  // Modals
  const addPaymentModal = useAddPaymentModal();
  const addPartidaModal = useAddPartidaModal();
  const ingresosModal = useIngresosModal();
  const uploadProjectTransactionsModal = useUploadProjectTransactionsModal();

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
    return <div className="bg-card px-12 py-6 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto mb-4"></div>
        <p className="text-muted-foreground">Cargando datos...</p>
      </div>
    </div>;
  }

  return (
    <div className="bg-card py-6 space-y-12">
      <div className="max-w-full mx-auto space-y-12">
        {/* Header */}
        <div className="py-6 border-b border-border px-12 pb-12">
          <div className="flex items-end justify-between">
            <div className="flex flex-col text-left">
              <p className="text-base text-muted-foreground mb-1">Presupuesto</p>
              <h1 className="text-2xl text-foreground">{proyecto.nombre}</h1>
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
                className="flex justify-center items-center gap-2 rounded-none text-muted-foreground py-6 "
              >
                Reporte
                <Download className="h-6 w-6 rounded-full shadow-none" />
              </Button> */}


              {/* Total Ingresos - Based on image reference */}
              <div className="col-span-1 mr-4 md:col-span-2 lg:col-span-1"><Card variant="metric">
                <CardContent variant="flush">
                  <div className="cursor-pointer" onClick={handleOpenIngresos} aria-label="Ver ingresos del proyecto">
                    <span className="flex flex-col items-end gap-1 text-right">
                    <span className="text-sm text-muted-foreground text-right mr-0.5">Total Ingresos</span>
                    <span className="flex items-baseline space-x-2">
                      <CurrencyMetric
                        amount={totalIngresos}
                        currency={moneda}
                        className="text-3xl font-normal text-foreground leading-none"
                      />
                    </span>
                    <Badge asChild variant={"secondary"}>
                      <span className="text-center text-xs">
                        Neto
                        {" "}
                        <CurrencyMetric
                          amount={totalIngresos - (metrics?.gasto_total || 0)}
                            currency={moneda}
                            className="ml-1"
                          fractionClassName="ml-0.5 text-xs"
                        />
                      </span>
                    </Badge>
                    </span>
                  </div>
                </CardContent>
              </Card></div>

              <AddTransactionMenu
                visible={canCreateTransactions}
                onAddPayment={handleOpenAddPayment}
                onUploadExcel={() => {
                  uploadProjectTransactionsModal.onOpen(proyecto._id, proyecto.nombre);
                }}
                onUploadInvoice={() => setInvoiceOpen(true)}
              />

              <DropdownMenu open={isActionsOpen} onOpenChange={setIsActionsOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="quiet"
                    size="iconLg"
                    disabled={!proyecto}
                  >
                    <span className="sr-only">Abrir acciones de presupuesto</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6}>
                  <DropdownMenuGroup>
                    {isAdmin ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          setIsActionsOpen(false);
                          navigate(`/proyecto/${proyectoId}/reportes?sections=executive,financial,earned_value,cashflow,variances`);
                        }}
                      >
                        <FileText className="h-4 w-4" />
                        Crear reporte financiero
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() => {
                        setIsActionsOpen(false);
                        window.setTimeout(handleOpenIngresos, 100);
                      }}
                    >
                      <CreditCard className="h-4 w-4" />
                      Gestionar ingresos
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setIsActionsOpen(false);
                        window.setTimeout(handleOpenAddPartida, 100);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Agregar partida
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onSelect={() => { void handleSync(); }}
                      disabled={isSyncing}
                    >
                      <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                      {isSyncing ? "Sincronizando..." : "Sincronizar datos"}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-12 mb-8 px-12">


          {/* Presupuesto Original */}
          <Card variant="metric">
            <CardContent variant="flush">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Presupuesto Original</p>
                <div className="flex items-baseline space-x-2">
                  <CurrencyMetric
                    amount={metrics?.presupuesto_original || 0}
                    currency={moneda}
                    className="text-3xl 2xl:text-4xl font-normal text-foreground"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Presupuesto Aprobado */}
          <Card variant="metric">
            <CardContent variant="flush">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Presupuesto aprobado</p>
                <div className="flex items-baseline space-x-2">
                  <CurrencyMetric
                    amount={metrics?.presupuesto_aprobado || 0}
                    currency={moneda}
                    className="text-3xl 2xl:text-4xl font-normal text-foreground"
                  />
                </div>
                <div className="text-lg text-muted-foreground">
                  <Badge variant="success">
                    {presupuestoReduction < 0 ? 'Reducción' : 'Aumento'} {Math.abs(presupuestoReduction)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gasto Total */}
          <Card variant="metric">
            <CardContent variant="flush">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
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
                    className="text-3xl 2xl:text-4xl font-normal text-foreground"
                  />
                </div>
                <Badge variant="secondary">
                  Avance {avancePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Por gastar */}
          <Card variant="metric">
            <CardContent variant="flush">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Por ejercer</p>
                <div className="flex items-baseline space-x-2">
                  <CurrencyMetric
                    amount={metrics?.por_gastar || 0}
                    currency={moneda}
                    className="text-3xl 2xl:text-4xl font-normal text-foreground"
                  />
                </div>
                <Badge variant="secondary">
                  Avance {avancePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Filters */}
        <div className="bg-card  pb-4 px-12">
          <div className="grid grid-cols-3 items-center gap-6">
            {/* Partida Filter - Multi-select */}
            <div className="flex flex-col space-y-1 text-left border-b border-border">
              <span className="text-sm text-muted-foreground">Partida</span>
              <DropdownMenu open={isPartidaOpen} onOpenChange={setIsPartidaOpen} modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="filter"
                    size="filter"
                  >
                    <span className="flex items-center gap-2">
                      {selectedPartidas.length === 0 ? (
                        "Todas"
                      ) : selectedPartidas.length === 1 ? (
                        selectedPartidas[0]
                      ) : (
                        `${selectedPartidas.length} seleccionadas`
                      )}
                      {/* <ChevronDown className="h-4 w-4 text-disabled-foreground" /> */}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-80"
                >
                  <div className="p-3 border-b">
                    <Input
                      ref={partidaSearchRef}
                      placeholder="Buscar partidas..."
                      value={partidaSearchTerm}
                      onChange={(e) => setPartidaSearchTerm(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") event.stopPropagation();
                      }}
                      density="compact"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                    {filteredPartidasForSelect.length > 0 ? (
                      filteredPartidasForSelect.map((partida) => (
                        <DropdownMenuCheckboxItem
                          key={partida}
                          checked={selectedPartidas.includes(partida)}
                          onCheckedChange={(checked) => {
                            setSelectedPartidas((current) => checked
                              ? [...current, partida]
                              : current.filter((p) => p !== partida));
                          }}
                          onSelect={(event) => event.preventDefault()}
                        >
                          {partida}
                        </DropdownMenuCheckboxItem>
                      ))
                    ) : (
                      <p className="text-base text-muted-foreground text-center py-2">
                        No se encontraron partidas
                      </p>
                    )}
                  </div>
                  {selectedPartidas.length > 0 && (
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-base text-muted-foreground">
                        {selectedPartidas.length} seleccionada(s)
                      </span>
                      <Button
                        variant="ghost"
                        size="compact"
                        onClick={() => setSelectedPartidas([])}
                      >
                        Limpiar
                      </Button>
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {selectedPartidas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 items-center">
                  {selectedPartidas.map((partida) => (
                    <Badge
                      key={partida}
                      variant="secondary"
                    >
                      {partida.length > 15 ? `${partida.slice(0, 15)}...` : partida}
                      <Button type="button" variant="quiet" size="badgeIcon" aria-label={`Quitar partida ${partida}`} onClick={() => setSelectedPartidas(selectedPartidas.filter(p => p !== partida))}><X /></Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Familia Filter - Multi-select */}
            <div className="flex flex-col space-y-1 text-left border-b border-border">
              <span className="text-sm text-muted-foreground pb-2">Familia</span>
              <DropdownMenu open={isFamiliaOpen} onOpenChange={setIsFamiliaOpen} modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="filter"
                    size={"filter"}
                  >
                    <span className="flex items-center gap-2">
                      {selectedFamilias.length === 0 ? (
                        "Todas"
                      ) : selectedFamilias.length === 1 ? (
                        selectedFamilias[0]
                      ) : (
                        `${selectedFamilias.length} seleccionadas`
                      )}
                      {/* <ChevronDown className="h-4 w-4 text-disabled-foreground" /> */}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-80"
                >
                  <div className="p-3 border-b">
                    <Input
                      ref={familiaSearchRef}
                      placeholder="Buscar familias..."
                      value={familiaSearchTerm}
                      onChange={(e) => setFamiliaSearchTerm(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") event.stopPropagation();
                      }}
                      density="compact"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                    {filteredFamiliasForSelect.length > 0 ? (
                      filteredFamiliasForSelect.map((familia) => (
                        <DropdownMenuCheckboxItem
                          key={familia}
                          checked={selectedFamilias.includes(familia)}
                          onCheckedChange={(checked) => {
                            setSelectedFamilias((current) => checked
                              ? [...current, familia]
                              : current.filter((f) => f !== familia));
                          }}
                          onSelect={(event) => event.preventDefault()}
                        >
                          {familia}
                        </DropdownMenuCheckboxItem>
                      ))
                    ) : (
                      <p className="text-base text-muted-foreground text-center py-2">
                        No se encontraron familias
                      </p>
                    )}
                  </div>
                  {selectedFamilias.length > 0 && (
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-base text-muted-foreground">
                        {selectedFamilias.length} seleccionada(s)
                      </span>
                      <Button
                        variant="ghost"
                        size="compact"
                        onClick={() => setSelectedFamilias([])}
                      >
                        Limpiar
                      </Button>
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {selectedFamilias.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 items-center">
                  {selectedFamilias.map((familia) => (
                    <Badge
                      key={familia}
                      variant="secondary"
                    >
                      {familia.length > 15 ? `${familia.slice(0, 15)}...` : familia}
                      <Button type="button" variant="quiet" size="badgeIcon" aria-label={`Quitar familia ${familia}`} onClick={() => setSelectedFamilias(selectedFamilias.filter(f => f !== familia))}><X /></Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Fecha Filter */}
            <div className="flex flex-col space-y-1 text-left border-b border-border">
              <span className="text-sm text-muted-foreground pb-2">Fecha</span>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
                <SelectTrigger variant="filter">
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
                <DropdownMenu open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="date"
                      size="sm"
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-disabled-foreground" />
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
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-auto">
                    <div onKeyDown={(event) => {
                      if (event.key !== "Escape") event.stopPropagation();
                    }}>
                      <Calendar
                        autoFocus
                        mode="range"
                        selected={calendarRange}
                        onSelect={setCalendarRange}
                        numberOfMonths={2}
                      />
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>


      </div>

      <div className="flex flex-col gap-4">

        {/* toggle precio unitario */}



        <div className="flex items-center gap-6 px-4">
          <Button type="button" onClick={togglePrecioUnitario} variant="filter" size="bare" aria-pressed={showPrecioUnitario}>
            <small>Precio unitario</small>
            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showPrecioUnitario && "rotate-90")} />
          </Button>

        </div>



        {/* Budget Table Component */}
        <PresupuestoTable
          data={filteredPartidas}
          status={partidasStatus}
          loadMore={loadMore}
          showPrecioUnitario={showPrecioUnitario}
          filteredPayments={dateFilter !== "total" ? filteredPayments?.paymentsByPartida : undefined}
          filteredHonorarios={dateFilter !== "total" ? filteredPayments?.honorarios : undefined}
          dateFilterLabel={dateFilter === "total" ? undefined : dateFilter === "ultima_semana" ? "Últ. 7 días" : dateFilter === "este_mes" ? "Este mes" : dateFilter === "mes_pasado" ? "Mes pasado" : "Rango"}
        />
      </div>

      {/* Ingresos Modal */}
      <IngresosModal />
      <InvoiceIntakeDialog
        hideTrigger
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        projectId={proyecto._id}
        projectName={proyecto.nombre}
      />
    </div>
  );
}
