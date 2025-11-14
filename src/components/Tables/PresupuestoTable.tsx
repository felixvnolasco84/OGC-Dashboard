import { useState, useMemo } from "react";
import { Doc } from "convex/_generated/dataModel";
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
import { cn } from "@/lib/utils";
import DropdownMenuComponentPartida from "../DropdownMenu/DropdownMenuComponenPartida";

// Hierarchical structure helper types
// Extend Doc<"partidas"> with hierarchical properties
type PartidaRow = Omit<Partial<Doc<"partidas">>, 'pagado' | 'total' | 'aprobado'> & {
  displayName: string; // For rendering partida/familia/sub_partida name
  presupuestoOriginal: number;
  presupuestoAprobado: number;
  pagado: number;
  porGastar: number; // Read from database: presupuesto_aprobado - pagado
  avance: number;
  fechaInicio?: string;
  fechaFin?: string;
  expanded: boolean;
  level: number; // 0 = partida, 1 = familia, 2 = sub_partida
  children: PartidaRow[];
  originalDoc?: Doc<"partidas">; // Store original doc for level 2 items
  uniqueId: string; // Unique identifier for React keys
};

type HierarchicalGroup = PartidaRow & {
  familias: Record<string, PartidaRow>;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
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
  loadMore: (numItems: number) => void;  
}

export default function PresupuestoTable({ data, status, loadMore }: PresupuestoTableProps) {

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
        fechaInicio: "-",
        fechaFin: "-",
        expanded: false,
        level: 0,
        children: [] as PartidaRow[],
        familias: {} as Record<string, PartidaRow>,
        originalDoc: item, // Store original database doc for editing
        uniqueId: `partida-${partidaKey}` // Stable unique ID for partida level
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
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 1,
          children: [] as PartidaRow[],
          originalDoc: item, // Store original database doc for editing
          uniqueId: `familia-${partidaKey}-${familiaKey}` // Stable unique ID for familia level
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
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 2,
          children: [],
          originalDoc: item,
          uniqueId: item._id // Use database _id for nivel 3 items
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



  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-white">
            <TableRow className="border-b border-gray-200">

              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">                
                {data[0].proyecto === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Unidad" : "Partida - Familia - Subpartida"}
                
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                {data[0].proyecto === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Total Ventas" : "Presupuesto original"}
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                {data[0].proyecto === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Vendido" : "Presupuesto aprobado"}
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                Pagado
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                Avance
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                Fecha inicio
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                Fecha fin
              </TableHead>
              <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>

            {flattenedData.map((item) => {
              // Calculate differences for each column
              const approvedDiff = getApprovedVsOriginal(item.presupuestoOriginal, item.presupuestoAprobado);
              const porGastarBadge = getPorGastarBadge(item.porGastar);

              return (
                <TableRow
                  key={item.uniqueId}
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
                            <ChevronDown className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-500" />
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
                  <TableCell className="px-4 py-4 text-base text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                    {formatCurrency(item.presupuestoOriginal)} MXN
                  </TableCell>
                  <TableCell className="px-4 py-4 text-base text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                    <div className="flex flex-col gap-2 text-left">
                      <span>{formatCurrency(item.presupuestoAprobado)} MXN</span>
                      {!approvedDiff.isEqual && (
                        <Badge
                          className={cn(
                            "text-xs text-left w-fit font-normal py-1.5 leading-none rounded-full",
                            approvedDiff.isSavings
                              ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-400'
                              : 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-400'
                          )}
                        >
                          {approvedDiff.isSavings ? 'Ahorro' : 'Incremento'}: +${approvedDiff.formattedAmount} MXN
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4 text-base text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                    <div className="flex flex-col gap-2 text-left">
                      <span>{formatCurrency(item.pagado)} MXN</span>
                      {!porGastarBadge.isEqual && (
                        <Badge
                          className={cn(
                            "text-xs text-left w-fit font-normal py-1.5 leading-none rounded-full",
                            porGastarBadge.isRemaining
                              ? 'bg-[#f5f5f5] text-gray-500 hover:bg-[#f5f5f5] border border-[#b8b7ac]'
                              : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-400'
                          )}
                        >
                          {porGastarBadge.isRemaining ? 'Por ejercer' : 'Incremento'}: +${porGastarBadge.formattedAmount} MXN
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4 text-base text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                    {item.avance}%
                  </TableCell>
                  <TableCell className="px-4 py-4 text-base text-gray-500 text-left border-r border-gray-100 last:border-r-0">
                    {item.fechaInicio || '-'}
                  </TableCell>
                  <TableCell className="px-4 py-4 text-base text-gray-500 text-left border-r border-gray-100 last:border-r-0">
                    {item.fechaFin || '-'}
                  </TableCell>
                  <TableCell className="px-4 py-4 text-base text-gray-500 text-left border-r border-gray-100 last:border-r-0">

                    <DropdownMenuComponentPartida
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
            <p className="text-base text-gray-500">Cargando más partidas...</p>
          </div>
        </div>
      )}

      {status === "Exhausted" && data.length > 100 && (
        <div className="flex justify-center py-4">
          <p className="text-base text-gray-500">Todas las partidas han sido cargadas</p>
        </div>
      )}
    </div>
  );
}
