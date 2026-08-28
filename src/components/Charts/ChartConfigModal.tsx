import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

const CHART_COLORS = [
  "#256A34",
  "#50AC66",
  "#10B981",
  "#3B82F6",
  "#1D4ED8",
  "#C45C26",
  "#B45309",
  "#7C3AED",
] as const;

const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

type FilterTab = "partidas" | "familias" | "sub_partidas";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "partidas", label: "Partidas" },
  { id: "familias", label: "Familias" },
  { id: "sub_partidas", label: "Sub-partidas" },
];

function uniqueSorted(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value && value !== "")))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

function FilterList({
  items,
  selected,
  query,
  isLoading,
  onToggle,
}: {
  items: string[];
  selected: string[];
  query: string;
  isLoading: boolean;
  onToggle: (item: string) => void;
}) {
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    if (!normalized) return items;
    return items.filter((item) => item.toLocaleLowerCase("es").includes(normalized));
  }, [items, query]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-7 bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-subtle-foreground">
        No hay elementos en este nivel
      </p>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-subtle-foreground">
        Sin coincidencias
      </p>
    );
  }

  return (
    <div className="py-1">
      {filtered.map((item) => {
        const isSelected = selected.includes(item);

        return (
          <label
            key={item}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors",
              isSelected ? "bg-muted" : "hover:bg-muted/60"
            )}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggle(item)}
              className="rounded-none shadow-none"
            />
            <span className="min-w-0 flex-1 truncate text-sm">{item}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function ChartConfigModal({
  isOpen,
  onClose,
  proyectoId,
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
  const [activeTab, setActiveTab] = useState<FilterTab>("partidas");
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const allPartidas = useQuery(api.partida.getByProject, {
    projectId: proyectoId as Id<"desarrollos">,
  });
  const isLoadingFilters = allPartidas === undefined;

  const availablePartidas = useMemo(
    () => uniqueSorted(allPartidas?.filter((p) => p.nivel === 1).map((p) => p.nombre) || []),
    [allPartidas]
  );

  const availableFamilias = useMemo(
    () => uniqueSorted(allPartidas?.filter((p) => p.nivel === 2).map((p) => p.familia) || []),
    [allPartidas]
  );

  const availableSubPartidas = useMemo(
    () =>
      uniqueSorted(allPartidas?.filter((p) => p.nivel === 3).map((p) => p.sub_partida) || []),
    [allPartidas]
  );

  useEffect(() => {
    setTitle(currentConfig.title);
    setColor(currentConfig.color);
    setHeight(currentConfig.height?.toString() || "300");
    setSelectedPartidas(currentConfig.partidas || []);
    setSelectedFamilias(currentConfig.familias || []);
    setSelectedSubPartidas(currentConfig.sub_partidas || []);
    setActiveTab("partidas");
    setSearch("");
  }, [currentConfig, isOpen]);

  const selectedByTab: Record<FilterTab, string[]> = {
    partidas: selectedPartidas,
    familias: selectedFamilias,
    sub_partidas: selectedSubPartidas,
  };

  const itemsByTab: Record<FilterTab, string[]> = {
    partidas: availablePartidas,
    familias: availableFamilias,
    sub_partidas: availableSubPartidas,
  };

  const setSelectedByTab: Record<FilterTab, (items: string[]) => void> = {
    partidas: setSelectedPartidas,
    familias: setSelectedFamilias,
    sub_partidas: setSelectedSubPartidas,
  };

  const activeSelected = selectedByTab[activeTab];
  const totalSelected =
    selectedPartidas.length + selectedFamilias.length + selectedSubPartidas.length;

  const pickerColor = HEX_COLOR.test(color) ? color : "#256A34";
  const isPresetColor = CHART_COLORS.some(
    (swatch) => swatch.toUpperCase() === color.toUpperCase()
  );

  const toggleItem = (item: string) => {
    const current = selectedByTab[activeTab];
    setSelectedByTab[activeTab](
      current.includes(item) ? current.filter((value) => value !== item) : [...current, item]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);

    const parsedHeight = parseInt(height, 10);
    const result = await onSave({
      title: title.trim() || currentConfig.title,
      color: HEX_COLOR.test(color) ? color : currentConfig.color,
      height: Number.isFinite(parsedHeight) ? Math.min(800, Math.max(200, parsedHeight)) : 300,
      partidas: selectedPartidas.length > 0 ? selectedPartidas : undefined,
      familias: selectedFamilias.length > 0 ? selectedFamilias : undefined,
      sub_partidas: selectedSubPartidas.length > 0 ? selectedSubPartidas : undefined,
    });

    setIsSaving(false);

    if (result.success) {
      toast.success("Configuración guardada");
      onClose();
    } else {
      toast.error("No se pudo guardar la configuración");
    }
  };

  const handleReset = async () => {
    if (!onReset) return;

    setIsSaving(true);
    const result = await onReset();
    setIsSaving(false);

    if (result.success) {
      toast.success("Configuración restablecida");
      onClose();
    } else {
      toast.error("No se pudo restablecer la configuración");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        data-square-modal=""
        className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="space-y-1 border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>Configurar gráfica</DialogTitle>
          <DialogDescription>
            Título, color y filtros de datos.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="chart-title" className="text-xs text-muted-foreground">
              Título
            </Label>
            <Input
              id="chart-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre de la gráfica"
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {CHART_COLORS.map((swatch) => {
                  const isActive = color.toUpperCase() === swatch.toUpperCase();
                  return (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setColor(swatch)}
                      aria-label={`Usar color ${swatch}`}
                      aria-pressed={isActive}
                      className={cn(
                        "h-6 w-6 border transition-shadow",
                        isActive
                          ? "border-foreground ring-1 ring-foreground ring-offset-1 ring-offset-background"
                          : "border-border-strong hover:border-foreground"
                      )}
                      style={{ backgroundColor: swatch }}
                    />
                  );
                })}
                <label
                  className={cn(
                    "relative flex h-6 w-6 cursor-pointer items-center justify-center border",
                    isPresetColor
                      ? "border-dashed border-border-strong text-subtle-foreground hover:border-foreground hover:text-foreground"
                      : "border-foreground ring-1 ring-foreground ring-offset-1 ring-offset-background"
                  )}
                  style={isPresetColor ? undefined : { backgroundColor: pickerColor }}
                  title="Color personalizado"
                >
                  <span className="sr-only">Elegir color personalizado</span>
                  {isPresetColor && (
                    <span className="text-xs leading-none" aria-hidden>
                      +
                    </span>
                  )}
                  <input
                    type="color"
                    value={pickerColor}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>

            <div className="w-[88px] space-y-1.5">
              <Label htmlFor="chart-height" className="text-xs text-muted-foreground">
                Altura
              </Label>
              <div className="relative">
                <Input
                  id="chart-height"
                  type="number"
                  min={200}
                  max={800}
                  step={10}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="pr-8"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-subtle-foreground">
                  px
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label className="text-xs text-muted-foreground">Filtros</Label>
              <p className="text-[11px] text-subtle-foreground">
                {totalSelected === 0
                  ? "Sin filtro se incluyen todas"
                  : `${totalSelected} seleccionada${totalSelected === 1 ? "" : "s"}`}
              </p>
            </div>

            <div className="grid grid-cols-3 border border-border">
              {FILTER_TABS.map((tab) => {
                const count = selectedByTab[tab.id].length;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSearch("");
                    }}
                    className={cn(
                      "flex h-9 items-center justify-center gap-1.5 border-r border-border text-xs last:border-r-0",
                      isActive
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span>{tab.label}</span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "min-w-4 px-1 text-[10px] tabular-nums",
                          isActive ? "text-background/80" : "text-subtle-foreground"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border border-border">
              <div className="flex items-center gap-2 border-b px-2.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder="Buscar"
                  autoComplete="off"
                  className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
                />
                {activeSelected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedByTab[activeTab]([])}
                    className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              <div className="max-h-52 overflow-y-auto">
                <FilterList
                  items={itemsByTab[activeTab]}
                  selected={activeSelected}
                  query={search}
                  isLoading={isLoadingFilters}
                  onToggle={toggleItem}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
          {onReset ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
              className="text-muted-foreground"
            >
              Restablecer
            </Button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </div>
        </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
