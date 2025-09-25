import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import ProgramaObraGanttItem from "./ProgramaObraGanttItem";

// Mock data structure matching the image
const mockProgramaData = [
  {
    id: 1,
    partida: "Cimentación",
    presupuesto: 2345020,
    expanded: false,
    level: 0,
    timeline: {
      start: 1, // January
      duration: 2, // 2 months
      color: "bg-green-500",
      progress: 85,
      actualAmount: 2200000
    },
    children: []
  },
  {
    id: 2,
    partida: "Muros Planta Baja",
    presupuesto: 345020,
    expanded: false,
    level: 0,
    timeline: {
      start: 2, // February
      duration: 3, // 3 months
      color: "bg-green-600",
      progress: 70,
      actualAmount: 380000
    },
    children: []
  },
  {
    id: 3,
    partida: "Losa Primer Nivel",
    presupuesto: 1832020,
    expanded: false,
    level: 0,
    timeline: {
      start: 3, // March
      duration: 2, // 2 months
      color: "bg-green-400",
      progress: 60,
      actualAmount: 1211599
    },
    children: []
  },
  {
    id: 4,
    partida: "Electricidad",
    presupuesto: 623498,
    expanded: false,
    level: 0,
    timeline: {
      start: 3, // March
      duration: 5, // 5 months
      color: "bg-green-300",
      progress: 45,
      actualAmount: 500000
    },
    children: []
  },
  {
    id: 5,
    partida: "Yeso y Pintura",
    presupuesto: 2345020,
    expanded: true,
    level: 0,
    timeline: null, // Parent doesn't have its own timeline
    children: [
      {
        id: 6,
        partida: "Yeso en muros",
        presupuesto: 12000,
        expanded: false,
        level: 1,
        timeline: {
          start: 4, // April
          duration: 3, // 3 months
          color: "bg-green-400",
          progress: 30,
          actualAmount: 8500
        },
        children: []
      },
      {
        id: 7,
        partida: "Yeso en plafones",
        presupuesto: 145020,
        expanded: false,
        level: 1,
        timeline: {
          start: 5, // May
          duration: 4, // 4 months
          color: "bg-green-500",
          progress: 20,
          actualAmount: 120000
        },
        children: []
      },
      {
        id: 8,
        partida: "Bufas",
        presupuesto: 2345020,
        expanded: false,
        level: 1,
        timeline: {
          start: 6, // June
          duration: 3, // 3 months
          color: "bg-green-600",
          progress: 10,
          actualAmount: 2100000
        },
        children: []
      }
    ]
  },
  {
    id: 9,
    partida: "Plomería",
    presupuesto: 2345020,
    expanded: false,
    level: 0,
    timeline: {
      start: 7, // July
      duration: 2, // 2 months
      color: "bg-green-400",
      progress: 0,
      actualAmount: 0
    },
    children: []
  },
  {
    id: 10,
    partida: "Aire Acondicionado",
    presupuesto: 2345020,
    expanded: false,
    level: 0,
    timeline: {
      start: 8, // August
      duration: 1, // 1 month
      color: "bg-green-500",
      progress: 0,
      actualAmount: 0
    },
    children: []
  }
];

const months = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

type ProgramaItem = {
  id: number;
  partida: string;
  presupuesto: number;
  expanded: boolean;
  level: number;
  timeline: {
    start: number;
    duration: number;
    color: string;
    progress: number;
    actualAmount: number;
  } | null;
  children: ProgramaItem[];
};

