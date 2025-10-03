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
}

export default function PresupuestoTable({ data }: PresupuestoTableProps) {
  // Transform flat partidas data into hierarchical structure
  const hierarchicalData = useMemo(() => {
    // Group by partida (nombre) -> familia -> sub_partida
    const grouped = data.reduce<Record<string, HierarchicalGroup>>((acc, item) => {
      const partidaKey = item.nombre;
      const familiaKey = item.familia;
      const subPartidaKey = item.sub_partida;

      if (!acc[partidaKey]) {
        acc[partidaKey] = {
          displayName: partidaKey,
          nombre: partidaKey,
          presupuestoOriginal: 0,
          presupuestoAprobado: 0,
          pagado: 0,
          avance: 0,
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 0,
          children: [] as PartidaRow[],
          familias: {} as Record<string, PartidaRow>
        };
      }

      const partidaGroup = acc[partidaKey];

      // Add to partida totals
      partidaGroup.presupuestoOriginal += parseFloat(item.total || "0");
      partidaGroup.presupuestoAprobado += parseFloat(item.aprobado || "0");
      partidaGroup.pagado += parseFloat(item.pagado || "0");

      // Create or update familia group
      if (!partidaGroup.familias[familiaKey]) {
        partidaGroup.familias[familiaKey] = {
          displayName: familiaKey,
          nombre: partidaKey,
          familia: familiaKey,
          presupuestoOriginal: 0,
          presupuestoAprobado: 0,
          pagado: 0,
          avance: 0,
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 1,
          children: [] as PartidaRow[]
        };
        partidaGroup.children.push(partidaGroup.familias[familiaKey]);
      }

      const familiaGroup = partidaGroup.familias[familiaKey];

      // Add to familia totals
      familiaGroup.presupuestoOriginal += parseFloat(item.total || "0");
      familiaGroup.presupuestoAprobado += parseFloat(item.aprobado || "0");
      familiaGroup.pagado += parseFloat(item.pagado || "0");

      // Add sub_partida as a child of familia only if it's meaningful
      // (not empty, not the same as familia name)
      const hasValidSubPartida = subPartidaKey &&
        subPartidaKey.trim() !== '' &&
        subPartidaKey !== familiaKey;

      if (hasValidSubPartida) {
        familiaGroup.children.push({
          ...item, // Include all original partida properties
          displayName: subPartidaKey,
          presupuestoOriginal: parseFloat(item.total || "0"),
          presupuestoAprobado: parseFloat(item.aprobado || "0"),
          pagado: parseFloat(item.pagado || "0"),
          avance: parseFloat(item.aprobado || "0") > 0
            ? Math.round((parseFloat(item.pagado || "0") / parseFloat(item.aprobado || "0")) * 100)
            : 0,
          fechaInicio: "-",
          fechaFin: "-",
          expanded: false,
          level: 2,
          children: [],
          originalDoc: item // Store the original doc
        });
      }

      return acc;
    }, {});

    // Calculate avance for partidas and familias
    // Also filter out familias with no meaningful children
    const result = Object.values(grouped).map((partidaGroup) => {
      partidaGroup.avance = partidaGroup.presupuestoAprobado > 0
        ? Math.round((partidaGroup.pagado / partidaGroup.presupuestoAprobado) * 100)
        : 0;

      partidaGroup.children.forEach((familia: PartidaRow) => {
        familia.avance = familia.presupuestoAprobado > 0
          ? Math.round((familia.pagado / familia.presupuestoAprobado) * 100)
          : 0;

        // If familia has no children or only one child with same name, clear children array
        if (familia.children.length === 0 ||
          (familia.children.length === 1 && familia.children[0].displayName === familia.displayName)) {
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
            const { difference, isPositive, isNegative, isZero, formattedDifference } = getBudgetDifference(item.presupuestoOriginal, item.presupuestoAprobado);
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
                    <span className={`${item.level > 0 ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
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
                    {!isZero && (
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
                        className={cn("text-xs text-left w-fit font-normal py-1.5 leading-none", isPositive ? 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-500' : 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-500')}
                      >
                        {difference} MXN
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
                        Cantidad: item.presupuestoOriginal.toString(),
                        PrecioUnitario: '0',
                        Subtotal: item.presupuestoOriginal.toString(),
                        Iva: '0',
                        total: item.presupuestoOriginal.toString(),
                        aprobado: item.presupuestoAprobado.toString(),
                        pagado: item.pagado.toString(),
                        por_liquidar: (item.presupuestoAprobado - item.pagado).toString(),
                        actual: item.pagado.toString(),
                        fecha_carga: new Date().toLocaleDateString('es-MX'),
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
  );
}
