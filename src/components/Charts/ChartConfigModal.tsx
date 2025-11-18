import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X } from "lucide-react";
import { ChartConfig } from "@/hooks/useChartConfig";

interface ChartConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  proyectoId: Id<"desarrollos"> | Id<"sales_projects">;
  chartId: string;
  currentConfig: ChartConfig;
  onSave: (config: ChartConfig) => Promise<{ success: boolean }>;
  onReset?: () => Promise<{ success: boolean }>;
}

export default function ChartConfigModal({
  isOpen,
  onClose,
  proyectoId,
  chartId,
  currentConfig,
  onSave,
  onReset,
}: ChartConfigModalProps) {
  const [title, setTitle] = useState(currentConfig.title);
  const [color, setColor] = useState(currentConfig.color);
  const [height, setHeight] = useState(currentConfig.height?.toString() || "300");
  const [selectedPartidas, setSelectedPartidas] = useState<string[]>(
    currentConfig.partidas || []
  );
  const [selectedFamilias, setSelectedFamilias] = useState<string[]>(
    currentConfig.familias || []
  );
  const [selectedSubPartidas, setSelectedSubPartidas] = useState<string[]>(
    currentConfig.sub_partidas || []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  // Fetch all partidas for the project
  const allPartidas = useQuery(api.partida.getByProject, {
    projectId: proyectoId as Id<"desarrollos">,
  });

  // Extract unique names by nivel
  const availablePartidas = Array.from(
    new Set(
      allPartidas
        ?.filter((p) => p.nivel === 1)
        .map((p) => p.nombre) || []
    )
  ).sort();
  
  const availableFamilias = Array.from(
    new Set(
      allPartidas
        ?.filter((p) => p.nivel === 2)
        .map((p) => p.familia)
        .filter((f) => f && f !== "") || []
    )
  ).sort();
  
  const availableSubPartidas = Array.from(
    new Set(
      allPartidas
        ?.filter((p) => p.nivel === 3)
        .map((p) => p.sub_partida)
        .filter((sp) => sp && sp !== "") || []
    )
  ).sort();

  // Reset form when config changes
  useEffect(() => {
    setTitle(currentConfig.title);
    setColor(currentConfig.color);
    setHeight(currentConfig.height?.toString() || "300");
    setSelectedPartidas(currentConfig.partidas || []);
    setSelectedFamilias(currentConfig.familias || []);
    setSelectedSubPartidas(currentConfig.sub_partidas || []);
    setSaveMessage(null);
  }, [currentConfig, isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    const result = await onSave({
      title,
      color,
      height: parseInt(height) || 300,
      partidas: selectedPartidas.length > 0 ? selectedPartidas : undefined,
      familias: selectedFamilias.length > 0 ? selectedFamilias : undefined,
      sub_partidas: selectedSubPartidas.length > 0 ? selectedSubPartidas : undefined,
    });

    setIsSaving(false);

    if (result.success) {
      setSaveMessage({ type: "success", text: "Configuración guardada correctamente" });
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setSaveMessage({ type: "error", text: "Error al guardar la configuración" });
    }
  };

  const handleReset = async () => {
    if (!onReset) return;
    
    setIsSaving(true);
    setSaveMessage(null);

    const result = await onReset();

    setIsSaving(false);

    if (result.success) {
      setSaveMessage({
        type: "success",
        text: "Configuración restablecida a valores predeterminados",
      });
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setSaveMessage({ type: "error", text: "Error al restablecer la configuración" });
    }
  };

  const toggleSelection = (
    item: string,
    selectedItems: string[],
    setSelectedItems: (items: string[]) => void
  ) => {
    if (selectedItems.includes(item)) {
      setSelectedItems(selectedItems.filter((i) => i !== item));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Gráfica</DialogTitle>
          <DialogDescription>
            Personaliza el título, color y filtros de la gráfica. ID: {chartId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre de la gráfica"
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-20 h-10"
              />
              <Input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#3B82F6"
                className="flex-1"
              />
            </div>
          </div>

          {/* Height */}
          <div className="space-y-2">
            <Label htmlFor="height">Altura (px)</Label>
            <Input
              id="height"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="300"
              min="200"
              max="800"
            />
          </div>

          {/* Partidas Filter */}
          <div className="space-y-2">
            <Label>Filtrar por Partidas (Nivel 1)</Label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
              {availablePartidas.length === 0 ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : (
                <div className="space-y-1">
                  {availablePartidas.map((partida) => (
                    <button
                      key={partida}
                      type="button"
                      onClick={() =>
                        toggleSelection(partida, selectedPartidas, setSelectedPartidas)
                      }
                      className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                        selectedPartidas.includes(partida)
                          ? "bg-blue-100 text-blue-900"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{partida}</span>
                        {selectedPartidas.includes(partida) && (
                          <Check className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedPartidas.length > 0 && (
              <p className="text-xs text-gray-500">
                {selectedPartidas.length} partida(s) seleccionada(s)
              </p>
            )}
          </div>

          {/* Familias Filter */}
          <div className="space-y-2">
            <Label>Filtrar por Familias (Nivel 2)</Label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
              {availableFamilias.length === 0 ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : (
                <div className="space-y-1">
                  {availableFamilias.map((familia) => (
                    <button
                      key={familia}
                      type="button"
                      onClick={() =>
                        toggleSelection(familia, selectedFamilias, setSelectedFamilias)
                      }
                      className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                        selectedFamilias.includes(familia)
                          ? "bg-green-100 text-green-900"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{familia}</span>
                        {selectedFamilias.includes(familia) && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedFamilias.length > 0 && (
              <p className="text-xs text-gray-500">
                {selectedFamilias.length} familia(s) seleccionada(s)
              </p>
            )}
          </div>

          {/* Sub-Partidas Filter */}
          <div className="space-y-2">
            <Label>Filtrar por Sub-Partidas (Nivel 3)</Label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
              {availableSubPartidas.length === 0 ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : (
                <div className="space-y-1">
                  {availableSubPartidas.map((subPartida) => (
                    <button
                      key={subPartida}
                      type="button"
                      onClick={() =>
                        toggleSelection(subPartida, selectedSubPartidas, setSelectedSubPartidas)
                      }
                      className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                        selectedSubPartidas.includes(subPartida)
                          ? "bg-purple-100 text-purple-900"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{subPartida}</span>
                        {selectedSubPartidas.includes(subPartida) && (
                          <Check className="h-4 w-4 text-purple-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedSubPartidas.length > 0 && (
              <p className="text-xs text-gray-500">
                {selectedSubPartidas.length} sub-partida(s) seleccionada(s)
              </p>
            )}
          </div>

          {/* Save Message */}
          {saveMessage && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 ${
                saveMessage.type === "success"
                  ? "bg-green-50 text-green-900"
                  : "bg-red-50 text-red-900"
              }`}
            >
              {saveMessage.type === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              <span className="text-sm">{saveMessage.text}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            Restablecer
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
