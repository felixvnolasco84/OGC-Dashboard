import React, { useState, useMemo } from "react";
import { Doc, Id } from "convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import DropdownMenuComponentPartida from "../DropdownMenu/DropdownMenuComponenPartida";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

// Hierarchical structure helper types
// Extend Doc<"partidas"> with hierarchical properties
type PartidaRow = Omit<Partial<Doc<"partidas">>, 'pagado' | 'total' | 'aprobado'> & {
  displayName: string; // For rendering partida/familia/sub_partida name
  presupuestoOriginal: number;
  presupuestoAprobado: number;
  pagado: number;
  porGastar: number; // Read from database: presupuesto_aprobado - pagado
  avance: number;
  expanded: boolean;
  detailsExpanded: boolean; // For showing precio unitario details
  level: number; // 0 = partida, 1 = familia, 2 = sub_partida
  children: PartidaRow[];
  originalDoc?: Doc<"partidas">; // Store original doc for level 2 items
  uniqueId: string; // Unique identifier for React keys
  // Precio unitario details
  unidad?: string;
  cantidad?: number;
  precioUnitario?: number;
};

type HierarchicalGroup = PartidaRow & {
  familias: Record<string, PartidaRow>;
};

// Compare approved vs original for "Presupuesto aprobado" column
const getApprovedVsOriginal = (original: number, approved: number) => {
  const difference = approved - original;
  const isSavings = difference < 0; // Approved < Original (savings)
  const isIncrement = difference > 0; // Approved > Original (increment)
  const isEqual = difference === 0;
  const absoluteDiff = Math.abs(difference);
  const formattedAmount = new Intl.NumberFormat('es-MX').format(absoluteDiff);
  return { isSavings, isIncrement, isEqual, formattedAmount };
};

// Helper to format por_gastar badge for "Pagado" column
const getPorGastarBadge = (porGastar: number) => {
  const isRemaining = porGastar > 0; // Positive = remaining to spend
  const isOverpayment = porGastar < 0; // Negative = overpayment
  const isEqual = porGastar === 0;
  const absoluteAmount = Math.abs(porGastar);
  const formattedAmount = new Intl.NumberFormat('es-MX').format(absoluteAmount);
  return { isRemaining, isOverpayment, isEqual, formattedAmount };
};

interface PresupuestoTableProps {
  data: Doc<"partidas">[];
  status: "CanLoadMore" | "LoadingFirstPage" | "LoadingMore" | "Exhausted";
  showPrecioUnitario: boolean;
  filteredPayments?: Record<string, number>;
  dateFilterLabel?: string;
  loadMore: (numItems: number) => void;
}

