import { useState, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { useQuery, usePaginatedQuery } from "convex/react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, ChevronDown } from "lucide-react";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";
import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { useDesarrolloStore } from "@/hooks/use-desarrollo-store";

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



  const [selectedPartidas, setSelectedPartidas] = useState<string[]>([]);
  const [selectedFamilias, setSelectedFamilias] = useState<string[]>([]);
  const [selectedFecha, setSelectedFecha] = useState("Semana");
  const [partidaSearchTerm, setPartidaSearchTerm] = useState("");
  const [familiaSearchTerm, setFamiliaSearchTerm] = useState("");
  const [isPartidaOpen, setIsPartidaOpen] = useState(false);
  const [isFamiliaOpen, setIsFamiliaOpen] = useState(false);

  // Add partida modal
  const addPartidaModal = useAddPartidaModal();

  // Fetch projects
  const projects = useQuery(api.desarrollos.getAll);

  // State for selected project (default to first project when available)
  const { selectedDesarrollo } = useDesarrolloStore();
  // const [selectedProjectId, setSelectedProjectId] = useState<Id<"desarrollos"> | undefined>(undefined);


  // Fetch all partidas for selected project with pagination
  const { results: allPartidas, status: partidasStatus, loadMore } = usePaginatedQuery(
    api.partida.getByProjectPaginated,
    selectedDesarrollo ? { projectId: selectedDesarrollo._id } : "skip",
    { initialNumItems: 1000 }
  );

  // Calculate metrics from real data - only sum partida-level rows (level 0)
  const metrics = useMemo(() => {
    if (!allPartidas) return {
      presupuestoOriginal: 0,
      presupuestoAprobado: 0,
      gastoTotal: 0,
      porGastar: 0,
    };
    
    // Filter to only include partida-level rows (where familia and sub_partida are empty)
    const partidaLevelRows = allPartidas.filter(p => 
      (!p.familia || p.familia.trim() === '') && 
      (!p.sub_partida || p.sub_partida.trim() === '')
    );
    
    return {
      presupuestoOriginal: partidaLevelRows.reduce((sum, p) => sum + (p.total || 0), 0),
      presupuestoAprobado: partidaLevelRows.reduce((sum, p) => sum + (p.aprobado || 0), 0),
      gastoTotal: partidaLevelRows.reduce((sum, p) => sum + (p.pagado || 0), 0),
      porGastar: partidaLevelRows.reduce((sum, p) => sum + (p.por_liquidar || 0), 0),
    };
  }, [allPartidas]);

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
    
    return allPartidas.filter(p => {
      if (selectedPartidas.length > 0 && !selectedPartidas.includes(p.nombre)) return false;
      if (selectedFamilias.length > 0 && !selectedFamilias.includes(p.familia)) return false;
      return true;
    });
  }, [allPartidas, selectedPartidas, selectedFamilias]);

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

  // Loading state
  if (!projects || partidasStatus === "LoadingFirstPage") {
    return <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-500">Cargando datos...</p>
      </div>
    </div>;
  }

  




  return (
    <div className="bg-white px-12 py-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-col text-left">
              <p className="text-sm text-gray-500 mb-1">Presupuesto</p>
              {/* <h1 className="text-2xl text-gray-900">{currentProject?.nombre || 'Proyecto'}</h1> */}
            </div>
            <div className="flex items-end gap-3">
              <Button
                onClick={() => selectedDesarrollo && addPartidaModal.onOpen({
                  proyecto: selectedDesarrollo._id,
                  projectName: selectedDesarrollo.nombre
                })}
                variant={"outline"}
                disabled={!selectedDesarrollo}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar Partida
              </Button>
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
          <div className="grid grid-cols-3 items-center gap-6">
            {/* Partida Filter - Multi-select */}
            <div className="flex flex-col space-y-1 text-left">
              <span className="text-xs text-gray-500">Partida</span>
              <Popover open={isPartidaOpen} onOpenChange={setIsPartidaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="border-none shadow-none p-0 h-auto font-normal text-gray-900 hover:bg-transparent justify-start"
                  >
                    <span className="flex items-center gap-2">
                      {selectedPartidas.length === 0 ? (
                        "Todas"
                      ) : selectedPartidas.length === 1 ? (
                        selectedPartidas[0]
                      ) : (
                        `${selectedPartidas.length} seleccionadas`
                      )}
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b">
                    <Input
                      placeholder="Buscar partidas..."
                      value={partidaSearchTerm}
                      onChange={(e) => setPartidaSearchTerm(e.target.value)}
                      className="h-8 rounded-none focus-visible:border-gray-300 focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                    {filteredPartidasForSelect.length > 0 ? (
                      filteredPartidasForSelect.map((partida) => (
                        <div key={partida} className="flex items-center space-x-2">
                          <Checkbox
                            id={`partida-${partida}`}
                            checked={selectedPartidas.includes(partida)}
                            className="border-gray-300"
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
                            className="text-sm cursor-pointer flex-1"
                          >
                            {partida}
                          </label>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-2">
                        No se encontraron partidas
                      </p>
                    )}
                  </div>
                  {selectedPartidas.length > 0 && (
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        {selectedPartidas.length} seleccionada(s)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPartidas([])}
                        className="h-7 text-xs"
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
                      className="text-xs py-0.5 px-2 gap-1"
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
            <div className="flex flex-col space-y-1 text-left">
              <span className="text-xs text-gray-500">Familia</span>
              <Popover open={isFamiliaOpen} onOpenChange={setIsFamiliaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="border-none shadow-none p-0 h-auto font-normal text-gray-900 hover:bg-transparent justify-start"
                  >
                    <span className="flex items-center gap-2">
                      {selectedFamilias.length === 0 ? (
                        "Todas"
                      ) : selectedFamilias.length === 1 ? (
                        selectedFamilias[0]
                      ) : (
                        `${selectedFamilias.length} seleccionadas`
                      )}
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b">
                    <Input
                      placeholder="Buscar familias..."
                      value={familiaSearchTerm}
                      onChange={(e) => setFamiliaSearchTerm(e.target.value)}
                      className="h-8 rounded-none focus-visible:border-gray-300 focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                    {filteredFamiliasForSelect.length > 0 ? (
                      filteredFamiliasForSelect.map((familia) => (
                        <div key={familia} className="flex items-center space-x-2">
                          <Checkbox
                            id={`familia-${familia}`}
                            checked={selectedFamilias.includes(familia)}
                            className="border-gray-300"
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
                            className="text-sm cursor-pointer flex-1"
                          >
                            {familia}
                          </label>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-2">
                        No se encontraron familias
                      </p>
                    )}
                  </div>
                  {selectedFamilias.length > 0 && (
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        {selectedFamilias.length} seleccionada(s)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFamilias([])}
                        className="h-7 text-xs"
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
                      className="text-xs py-0.5 px-2 gap-1"
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
        <PresupuestoTable 
          data={filteredPartidas} 
          status={partidasStatus}
          loadMore={loadMore}
        />
      </div>
    </div>
  );
}
