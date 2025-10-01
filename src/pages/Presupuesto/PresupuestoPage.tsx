import { useState, useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";

// Mock data for the presupuesto page
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

const formatNumber = (amount: number) => {
  return new Intl.NumberFormat('es-MX').format(amount);
};

export default function PresupuestoPage() {
  const [selectedPartida, setSelectedPartida] = useState<string | undefined>(undefined);
  const [selectedFamilia, setSelectedFamilia] = useState<string | undefined>(undefined);
  const [selectedFecha, setSelectedFecha] = useState("Semana");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch projects
  const projects = useQuery(api.desarrollos.getAll);
  
  // State for selected project (default to first project when available)
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

  // Calculate metrics from real data
  const metrics = {
    presupuestoOriginal: allPartidas?.reduce((sum, p) => sum + parseFloat(p.total || "0"), 0) || 0,
    presupuestoAprobado: allPartidas?.reduce((sum, p) => sum + parseFloat(p.aprobado || "0"), 0) || 0,
    gastoTotal: allPartidas?.reduce((sum, p) => sum + parseFloat(p.pagado || "0"), 0) || 0,
    porGastar: allPartidas?.reduce((sum, p) => sum + parseFloat(p.por_liquidar || "0"), 0) || 0,
  };

  // Get unique partidas and familias for filters
  const uniquePartidas = Array.from(new Set(allPartidas?.map(p => p.nombre) || []));
  const uniqueFamilias = Array.from(new Set(allPartidas?.map(p => p.familia) || []));

  // Filter data based on selections
  const filteredPartidas = allPartidas?.filter(p => {
    if (selectedPartida && p.nombre !== selectedPartida) return false;
    if (selectedFamilia && p.familia !== selectedFamilia) return false;
    if (searchTerm && !p.sub_partida.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  }) || [];

  // Calculate percentage differences
  const presupuestoReduction = metrics.presupuestoOriginal > 0 
    ? Math.round(((metrics.presupuestoAprobado - metrics.presupuestoOriginal) / metrics.presupuestoOriginal) * 100)
    : 0;
  const avancePercentage = metrics.presupuestoAprobado > 0
    ? Math.round((metrics.gastoTotal / metrics.presupuestoAprobado) * 100)
    : 0;
  const pendientePercentage = metrics.presupuestoAprobado > 0
    ? Math.round((metrics.porGastar / metrics.presupuestoAprobado) * 100)
    : 0;

  if (!projects || !allPartidas) {
    return <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Cargando datos...</p>
    </div>;
  }

  // Get current selected project
  const currentProject = projects.find(p => p._id === selectedProjectId) || projects[0];

  return (
    <div className="bg-white px-12 py-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-col text-left">
              <p className="text-sm text-gray-500 mb-1">Presupuesto</p>
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

        {/* Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {/* Presupuesto Original */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="pl-0 text-left">
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Presupuesto Original</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-normal text-gray-900">
                    ${formatNumber(Math.round(metrics.presupuestoOriginal))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Presupuesto Aprobado */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="pl-0 text-left">
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Presupuesto aprobado</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-normal text-gray-900">
                    ${formatNumber(Math.round(metrics.presupuestoAprobado))}
                  </p>
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
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="pl-0 text-left">
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Gasto total</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-normal text-gray-900">
                    ${formatNumber(Math.round(metrics.gastoTotal))}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  Avance {avancePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Por Gastar */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="pl-0 text-left">
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Por gastar</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-normal text-gray-900">
                    ${formatNumber(Math.round(metrics.porGastar))}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  Pendiente {pendientePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>
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

        {/* Budget Table Component */}
        <PresupuestoTable data={filteredPartidas} />
      </div>
    </div>
  );
}
