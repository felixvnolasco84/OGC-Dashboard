import { useState, useEffect } from "react";
import { useFamiliaChartConfigModal, FamiliaChartConfig } from "@/hooks/familia-chart-config-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Check } from "lucide-react";

interface FamiliaChartConfigModalProps {
  onSave: (config: FamiliaChartConfig) => void;
}

export default function FamiliaChartConfigModal({ onSave }: FamiliaChartConfigModalProps) {
  const { isOpen, config, availablePartidas, availableFamilias, availableSubPartidas, close } = useFamiliaChartConfigModal();
  
  const [localConfig, setLocalConfig] = useState<FamiliaChartConfig | null>(null);

  // Sync local config with modal config when modal opens
  useEffect(() => {
    if (config) {
      setLocalConfig({ ...config });
    }
  }, [config]);

  const handleSave = () => {
    if (localConfig) {
      onSave(localConfig);
      close();
    }
  };

  const toggleSelection = (
    type: "partidas" | "familias" | "sub_partidas",
    value: string
  ) => {
    if (!localConfig) return;

    const currentArray = localConfig[type];
    const newArray = currentArray.includes(value)
      ? currentArray.filter((v) => v !== value)
      : [...currentArray, value];

    setLocalConfig({
      ...localConfig,
      [type]: newArray,
    });
  };

  const isSelected = (
    type: "partidas" | "familias" | "sub_partidas",
    value: string
  ) => {
    return localConfig?.[type].includes(value) || false;
  };

  if (!localConfig) return null;

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent data-square-modal="" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Gráfica</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Title Input */}
          <div className="space-y-2">
            <Label htmlFor="chart-title">Título de la Gráfica</Label>
            <Input
              id="chart-title"
              value={localConfig.title}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, title: e.target.value })
              }
              placeholder="Ej: Gasto en Materiales"
            />
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label htmlFor="chart-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="chart-color"
                type="color"
                value={localConfig.color}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, color: e.target.value })
                }
                className="h-10 w-20 rounded-none border border-border-strong cursor-pointer"
              />
              <span className="text-sm text-muted-foreground">{localConfig.color}</span>
            </div>
          </div>

          {/* Partidas Selection */}
          <div className="space-y-2">
            <Label>Partidas (Nivel 1)</Label>
            <div className="border border-border rounded-none p-4 max-h-48 overflow-y-auto bg-background">
              {availablePartidas.length === 0 ? (
                <p className="text-sm text-subtle-foreground">No hay partidas disponibles</p>
              ) : (
                <div className="space-y-2">
                  {availablePartidas.map((partida) => (
                    <label
                      key={partida}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded-none"
                    >
                      <div
                        className={`w-5 h-5 border-2 rounded-none flex items-center justify-center transition-colors ${
                          isSelected("partidas", partida)
                            ? "bg-blue-500 border-blue-500"
                            : "border-border-strong"
                        }`}
                        onClick={() => toggleSelection("partidas", partida)}
                      >
                        {isSelected("partidas", partida) && (
                          <Check className="w-3 h-3 text-on-color" />
                        )}
                      </div>
                      <span className="text-sm">{partida}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {localConfig.partidas.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {localConfig.partidas.map((partida) => (
                  <span
                    key={partida}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-none"
                  >
                    {partida}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-blue-900"
                      onClick={() => toggleSelection("partidas", partida)}
                    />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Familias Selection */}
          <div className="space-y-2">
            <Label>Familias (Nivel 2)</Label>
            <div className="border border-border rounded-none p-4 max-h-48 overflow-y-auto bg-background">
              {availableFamilias.length === 0 ? (
                <p className="text-sm text-subtle-foreground">No hay familias disponibles</p>
              ) : (
                <div className="space-y-2">
                  {availableFamilias.map((familia) => (
                    <label
                      key={familia}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded-none"
                    >
                      <div
                        className={`w-5 h-5 border-2 rounded-none flex items-center justify-center transition-colors ${
                          isSelected("familias", familia)
                            ? "bg-green-500 border-green-500"
                            : "border-border-strong"
                        }`}
                        onClick={() => toggleSelection("familias", familia)}
                      >
                        {isSelected("familias", familia) && (
                          <Check className="w-3 h-3 text-on-color" />
                        )}
                      </div>
                      <span className="text-sm">{familia}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {localConfig.familias.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {localConfig.familias.map((familia) => (
                  <span
                    key={familia}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-none"
                  >
                    {familia}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-green-900"
                      onClick={() => toggleSelection("familias", familia)}
                    />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sub-Partidas Selection */}
          <div className="space-y-2">
            <Label>Sub-Partidas (Nivel 3)</Label>
            <div className="border border-border rounded-none p-4 max-h-48 overflow-y-auto bg-background">
              {availableSubPartidas.length === 0 ? (
                <p className="text-sm text-subtle-foreground">No hay sub-partidas disponibles</p>
              ) : (
                <div className="space-y-2">
                  {availableSubPartidas.map((subPartida) => (
                    <label
                      key={subPartida}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded-none"
                    >
                      <div
                        className={`w-5 h-5 border-2 rounded-none flex items-center justify-center transition-colors ${
                          isSelected("sub_partidas", subPartida)
                            ? "bg-purple-500 border-purple-500"
                            : "border-border-strong"
                        }`}
                        onClick={() => toggleSelection("sub_partidas", subPartida)}
                      >
                        {isSelected("sub_partidas", subPartida) && (
                          <Check className="w-3 h-3 text-on-color" />
                        )}
                      </div>
                      <span className="text-sm">{subPartida}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {localConfig.sub_partidas.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {localConfig.sub_partidas.map((subPartida) => (
                  <span
                    key={subPartida}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-none"
                  >
                    {subPartida}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-purple-900"
                      onClick={() => toggleSelection("sub_partidas", subPartida)}
                    />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-none p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">
              Resumen de Filtros
            </p>
            <div className="text-xs text-blue-700 space-y-1">
              <p>• Partidas seleccionadas: {localConfig.partidas.length || "Todas"}</p>
              <p>• Familias seleccionadas: {localConfig.familias.length || "Todas"}</p>
              <p>• Sub-partidas seleccionadas: {localConfig.sub_partidas.length || "Todas"}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Guardar Configuración
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