export default function ProgramaObra() {
  const [programaData, setProgramaData] = useState<ProgramaItem[]>(mockProgramaData);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPartida, setSelectedPartida] = useState("Partida");
  const [selectedFamilia, setSelectedFamilia] = useState("Familia");
  const [selectedFecha, setSelectedFecha] = useState("Semana");

  // Function to toggle expanded state
  const toggleExpanded = (id: number) => {
    const updateExpanded = (items: ProgramaItem[]): ProgramaItem[] => {
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
    setProgramaData(updateExpanded(programaData));
  };

  // Function to flatten hierarchical data for rendering
  const flattenData = (items: ProgramaItem[], result: ProgramaItem[] = []): ProgramaItem[] => {
    items.forEach(item => {
      result.push(item);
      if (item.expanded && item.children && item.children.length > 0) {
        flattenData(item.children, result);
      }
    });
    return result;
  };

  const flattenedData = flattenData(programaData);

  const mockData = {
    project: {
      name: "Larena - Torre G",
      breadcrumb: "Presupuesto"
    },
    metrics: {
      presupuestoOriginal: {
        amount: 104225001.10,
        label: "Presupuesto Original"
      },
      presupuestoAprobado: {
        amount: 96563399.05,
        percentage: -4,
        label: "Presupuesto aprobado",
        badge: "Reducción 4%"
      },
      gastoTotal: {
        amount: 22759332.05,
        percentage: 23,
        label: "Gasto total",
        badge: "Avance 23%"
      },
      porGastar: {
        amount: 83495599.05,
        percentage: 77,
        label: "Por gastar",
        badge: "Pendiente 77%"
      }
    },
    filters: {
      partidas: ["Partida", "Cimentación", "Acero", "Cimbra"],
      familias: ["Familia", "Estructural", "Acabados", "Instalaciones"],
      fechas: ["Semana", "Mes", "Trimestre"]
    }
  };

  return (
    <div className="bg-white px-12 py-6">
      {/* Header Section */}
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-col text-left">
              <p className="text-sm text-gray-500 mb-1">{mockData.project.breadcrumb}</p>
              <h1 className="text-2xl text-gray-900">{mockData.project.name}</h1>
            </div>
          </div>
        </div>


        {/* Filters */}
        <div className="bg-white border-b border-gray-200 pb-4">
          <div className="grid grid-cols-4 items-center gap-6">
            {/* Search */}
            <div className="flex items-center space-x-3 text-left">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/* Partida Filter */}
            <div className="flex flex-col space-y-1 text-left">
              <span className="text-xs text-gray-500">Partida</span>
              <Select value={selectedPartida} onValueChange={setSelectedPartida}>
                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mockData.filters.partidas.map((partida) => (
                    <SelectItem key={partida} value={partida}>
                      {partida}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Familia Filter */}
            <div className="flex flex-col space-y-1 text-left">
              <span className="text-xs text-gray-500">Familia</span>
              <Select value={selectedFamilia} onValueChange={setSelectedFamilia}>
                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mockData.filters.familias.map((familia) => (
                    <SelectItem key={familia} value={familia}>
                      {familia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha Filter */}
            <div className="flex flex-col space-y-1 text-left">
              <span className="text-xs text-gray-500">Fecha</span>
              <Select value={selectedFecha} onValueChange={setSelectedFecha}>
                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mockData.filters.fechas.map((fecha) => (
                    <SelectItem key={fecha} value={fecha}>
                      {fecha}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>


      </div>

      {/* Gantt Chart Container */}
      <div className="border border-gray-200 overflow-hidden bg-white">
        <div className="flex">
          {/* Left Sidebar - Partidas */}
          <div className="w-80 border-r border-gray-200 bg-white">
            {/* Sidebar Header */}
            <div className="px-4 py-3 border-b border-gray-200 bg-white text-left">
              <div className="text-sm font-medium text-gray-600">Partida - Familia</div>
            </div>

            {/* Partidas List */}
            <div className="max-h-none overflow-y-auto">
              {flattenedData.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-4 border-b border-gray-100 hover:bg-gray-100 h-[81px] text-left"
                >
                  <div
                    className="flex items-center space-x-2 flex-1"
                    style={{ paddingLeft: `${item.level * 16}px` }}
                  >
                    {item.children && item.children.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(item.id)}
                        className="p-0 h-auto hover:bg-transparent"
                      >
                        {item.expanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    ) : (
                      <div className="w-4" />
                    )}
                    <span className={cn(
                      "text-sm",
                      item.level === 0 ? "font-medium text-gray-900" : "text-gray-600"
                    )}>
                      {item.partida}
                    </span>
                  </div>
                  {/* <div className="text-sm text-gray-600 ml-2">
                    {formatCurrency(item.presupuesto)}
                  </div> */}
                </div>
              ))}
            </div>
          </div>

          {/* Right Side - Timeline */}
          <div className="flex-1 overflow-x-auto">
            {/* Timeline Header */}
            <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
              <div className="px-4 py-3 text-sm font-medium text-gray-600 border-r border-gray-200 w-32 text-left">
                Presupuesto
              </div>
              <div className="flex">
                {months.slice(0, 8).map((month, index) => (
                  <div
                    key={index}
                    className="px-6 py-3 text-sm font-medium text-gray-600 border-r border-gray-200 w-32 text-left"
                  >
                    {month}
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 text-sm font-medium text-gray-600 ml-auto">
                2025
              </div>
            </div>

            {/* Timeline Rows */}
            <div className="relative">
              {flattenedData.map((item) => (
                <div key={item.id} className="flex border-b border-gray-100 hover:bg-gray-50 relative">
                  <div className="px-4 py-4 text-sm text-gray-600 border-r border-gray-200 w-32 h-[81px] text-left">
                    {formatCurrency(item.presupuesto)}
                  </div>

                  {/* Timeline Grid */}
                  <div className="flex relative flex-1">
                    {months.slice(0, 8).map((month, monthIndex) => (
                      <ProgramaObraGanttItem
                        key={`${month}-${monthIndex}`}
                        item={item}
                        monthIndex={monthIndex}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