export default function PresupuestoTable({ data, status, showPrecioUnitario, filteredPayments, dateFilterLabel, loadMore }: PresupuestoTableProps) {
  // Get project's default currency based on transaction history
  const projectId = data.length > 0 ? data[0].proyecto : undefined;
  const currencyInfo = useQuery(
    api.currency_helpers.getProjectDefaultCurrency,
    projectId ? { proyecto_id: projectId as Id<"desarrollos"> } : "skip"
  );
  const defaultCurrency = currencyInfo?.defaultCurrency || "MXN";

  // Get proyecto data for honorarios info
  const proyecto = useQuery(
    api.desarrollos.getById,
    projectId ? { id: projectId as Id<"desarrollos"> } : "skip"
  );

  // Helper to check if item is "Honorarios" (case-insensitive, trimmed)
  const isHonorariosItem = (nombre: string | undefined) => {
    return nombre?.toLowerCase().trim() === "honorarios";
  };

  
  // Transform flat partidas data into hierarchical structure based on nivel
  const hierarchicalData = useMemo(() => {

    // Build hierarchy using partida_nombre field for robust grouping
    const grouped: Record<string, HierarchicalGroup> = {};

    // First pass: Create all nivel 1 (partida) groups
    data.filter(item => item.nivel === 1).forEach(item => {
      const partidaKey = item.nombre;
      const presupuestoAprobado = item.presupuesto_aprobado || 0;
      const pagado = item.pagado || 0;
      // Use por_gastar from DB if available, otherwise calculate it
      const porGastar = item.por_gastar !== undefined ? item.por_gastar : (presupuestoAprobado - pagado);

      grouped[partidaKey] = {
        displayName: partidaKey,
        nombre: partidaKey,
        proyecto: item.proyecto,
        nivel: 1, // Partida level = nivel 1
        presupuestoOriginal: item.presupuesto_original || 0,
        presupuestoAprobado,
        pagado,
        porGastar, // Use por_gastar from database or calculated
        avance: 0,
        expanded: false,
        detailsExpanded: false,
        level: 0,
        children: [] as PartidaRow[],
        familias: {} as Record<string, PartidaRow>,
        originalDoc: item, // Store original database doc for editing
        uniqueId: `partida-${partidaKey}`, // Stable unique ID for partida level
        unidad: item.unidad,
        cantidad: item.cantidad,
        precioUnitario: item.precio_unitario,
      };
    });

    // Second pass: Add nivel 2 (familia) items to their parent partida
    data.filter(item => item.nivel === 2).forEach(item => {
      const partidaKey = item.partida_nombre || item.nombre;
      const partida = grouped[partidaKey];

      if (partida) {
        const familiaKey = item.familia;
        const presupuestoAprobado = item.presupuesto_aprobado || 0;
        const pagado = item.pagado || 0;
        // Use por_gastar from DB if available, otherwise calculate it
        const porGastar = item.por_gastar !== undefined ? item.por_gastar : (presupuestoAprobado - pagado);

        const familiaGroup: PartidaRow = {
          displayName: familiaKey,
          nombre: partidaKey,
          familia: familiaKey,
          partida_nombre: partidaKey, // Add parent reference for nivel 2
          proyecto: item.proyecto,
          nivel: 2, // Familia level = nivel 2
          presupuestoOriginal: item.presupuesto_original || 0,
          presupuestoAprobado,
          pagado,
          porGastar, // Use por_gastar from database or calculated
          avance: 0,
          expanded: false,
          detailsExpanded: false,
          level: 1,
          children: [] as PartidaRow[],
          originalDoc: item, // Store original database doc for editing
          uniqueId: `familia-${partidaKey}-${familiaKey}`, // Stable unique ID for familia level
          unidad: item.unidad,
          cantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
        };
        partida.familias[familiaKey] = familiaGroup;
        partida.children.push(familiaGroup);
      }
    });

    // Third pass: Add nivel 3 (sub-partida) items to their parent familia
    data.filter(item => item.nivel === 3).forEach(item => {
      const partidaKey = item.partida_nombre;
      const familiaKey = item.familia;

      if (partidaKey && grouped[partidaKey] && grouped[partidaKey].familias[familiaKey]) {
        const familiaGroup = grouped[partidaKey].familias[familiaKey];
        const presupuestoAprobado = item.presupuesto_aprobado || 0;
        const pagado = item.pagado || 0;
        // Use por_gastar from DB if available, otherwise calculate it
        const porGastar = item.por_gastar !== undefined ? item.por_gastar : (presupuestoAprobado - pagado);

        familiaGroup.children.push({
          ...item,
          displayName: item.sub_partida || item.nombre, // Use sub_partida as display name for nivel 3
          sub_partida: item.sub_partida || item.nombre, // Ensure sub_partida is set
          presupuestoOriginal: item.presupuesto_original || 0,
          presupuestoAprobado,
          pagado,
          porGastar, // Use por_gastar from database or calculated
          avance: 0,
          expanded: false,
          detailsExpanded: false,
          level: 2,
          children: [],
          originalDoc: item,
          uniqueId: item._id, // Use database _id for nivel 3 items
          unidad: item.unidad,
          cantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
        });
      }
    });

    // Calculate avance for all levels
    const result = Object.values(grouped).map((partidaGroup) => {
      // Calculate avance for partida level (pagado already set from database)
      partidaGroup.avance = partidaGroup.presupuestoAprobado > 0
        ? Math.round((partidaGroup.pagado / partidaGroup.presupuestoAprobado) * 100)
        : 0;

      partidaGroup.children.forEach((familia: PartidaRow) => {
        // Calculate avance for familia level (pagado already set from database)
        familia.avance = familia.presupuestoAprobado > 0
          ? Math.round((familia.pagado / familia.presupuestoAprobado) * 100)
          : 0;

        // Calculate avance for sub-partida level (pagado already set from database)
        familia.children.forEach((subPartida: PartidaRow) => {
          subPartida.avance = subPartida.presupuestoAprobado > 0
            ? Math.round((subPartida.pagado / subPartida.presupuestoAprobado) * 100)
            : 0;
        });

        // If familia has no children, clear children array
        if (familia.children.length === 0) {
          familia.children = [];
        }
      });

      // Return without familias object
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { familias, ...budgetItem } = partidaGroup;
      return budgetItem as PartidaRow;
    });

    return result;
  }, [data]);

  const [budgetData, setBudgetData] = useState<PartidaRow[]>([]);
  // const [showPrecioUnitario, setShowPrecioUnitario] = useState(false);

  // Update budgetData when hierarchicalData changes
  useMemo(() => {
    setBudgetData(hierarchicalData);
  }, [hierarchicalData]);

  // Function to toggle expanded state of an item using uniqueId
  const toggleExpanded = (uniqueId: string) => {
    const updateExpanded = (items: PartidaRow[]): PartidaRow[] => {
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

  // Function to toggle precio unitario columns visibility
  // const togglePrecioUnitario = () => {
  //   setShowPrecioUnitario(!showPrecioUnitario);
  // };

  // Function to flatten the hierarchical data for rendering
  const flattenData = (items: PartidaRow[], result: PartidaRow[] = []): PartidaRow[] => {
    items.forEach(item => {
      result.push(item);
      if (item.expanded && item.children && item.children.length > 0) {
        flattenData(item.children, result);
      }
    });
    return result;
  };

  const flattenedData = flattenData(budgetData);

  // Compute filtered pagado for an item (recursively aggregates children)
  const getFilteredPagado = (item: PartidaRow): number => {
    if (!filteredPayments) return item.pagado;
    const directPayment = filteredPayments[item.originalDoc?._id || ""] || 0;
    if (!item.children || item.children.length === 0) {
      return directPayment;
    }
    return directPayment + item.children.reduce((sum, child) => sum + getFilteredPagado(child), 0);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-white">
            <TableRow className="border-b border-gray-200">

              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                Partida - Familia - Subpartida
              </TableHead>
              {/* <TableHead 
                className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 cursor-pointer hover:bg-gray-50"
                onClick={togglePrecioUnitario}
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showPrecioUnitario && "rotate-90")} />
                  <span>Precio unitario</span>
                </div>
              </TableHead> */}
              {showPrecioUnitario && (
                <>
                  <TableHead className="px-6 py-4  text-base font-medium  border-r border-gray-200 ">
                    Unidad
                  </TableHead>
                  <TableHead className="px-6 py-4  text-base font-medium  border-r border-gray-200 ">
                    Cantidad
                  </TableHead>
                  <TableHead className="px-6 py-4  text-base font-medium  border-r border-gray-200 ">
                    Precio Unitario
                  </TableHead>
                </>
              )}
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                Presupuesto original
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                Presupuesto aprobado
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                {dateFilterLabel ? `Pagado (${dateFilterLabel})` : "Pagado"}
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                Avance
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>

            {flattenedData.map((item) => {
              // Calculate differences for each column
              const approvedDiff = getApprovedVsOriginal(item.presupuestoOriginal, item.presupuestoAprobado);
              const displayPagado = getFilteredPagado(item);
              const porGastarBadge = getPorGastarBadge(item.porGastar);

              return (
                <React.Fragment key={item.uniqueId}>
                  <TableRow
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <TableCell className="px-4 py-4 text-base text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
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
                              <ChevronDown className="h-4 w-4 text-[#AFAEA2]" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-[#AFAEA2]" />
                            )}
                          </Button>
                        ) : (
                          <div className="w-4" />
                        )}
                        <span className={`${item.level > 0 ? 'text-gray-600 text-wrap max-w-48' : 'text-gray-900 font-medium'}`}>
                          {item.displayName}
                        </span>
                      </div>
                    </TableCell>
                    {/* <TableCell className="px-4 py-4 text-base text-[#AFAEA2] border-r border-gray-100 last:border-r-0 text-center">
                    </TableCell> */}
                    {showPrecioUnitario && (
                      <>
                        <TableCell className="px-4 py-4 text-base text-[#AFAEA2] text-left border-r font-light border-gray-100">
                          {item.unidad || null}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-base text-[#AFAEA2] text-left border-r font-light border-gray-100">
                          {item.cantidad ? item.cantidad.toLocaleString('es-MX') : null}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-base text-[#AFAEA2] text-left border-r font-light border-gray-100">
                          {item.precioUnitario ? formatCurrency(item.precioUnitario, defaultCurrency) : null}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="px-4 py-4 text-base text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                      {formatCurrency(item.presupuestoOriginal, defaultCurrency)}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                      <div className="flex flex-col gap-2 text-left">
                        <span>{formatCurrency(item.presupuestoAprobado, defaultCurrency)}</span>
                        {!approvedDiff.isEqual && (
                          <Badge
                            className={cn(
                              "text-xs text-left w-fit font-normal py-1.5 leading-none rounded-full",
                              approvedDiff.isSavings
                                ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-400'
                                : 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-400'
                            )}
                          >
                            {approvedDiff.isSavings ? 'Ahorro' : 'Incremento'}: +{formatCurrency(Math.abs(item.presupuestoAprobado - item.presupuestoOriginal), defaultCurrency)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                      <div className="flex flex-col gap-2 text-left">
                        {/* For Honorarios level 0 items, show honorarios_monto from proyecto in pagado column */}
                        {item.level === 0 && isHonorariosItem(item.nombre) && proyecto?.honorarios_monto !== undefined && !filteredPayments ? (
                          <span>{formatCurrency(proyecto.honorarios_monto, defaultCurrency)}</span>
                        ) : (
                          <span>{formatCurrency(displayPagado, defaultCurrency)}</span>
                        )}
                        {!filteredPayments && !porGastarBadge.isEqual && (
                          <Badge
                            className={cn(
                              "text-xs text-left w-fit font-normal py-1.5 leading-none rounded-full",
                              porGastarBadge.isRemaining
                                ? 'bg-[#f5f5f5] text-[#AFAEA2] hover:bg-[#f5f5f5] border border-[#b8b7ac]'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-400'
                            )}
                          >
                            {porGastarBadge.isRemaining ? 'Por gastar' : 'Incremento'} - {formatCurrency(Math.abs(item.porGastar), defaultCurrency)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                      {/* For Honorarios level 0 items, show honorarios_porcentaje from proyecto */}
                      {item.level === 0 && isHonorariosItem(item.nombre) && proyecto?.honorarios_porcentaje !== undefined ? (
                        <span>{proyecto.honorarios_porcentaje}%</span>
                      ) : (
                        <span>{item.avance}%</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-base text-[#AFAEA2] text-left border-r border-gray-100 last:border-r-0">
                      <DropdownMenuComponentPartida
                        partida={item.originalDoc!}
                        level={item.level}
                        rowData={item}
                      />
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {status === "CanLoadMore" && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            onClick={() => loadMore(100)}
            disabled={status !== "CanLoadMore"}
          >
            Cargar más partidas
          </Button>
        </div>
      )}

      {status === "LoadingMore" && (
        <div className="flex justify-center py-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
            <p className="text-base text-[#AFAEA2]">Cargando más partidas...</p>
          </div>
        </div>
      )}

      {status === "Exhausted" && data.length > 100 && (
        <div className="flex justify-center py-4">
          <p className="text-base text-[#AFAEA2]">Todas las partidas han sido cargadas</p>
        </div>
      )}
    </div>
  );
}
