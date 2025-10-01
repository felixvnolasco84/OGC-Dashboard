import { useState, useEffect, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { Id } from "../../../convex/_generated/dataModel";
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
// import ProgramaGanttChart from "@/components/Charts/ProgramaGanttChart";

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
  id: string;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPartida, setSelectedPartida] = useState<string | undefined>(undefined);
  const [selectedFamilia, setSelectedFamilia] = useState<string | undefined>(undefined);
  const [selectedFecha, setSelectedFecha] = useState("Semana");

  // Fetch projects
  const projects = useQuery(api.desarrollos.getAll);

  // State for selected project
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"desarrollos"> | undefined>(undefined);

  // Set default project when projects load
  useEffect(() => {
    if (projects && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0]._id);
    }
  }, [projects, selectedProjectId]);

  // Fetch all partidas for selected project
  const allPartidas = useQuery(
    api.partida.getByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );

  // Transform partidas data into hierarchical structure for Gantt chart
  const programaData = useMemo(() => {
    if (!allPartidas) return [];

    type GroupedPartida = ProgramaItem & {
      familias: Record<string, ProgramaItem>;
    };

    // Group by partida (nombre) -> familia
    const grouped = allPartidas.reduce<Record<string, GroupedPartida>>((acc, item) => {
      const partidaKey = item.nombre;
      const familiaKey = item.familia;

      if (!acc[partidaKey]) {
        acc[partidaKey] = {
          id: `partida-${partidaKey}`,
          partida: partidaKey,
          presupuesto: 0,
          expanded: false,
          level: 0,
          timeline: null,
          children: [],
          familias: {} as Record<string, ProgramaItem>
        };
      }

      const partidaGroup = acc[partidaKey];
      partidaGroup.presupuesto += parseFloat(item.aprobado || "0");

      // Create or update familia group
      if (!partidaGroup.familias[familiaKey]) {
        partidaGroup.familias[familiaKey] = {
          id: `familia-${partidaKey}-${familiaKey}`,
          partida: familiaKey,
          presupuesto: 0,
          expanded: false,
          level: 1,
          timeline: {
            start: Math.floor(Math.random() * 8), // Mock timeline for now
            duration: Math.floor(Math.random() * 4) + 1,
            color: "bg-green-500",
            progress: parseFloat(item.aprobado || "0") > 0
              ? Math.round((parseFloat(item.pagado || "0") / parseFloat(item.aprobado || "0")) * 100)
              : 0,
            actualAmount: parseFloat(item.pagado || "0")
          },
          children: []
        };
        partidaGroup.children.push(partidaGroup.familias[familiaKey]);
      }

      const familiaGroup = partidaGroup.familias[familiaKey];
      familiaGroup.presupuesto += parseFloat(item.aprobado || "0");

      return acc;
    }, {});

    const result = Object.values(grouped).map((partidaGroup) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { familias, ...rest } = partidaGroup;
      return rest;
    });

    return result as ProgramaItem[];
  }, [allPartidas]);

  const [programaDataState, setProgramaDataState] = useState<ProgramaItem[]>([]);

  // Update state when data changes
  useEffect(() => {
    setProgramaDataState(programaData);
  }, [programaData]);

  // Get unique partidas and familias for filters
  const uniquePartidas = Array.from(new Set(allPartidas?.map(p => p.nombre) || []));
  const uniqueFamilias = Array.from(new Set(allPartidas?.map(p => p.familia) || []));

  // Function to toggle expanded state
  const toggleExpanded = (id: string) => {
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
    setProgramaDataState(updateExpanded(programaDataState));
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

  const flattenedData = flattenData(programaDataState);

  // Filter data based on selections
  const filteredData = flattenedData.filter(item => {
    if (selectedPartida && item.partida !== selectedPartida && item.level === 0) return false;
    if (selectedFamilia && item.partida !== selectedFamilia && item.level === 1) return false;
    if (searchTerm && !item.partida.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (!projects || !allPartidas) {
    return <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Cargando datos...</p>
    </div>;
  }

  // Get current selected project
  const currentProject = projects.find(p => p._id === selectedProjectId) || projects[0];

  return (
    <div className="bg-white px-12 py-6">
      {/* Header Section */}
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-col text-left">
              <p className="text-sm text-gray-500 mb-1">Programa de Obra</p>
              <h1 className="text-2xl text-gray-900">{currentProject?.nombre || 'Proyecto'}</h1>
            </div>
            <div className="flex flex-col space-y-1 text-left min-w-[250px]">
              <span className="text-xs text-gray-500">Proyecto</span>
              <Select
                value={selectedProjectId}
                onValueChange={(value) => setSelectedProjectId(value as Id<"desarrollos">)}
              >
                <SelectTrigger className="border border-gray-200 shadow-sm h-9 font-normal text-gray-900">
                  <SelectValue placeholder="Seleccionar proyecto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {uniquePartidas.map((partida) => (
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
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {uniqueFamilias.map((familia) => (
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
                  <SelectItem value="Semana">Semana</SelectItem>
                  <SelectItem value="Mes">Mes</SelectItem>
                  <SelectItem value="Trimestre">Trimestre</SelectItem>
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
              {filteredData.map((item) => (
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
              {filteredData.map((item) => (
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
