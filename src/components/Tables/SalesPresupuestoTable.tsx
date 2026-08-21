import { useState, useMemo } from "react";
import { Doc, Id } from "convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown, ChevronRight,
  // Plus,
  X, RefreshCw
} from "lucide-react";
import { cn, formatCurrencyCompact } from "@/lib/utils";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import DropdownMenuComponentSalesPartida from "../DropdownMenu/DropdownMenuComponentSalesPartida";

// Hierarchical structure helper types
type SalesPartidaRow = Omit<Partial<Doc<"sales_partidas">>, 'pagado' | 'total' | 'aprobado'> & {
  displayName: string;
  presupuestoOriginal: number;
  presupuestoAprobado: number;
  pagado: number;
  porGastar: number;
  avance: number;
  fechaInicio?: string;
  fechaFin?: string;
  expanded: boolean;
  level: number;
  children: SalesPartidaRow[];
  originalDoc?: Doc<"sales_partidas">;
  uniqueId: string;
};

type HierarchicalGroup = SalesPartidaRow & {
  familias: Record<string, SalesPartidaRow>;
};

const getApprovedVsOriginal = (original: number, approved: number) => {
  const difference = approved - original;
  const isSavings = difference < 0;
  const isIncrement = difference > 0;
  const isEqual = difference === 0;
  const absoluteDiff = Math.abs(difference);
  const formattedAmount = new Intl.NumberFormat('es-MX').format(absoluteDiff);
  return { isSavings, isIncrement, isEqual, formattedAmount };
};

const getPorGastarBadge = (porGastar: number) => {
  const isRemaining = porGastar > 0;
  const isOverpayment = porGastar < 0;
  const isEqual = porGastar === 0;
  const absoluteAmount = Math.abs(porGastar);
  const formattedAmount = new Intl.NumberFormat('es-MX').format(absoluteAmount);
  return { isRemaining, isOverpayment, isEqual, formattedAmount };
};



