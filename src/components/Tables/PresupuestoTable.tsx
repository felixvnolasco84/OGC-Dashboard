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
  avance: number;
  fechaInicio?: string;
  fechaFin?: string;
  expanded: boolean;
  level: number; // 0 = partida, 1 = familia, 2 = sub_partida
  children: PartidaRow[];
  originalDoc?: Doc<"partidas">; // Store original doc for level 2 items
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

const getBudgetDifference = (original: number, approved: number) => {
  const difference = approved - original;
  const isPositive = difference > 0;
  const isNegative = difference < 0;
  const isZero = difference === 0;
  const formattedDifference = formatCurrency(Math.abs(difference));
  return { difference, isPositive, isNegative, isZero, formattedDifference };
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
      grouped[partidaKey] = {
        displayName: partidaKey,
        nombre: partidaKey,
        proyecto: item.proyecto,
        nivel: 1, // Partida level = nivel 1
        presupuestoOriginal: item.presupuesto_original || 0,
        presupuestoAprobado: item.presupuesto_aprobado || 0,
        pagado: item.pagado || 0, // Use pagado from database
        avance: 0,
        fechaInicio: "-",
        fechaFin: "-",
        expanded: false,
        level: 0,
        children: [] as PartidaRow[],
        familias: {} as Record<string, PartidaRow>
      };
    });
    
    // Second pass: Add nivel 2 (familia) items to their parent partida
    data.filter(item => item.nivel === 2).forEach(item => {
      const partidaKey = item.partida_nombre || item.nombre;
      const partida = grouped[partidaKey];
      
      if (partida) {
        const familiaKey = item.familia;
        const familiaGroup: PartidaRow = {
          displayName: familiaKey,
          nombre: partidaKey,
          familia: familiaKey,
          partida_nombre: partidaKey, // Add parent reference for nivel 2
          proyecto: item.proyecto,
          nivel: 2, // Familia level = nivel 2
          presupuestoOriginal: item.presupuesto_original || 0,
          presupuestoAprobado: item.presupuesto_aprobado || 0,
          pagado: item.pagado || 0, // Use pagado from database
          avance: 0,
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 1,
          children: [] as PartidaRow[]
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
        familiaGroup.children.push({
          ...item,
          displayName: item.sub_partida || item.nombre, // Use sub_partida as display name for nivel 3
          sub_partida: item.sub_partida || item.nombre, // Ensure sub_partida is set
          presupuestoOriginal: item.presupuesto_original || 0,
          presupuestoAprobado: item.presupuesto_aprobado || 0,
          pagado: item.pagado || 0, // Use pagado from database
          avance: 0,
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 2,
          children: [],
          originalDoc: item
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

  // Function to toggle expanded state of an item
  const toggleExpanded = (displayName: string, level: number) => {
    const updateExpanded = (items: PartidaRow[]): PartidaRow[] => {
      return items.map(item => {
        if (item.displayName === displayName && item.level === level) {
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
            <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              Partida - Familia - Subpartida
            </TableHead>
            <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              Presupuesto original
            </TableHead>
            <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              Presupuesto aprobado
            </TableHead>
            <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              Pagado
            </TableHead>
            <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              Avance
            </TableHead>
            <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              Fecha inicio
            </TableHead>
            <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
              Fecha fin
            </TableHead>
            <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flattenedData.map((item) => {
            const { difference, isPositive, isNegative, isZero, formattedDifference } = getBudgetDifference(item.presupuestoOriginal, item.pagado);
            return (
              <TableRow
                key={`${item.displayName}-${item.level}`}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                  <div
                    className="flex items-center space-x-2"
                    style={{ paddingLeft: `${item.level * 20}px` }}
                  >
                    {item.children && item.children.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(item.displayName, item.level)}
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
                <TableCell className="px-6 py-4 text-sm text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                  {formatCurrency(item.presupuestoOriginal)} MXN
                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                  <div className="flex flex-col  gap-2 text-left">
                    <span >{formatCurrency(item.presupuestoAprobado)} MXN</span>
                    {!isZero && item.level === 0 && (
                      <Badge
                        variant={isPositive ? 'success' : 'danger'}
                        className={cn("text-xs text-left w-fit font-normal py-1.5 leading-none", isPositive ? 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-500' : 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-500')}
                      >
                        {isPositive ? '+' : '-'} {formattedDifference} MXN
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                  <div className="flex flex-col  gap-2 text-left">
                    <span >{formatCurrency(item.pagado)} MXN</span>
                    {!isNegative && (
                      <Badge
                        variant="success"
                        className={cn("text-xs text-left w-fit font-normal py-1.5 leading-none", isPositive ? 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-500' : 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-500')}
                      >
                       {isPositive ? '+' : '-'} {formatCurrency(difference)} MXN
                      </Badge>
                    )}
                  </div>

                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-gray-900 text-left border-r border-gray-100 last:border-r-0">
                  {item.avance}%
                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-gray-500 text-left border-r border-gray-100 last:border-r-0">
                  {item.fechaInicio || '-'}
                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-gray-500 text-left border-r border-gray-100 last:border-r-0">
                  {item.fechaFin || '-'}
                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-gray-500 text-left border-r border-gray-100 last:border-r-0">
                  <Button variant="outline" size="sm">
                    <DropdownMenuComponentPartida
                      partida={item.originalDoc || ({
                        _id: item._id || `temp-${item.displayName}`,
                        _creationTime: Date.now(),
                        nombre: item.nombre || item.displayName,
                        familia: item.familia || '',
                        sub_partida: item.sub_partida || '',
                        proyecto: item.proyecto, // Include proyecto for querying payments
                        nivel: item.nivel || 0,
                        unidad: item.unidad || '',
                        cantidad: item.cantidad || 0,
                        precio_unitario: item.precio_unitario || 0,
                        presupuesto_original: item.presupuestoOriginal || 0,
                        presupuesto_aprobado: item.presupuestoAprobado || 0,
                        pagado: item.pagado || 0,
                        archivo_origen: 'aggregated',
                      } as Doc<"partidas">)}
                      level={item.level}
                      rowData={item}
                    />
                  </Button>
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
          <p className="text-sm text-gray-500">Cargando más partidas...</p>
        </div>
      </div>
    )}
    
    {status === "Exhausted" && data.length > 100 && (
      <div className="flex justify-center py-4">
        <p className="text-sm text-gray-500">Todas las partidas han sido cargadas</p>
      </div>
    )}
  </div>
  );
}
