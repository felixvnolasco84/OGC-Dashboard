import { useState } from "react";
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

// Mock hierarchical budget data
const mockBudgetData = [
  {
    id: 1,
    partida: "Cimentación",
    presupuestoOriginal: 452000,
    presupuestoAprobado: 450000,
    pagado: 350000,
    avance: 65,
    fechaInicio: "12 Sep 2025",
    fechaFin: "12 Sep 2025",
    expanded: false,
    level: 0,
    children: [
      {
        id: 2,
        partida: "Acero",
        presupuestoOriginal: 452000,
        presupuestoAprobado: 450000,
        pagado: 350000,
        avance: 35,
        fechaInicio: "12 Sep 2025",
        fechaFin: "12 Sep 2025",
        expanded: false,
        level: 1,
        children: []
      },
      {
        id: 3,
        partida: "Cimbra",
        presupuestoOriginal: 452000,
        presupuestoAprobado: 450000,
        pagado: 350000,
        avance: 45,
        fechaInicio: "12 Sep 2025",
        fechaFin: "12 Sep 2025",
        expanded: false,
        level: 1,
        children: [
          {
            id: 4,
            partida: "Barrote de pino de 3A",
            presupuestoOriginal: 452000,
            presupuestoAprobado: 450000,
            pagado: 350000,
            avance: 65,
            fechaInicio: "12 Sep 2025",
            fechaFin: "12 Sep 2025",
            expanded: false,
            level: 2,
            children: []
          },
          {
            id: 5,
            partida: "Polín de pino de 3A",
            presupuestoOriginal: 452000,
            presupuestoAprobado: 450000,
            pagado: 350000,
            avance: 65,
            fechaInicio: "12 Sep 2025",
            fechaFin: "12 Sep 2025",
            expanded: false,
            level: 2,
            children: []
          },
          {
            id: 6,
            partida: "Cuña metálica para sujeción",
            presupuestoOriginal: 452000,
            presupuestoAprobado: 450000,
            pagado: 350000,
            avance: 65,
            fechaInicio: "12 Sep 2025",
            fechaFin: "12 Sep 2025",
            expanded: false,
            level: 2,
            children: []
          },
          {
            id: 7,
            partida: "Distanciadores 20-30 cm",
            presupuestoOriginal: 452000,
            presupuestoAprobado: 450000,
            pagado: 350000,
            avance: 65,
            fechaInicio: "12 Sep 2025",
            fechaFin: "12 Sep 2025",
            expanded: false,
            level: 2,
            children: []
          }
        ]
      }
    ]
  }
];

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

type BudgetItem = {
  id: number;
  partida: string;
  presupuestoOriginal: number;
  presupuestoAprobado: number;
  pagado: number;
  avance: number;
  fechaInicio: string;
  fechaFin: string;
  expanded: boolean;
  level: number;
  children: BudgetItem[];
};

export default function PresupuestoTable() {
  const [budgetData, setBudgetData] = useState<BudgetItem[]>(mockBudgetData);

  // Function to toggle expanded state of an item
  const toggleExpanded = (id: number) => {
    const updateExpanded = (items: BudgetItem[]): BudgetItem[] => {
      return items.map(item => {
        if (item.id === id) {
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
  const flattenData = (items: BudgetItem[], result: BudgetItem[] = []): BudgetItem[] => {
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
                key={item.id}
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
                        onClick={() => toggleExpanded(item.id)}
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
                      {item.partida}
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
                  {item.fechaInicio}
                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-gray-500 text-left border-r border-gray-100 last:border-r-0">
                  {item.fechaFin}
                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-gray-500 text-left border-r border-gray-100 last:border-r-0">
                  <Button variant="outline" size="sm">
                    Ver pagos
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