export default function SalesPresupuestoTable() {
  const { salesProyectoId } = useParams<{ salesProyectoId: string }>();

  // Filter state
  const [selectedPartidas, setSelectedPartidas] = useState<string[]>([]);
  const [selectedFamilias, setSelectedFamilias] = useState<string[]>([]);
  const [selectedFecha, setSelectedFecha] = useState("Semana");
  const [partidaSearchTerm, setPartidaSearchTerm] = useState("");
  const [familiaSearchTerm, setFamiliaSearchTerm] = useState("");
  const [isPartidaOpen, setIsPartidaOpen] = useState(false);
  const [isFamiliaOpen, setIsFamiliaOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch sales project
  const salesProyecto = useQuery(api.sales_projects.getById, salesProyectoId ? { id: salesProyectoId as Id<"sales_projects"> } : "skip");

  const partidas = useQuery(api.sales_partidas.getBySalesProject, salesProyectoId ? { salesProjectId: salesProyectoId as Id<"sales_projects"> } : "skip");
  
  // Get project's default currency based on transaction history
  const currencyInfo = useQuery(
    api.currency_helpers.getSalesProjectDefaultCurrency,
    salesProyectoId ? { sales_proyecto_id: salesProyectoId as Id<"sales_projects"> } : "skip"
  );
  const defaultCurrency = currencyInfo?.defaultCurrency || "MXN";

  // Sync mutation - updates in cascade like functions.ts
  const syncPartidas = useMutation(api.sales_partidas_sync.syncSalesPartidasFromTransactions);

  // Get unique partidas and familias for filters
  const uniquePartidas = useMemo(() =>
    Array.from(new Set(partidas?.filter(p => p.nivel === 1).map(p => p.nombre).filter(n => n && n.trim() !== '') || [])),
    [partidas]
  );

  const uniqueFamilias = useMemo(() =>
    Array.from(new Set(partidas?.filter(p => p.nivel === 2).map(p => p.familia).filter(f => f && f.trim() !== '') || [])),
    [partidas]
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

  // Apply filters to partidas data
  const filteredPartidas = useMemo(() => {
    if (!partidas) return [];

    return partidas.filter(p => {
      // Filter by partida
      if (selectedPartidas.length > 0) {
        if (p.nivel === 1 && !selectedPartidas.includes(p.nombre)) return false;
        if (p.nivel === 2 && !selectedPartidas.includes(p.partida_nombre || '')) return false;
        if (p.nivel === 3 && !selectedPartidas.includes(p.partida_nombre || '')) return false;
      }
      // Filter by familia
      if (selectedFamilias.length > 0) {
        if (p.nivel === 2 && !selectedFamilias.includes(p.familia || '')) return false;
        if (p.nivel === 3 && !selectedFamilias.includes(p.familia || '')) return false;
      }
      return true;
    });
  }, [partidas, selectedPartidas, selectedFamilias]);

  // Calculate metrics from all partidas (nivel 1 only for top-level totals)
  const metrics = useMemo(() => {
    if (!partidas) return {
      presupuestoOriginal: 0,
      presupuestoAprobado: 0,
      pagado: 0,
      porGastar: 0
    };

    const nivel1Partidas = partidas.filter(p => p.nivel === 1);

    return {
      presupuestoOriginal: nivel1Partidas.reduce((sum, p) => sum + (p.presupuesto_original || 0), 0),
      presupuestoAprobado: nivel1Partidas.reduce((sum, p) => sum + (p.presupuesto_aprobado || 0), 0),
      pagado: nivel1Partidas.reduce((sum, p) => sum + (p.pagado || 0), 0),
      porGastar: nivel1Partidas.reduce((sum, p) => sum + (p.por_gastar || 0), 0)
    };
  }, [partidas]);

  // Calculate percentage differences
  const presupuestoReduction = metrics.presupuestoOriginal > 0
    ? Math.round(((metrics.presupuestoAprobado - metrics.presupuestoOriginal) / metrics.presupuestoOriginal) * 100)
    : 0;
  const avancePercentage = metrics.presupuestoAprobado > 0
    ? Math.round((metrics.pagado / metrics.presupuestoAprobado) * 100)
    : 0;
  const pendientePercentage = metrics.presupuestoAprobado > 0
    ? Math.round((metrics.porGastar / metrics.presupuestoAprobado) * 100)
    : 0;

  // Transform flat sales_partidas data into hierarchical structure
  const hierarchicalData = useMemo(() => {
    // Guard clause: return empty array if partidas is undefined (loading or skipped)
    if (!filteredPartidas) return [];

    const grouped: Record<string, HierarchicalGroup> = {};

    // First pass: Create all nivel 1 (partida) groups
    filteredPartidas.filter(item => item.nivel === 1).forEach(item => {
      const partidaKey = item.nombre;
      const presupuestoAprobado = item.presupuesto_aprobado || 0;
      const pagado = item.pagado || 0;
      const porGastar = item.por_gastar !== undefined ? item.por_gastar : (presupuestoAprobado - pagado);

      grouped[partidaKey] = {
        displayName: partidaKey,
        nombre: partidaKey,
        sales_proyecto: item.sales_proyecto,
        nivel: 1,
        presupuestoOriginal: item.presupuesto_original || 0,
        presupuestoAprobado,
        pagado,
        porGastar,
        avance: 0,
        fechaInicio: "-",
        fechaFin: "-",
        expanded: false,
        level: 0,
        children: [] as SalesPartidaRow[],
        familias: {} as Record<string, SalesPartidaRow>,
        originalDoc: item,
        uniqueId: `partida-${partidaKey}`
      };
    });

    // Second pass: Add nivel 2 (familia) items
    filteredPartidas.filter(item => item.nivel === 2).forEach(item => {
      const partidaKey = item.partida_nombre || item.nombre;
      const partida = grouped[partidaKey];

      if (partida) {
        const familiaKey = item.familia;
        const presupuestoAprobado = item.presupuesto_aprobado || 0;
        const pagado = item.pagado || 0;
        const porGastar = item.por_gastar !== undefined ? item.por_gastar : (presupuestoAprobado - pagado);

        const familiaGroup: SalesPartidaRow = {
          displayName: familiaKey,
          nombre: partidaKey,
          familia: familiaKey,
          partida_nombre: partidaKey,
          sales_proyecto: item.sales_proyecto,
          nivel: 2,
          presupuestoOriginal: item.presupuesto_original || 0,
          presupuestoAprobado,
          pagado,
          porGastar,
          avance: 0,
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 1,
          children: [] as SalesPartidaRow[],
          originalDoc: item,
          uniqueId: `familia-${partidaKey}-${familiaKey}`
        };
        partida.familias[familiaKey] = familiaGroup;
        partida.children.push(familiaGroup);
      }
    });

    // Third pass: Add nivel 3 (sub-partida) items
    filteredPartidas.filter(item => item.nivel === 3).forEach(item => {
      const partidaKey = item.partida_nombre;
      const familiaKey = item.familia;

      if (partidaKey && grouped[partidaKey] && grouped[partidaKey].familias[familiaKey]) {
        const familiaGroup = grouped[partidaKey].familias[familiaKey];
        const presupuestoAprobado = item.presupuesto_aprobado || 0;
        const pagado = item.pagado || 0;
        const porGastar = item.por_gastar !== undefined ? item.por_gastar : (presupuestoAprobado - pagado);

        familiaGroup.children.push({
          ...item,
          displayName: item.sub_partida || item.nombre,
          sub_partida: item.sub_partida || item.nombre,
          presupuestoOriginal: item.presupuesto_original || 0,
          presupuestoAprobado,
          pagado,
          porGastar,
          avance: 0,
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 2,
          children: [],
          originalDoc: item,
          uniqueId: item._id
        });
      }
    });

    // Calculate avance for all levels
    const result = Object.values(grouped).map((partidaGroup) => {
      partidaGroup.avance = partidaGroup.presupuestoAprobado > 0
        ? Math.round((partidaGroup.pagado / partidaGroup.presupuestoAprobado) * 100)
        : 0;

      partidaGroup.children.forEach((familia: SalesPartidaRow) => {
        familia.avance = familia.presupuestoAprobado > 0
          ? Math.round((familia.pagado / familia.presupuestoAprobado) * 100)
          : 0;

        familia.children.forEach((subPartida: SalesPartidaRow) => {
          subPartida.avance = subPartida.presupuestoAprobado > 0
            ? Math.round((subPartida.pagado / subPartida.presupuestoAprobado) * 100)
            : 0;
        });

        if (familia.children.length === 0) {
          familia.children = [];
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { familias, ...budgetItem } = partidaGroup;
      return budgetItem as SalesPartidaRow;
    });

    return result;
  }, [filteredPartidas]);

  const [budgetData, setBudgetData] = useState<SalesPartidaRow[]>([]);

  useMemo(() => {
    setBudgetData(hierarchicalData);
  }, [hierarchicalData]);

  const toggleExpanded = (uniqueId: string) => {
    const updateExpanded = (items: SalesPartidaRow[]): SalesPartidaRow[] => {
      return items.map(item => {
        if (item.uniqueId === uniqueId) {
          return { ...item, expanded: !item.expanded };
        }
        if (item.children && item.children.length > 0) {
          return { ...item, children: updateExpanded(item.children) };
        }
        return item;
      });
    };
    setBudgetData(updateExpanded(budgetData));
  };

  const flattenData = (items: SalesPartidaRow[], result: SalesPartidaRow[] = []): SalesPartidaRow[] => {
    items.forEach(item => {
      result.push(item);
      if (item.expanded && item.children && item.children.length > 0) {
        flattenData(item.children, result);
      }
    });
    return result;
  };

  const flattenedData = flattenData(budgetData);

  // Loading state
  if (!salesProyecto || !partidas) {
    return <div className="bg-card px-12 py-6 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto mb-4"></div>
        <p className="text-subtle-foreground">Cargando datos...</p>
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
              <p className="text-base text-subtle-foreground mb-1">Presupuesto</p>
              <h1 className="text-2xl text-foreground">{salesProyecto.nombre}</h1>
            </div>
            <div className="flex items-end gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex justify-center items-center gap-2 rounded-none text-subtle-foreground py-6"
                onClick={async () => {
                  if (!salesProyectoId) return;
                  setIsSyncing(true);
                  try {
                    const result = await syncPartidas({ salesProjectId: salesProyectoId as Id<"sales_projects"> });
                    toast.success("Sincronización exitosa", {
                      description: result.message,
                    });
                  } catch (error) {
                    console.error("Error syncing:", error);
                    toast.error("Error al sincronizar", {
                      description: "No se pudo sincronizar los datos.",
                    });
                  } finally {
                    setIsSyncing(false);
                  }
                }}
                disabled={isSyncing}
              >
                <RefreshCw className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? "Sincronizando..." : "Sincronizar"}
              </Button>
            </div>
            {/* <div className="flex items-end gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex justify-center items-center gap-2 rounded-none text-subtle-foreground py-6"
              >
                Agregar Unidad
                <Plus className="h-6 w-6 rounded-full shadow-none" />
              </Button>
            </div> */}
          </div>
        </div>

        {/* Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4 gap-12 mb-8 px-12">
          {/* Total Ventas */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="p-0 text-left">
              <div className="space-y-2">
                <p className="text-sm text-subtle-foreground">Total Ventas</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-4xl font-normal text-foreground">
                    {formatCurrencyCompact(Math.round(metrics.presupuestoOriginal), defaultCurrency)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Venido */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="p-0 text-left">
              <div className="space-y-2">
                <p className="text-sm text-subtle-foreground">Vendido</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-4xl font-normal text-foreground">
                    {formatCurrencyCompact(Math.round(metrics.presupuestoAprobado), defaultCurrency)}
                  </p>
                </div>
                <div className="text-lg text-subtle-foreground">
                  <Badge variant="secondary" className="ml-0 bg-green-100 text-green-800 rounded-xl border-green-800 text-[10px] font-normal py-1.5 leading-none">
                    {presupuestoReduction < 0 ? 'Avance' : 'Aumento'} {Math.abs(presupuestoReduction)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pagado */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="p-0 text-left">
              <div className="space-y-2">
                <p className="text-sm text-subtle-foreground">Pagado</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-4xl font-normal text-foreground">
                    {formatCurrencyCompact(Math.round(metrics.pagado), defaultCurrency)}
                  </p>
                </div>
                <Badge variant="secondary" className="ml-0 bg-green-100 text-green-800 rounded-xl border-green-800 text-[10px] font-normal py-1.5 leading-none">
                  Avance {avancePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Por Vender */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="p-0 text-left">
              <div className="space-y-2">
                <p className="text-sm text-subtle-foreground">Por Pagar</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-4xl font-normal text-foreground">
                    {formatCurrencyCompact(Math.round(metrics.porGastar), defaultCurrency)}
                  </p>
                </div>
                <Badge variant="secondary" className="ml-0 bg-green-100 text-green-800 rounded-xl border-green-800 text-[10px] font-normal py-1.5 leading-none">
                  Pendiente {pendientePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="bg-card pb-4 px-12">
          <div className="grid grid-cols-3 items-center gap-6">
            {/* Partida Filter - Multi-select */}
            <div className="flex flex-col space-y-1 text-left border-b border-border">
              <span className="text-sm text-subtle-foreground">Unidad</span>
              <Popover open={isPartidaOpen} onOpenChange={setIsPartidaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="border-none shadow-none px-0 h-auto font-normal text-foreground hover:bg-transparent justify-start"
                  >
                    <span className="flex items-center gap-2">
                      {selectedPartidas.length === 0 ? (
                        "Todas"
                      ) : selectedPartidas.length === 1 ? (
                        selectedPartidas[0]
                      ) : (
                        `${selectedPartidas.length} seleccionadas`
                      )}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b">
                    <Input
                      placeholder="Buscar unidades..."
                      value={partidaSearchTerm}
                      onChange={(e) => setPartidaSearchTerm(e.target.value)}
                      className="h-8 rounded-none focus-visible:border-border-strong focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                    {filteredPartidasForSelect.length > 0 ? (
                      filteredPartidasForSelect.map((partida) => (
                        <div key={partida} className="flex items-center space-x-2">
                          <Checkbox
                            id={`partida-${partida}`}
                            checked={selectedPartidas.includes(partida)}
                            className="border-border-strong"
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
                      <p className="text-base text-subtle-foreground text-center py-2">
                        No se encontraron unidades
                      </p>
                    )}
                  </div>
                  {selectedPartidas.length > 0 && (
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-base text-subtle-foreground">
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
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedPartidas.map((partida) => (
                    <Badge
                      key={partida}
                      variant="secondary"
                      className="text-base py-0.5 px-2 gap-1"
                    >
                      {partida.length > 15 ? `${partida.slice(0, 15)}...` : partida}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => setSelectedPartidas(selectedPartidas.filter(p => p !== partida))}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Familia Filter - Multi-select */}
            <div className="flex flex-col space-y-1 text-left border-b border-border">
              <span className="text-sm text-subtle-foreground">Familia</span>
              <Popover open={isFamiliaOpen} onOpenChange={setIsFamiliaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="border-none shadow-none px-0 h-auto font-normal text-foreground hover:bg-transparent justify-start"
                  >
                    <span className="flex items-center gap-2">
                      {selectedFamilias.length === 0 ? (
                        "Todas"
                      ) : selectedFamilias.length === 1 ? (
                        selectedFamilias[0]
                      ) : (
                        `${selectedFamilias.length} seleccionadas`
                      )}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b">
                    <Input
                      placeholder="Buscar familias..."
                      value={familiaSearchTerm}
                      onChange={(e) => setFamiliaSearchTerm(e.target.value)}
                      className="h-8 rounded-none focus-visible:border-border-strong focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                    {filteredFamiliasForSelect.length > 0 ? (
                      filteredFamiliasForSelect.map((familia) => (
                        <div key={familia} className="flex items-center space-x-2">
                          <Checkbox
                            id={`familia-${familia}`}
                            checked={selectedFamilias.includes(familia)}
                            className="border-border-strong"
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
                      <p className="text-base text-subtle-foreground text-center py-2">
                        No se encontraron familias
                      </p>
                    )}
                  </div>
                  {selectedFamilias.length > 0 && (
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-base text-subtle-foreground">
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
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedFamilias.map((familia) => (
                    <Badge
                      key={familia}
                      variant="secondary"
                      className="text-base py-0.5 px-2 gap-1"
                    >
                      {familia.length > 15 ? `${familia.slice(0, 15)}...` : familia}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => setSelectedFamilias(selectedFamilias.filter(f => f !== familia))}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Fecha Filter */}
            <div className="flex flex-col space-y-1 text-left border-b border-border">
              <span className="text-sm text-subtle-foreground">Fecha</span>
              <Select value={selectedFecha} onValueChange={setSelectedFecha}>
                <SelectTrigger className="border-none shadow-none px-0 h-auto font-normal text-foreground focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Semana">Semana</SelectItem>
                  <SelectItem value="Mes">Mes</SelectItem>
                  <SelectItem value="Trimestre">Trimestre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Table */}
      <div className="space-y-4">
        <div className="bg-card border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-card">
              <TableRow className="border-b border-border">
                <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-border last:border-r-0">
                  Unidad
                </TableHead>
                <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-border last:border-r-0">
                  Total Ventas
                </TableHead>
                <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-border last:border-r-0">
                  Vendido
                </TableHead>
                <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-border last:border-r-0">
                  Pagado
                </TableHead>
                <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-border last:border-r-0">
                  Avance
                </TableHead>
                <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-border last:border-r-0">
                  Fecha inicio
                </TableHead>
                <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-border last:border-r-0">
                  Fecha fin
                </TableHead>
                <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-border last:border-r-0">
                  
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flattenedData.map((item) => {
                const approvedDiff = getApprovedVsOriginal(item.presupuestoOriginal, item.presupuestoAprobado);
                const porGastarBadge = getPorGastarBadge(item.porGastar);

                return (
                  <TableRow
                    key={item.uniqueId}
                    className="border-b border-border hover:bg-background"
                  >
                    <TableCell className="px-4 py-4 text-base text-foreground border-r border-border last:border-r-0 text-left">
                      <div
                        className="flex items-center space-x-2"
                        style={{ paddingLeft: `${item.level * 20}px` }}
                      >
                        {item.children && item.children.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(item.uniqueId)}
                            className="p-0 h-auto hover:bg-transparent"
                          >
                            {item.expanded ? (
                              <ChevronDown className="h-4 w-4 text-subtle-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-subtle-foreground" />
                            )}
                          </Button>
                        ) : (
                          <div className="w-4" />
                        )}
                        <span className={`${item.level > 0 ? 'text-muted-foreground text-wrap max-w-48' : 'text-foreground font-medium'}`}>
                          {item.displayName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-foreground text-left border-r border-border last:border-r-0">
                      {formatCurrencyCompact(item.presupuestoOriginal, defaultCurrency)}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-foreground text-left border-r border-border last:border-r-0">
                      <div className="flex flex-col gap-2 text-left">
                        <span>{formatCurrencyCompact(item.presupuestoAprobado, defaultCurrency)}</span>
                        {!approvedDiff.isEqual && (
                          <Badge
                            className={cn(
                              "text-xs text-left w-fit font-normal py-1.5 leading-none rounded-full",
                              approvedDiff.isSavings
                                ? 'bg-muted text-foreground hover:bg-disabled border border-border-strong'
                                : 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-400'
                            )}
                          >
                            {approvedDiff.isSavings ? 'Por vender' : 'Sobre vendido'}: +{formatCurrencyCompact(Math.abs(item.presupuestoAprobado - item.presupuestoOriginal), defaultCurrency)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-foreground text-left border-r border-border last:border-r-0">
                      <div className="flex flex-col gap-2 text-left">
                        <span>{formatCurrencyCompact(item.pagado, defaultCurrency)}</span>
                        {!porGastarBadge.isEqual && (
                          <Badge
                            className={cn(
                              "text-xs text-left w-fit font-normal py-1.5 leading-none rounded-full",
                              porGastarBadge.isRemaining
                                ? 'bg-muted text-subtle-foreground hover:bg-muted border border-border-strong'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-400'
                            )}
                          >
                            {porGastarBadge.isRemaining ? 'Por pagar' : 'Sobre pagado'} - {formatCurrencyCompact(Math.abs(item.porGastar), defaultCurrency)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-foreground text-left border-r border-border last:border-r-0">
                      {item.avance}%
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-subtle-foreground text-left border-r border-border last:border-r-0">
                      {item.fechaInicio || '-'}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-subtle-foreground text-left border-r border-border last:border-r-0">
                      {item.fechaFin || '-'}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-subtle-foreground text-left border-r border-border last:border-r-0">
                      <DropdownMenuComponentSalesPartida
                        partida={item.originalDoc!}
                        level={item.level}
                        rowData={item}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
