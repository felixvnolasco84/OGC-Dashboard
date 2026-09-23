import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Globe2, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProjectLocationsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ProjectLocationsModal({
  open,
  onOpenChange,
}: ProjectLocationsModalProps) {
  const locations = useQuery(api.project_locations.list);
  const createLocation = useMutation(api.project_locations.create);
  const renameLocation = useMutation(api.project_locations.rename);
  const [newName, setNewName] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNewName("");
      setEditingKey(null);
      setEditingName("");
      setSavingKey(null);
    }
  }, [open]);

  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "No se pudo guardar la ubicación";

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;

    setSavingKey("__create__");
    try {
      await createLocation({ name: newName });
      setNewName("");
      toast.success("Ubicación creada");
    } catch (error) {
      toast.error("No se pudo crear la ubicación", {
        description: errorMessage(error),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const startEditing = (key: string, name: string) => {
    setEditingKey(key);
    setEditingName(name);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditingName("");
  };

  const handleRename = async (key: string) => {
    if (!editingName.trim()) return;

    setSavingKey(key);
    try {
      await renameLocation({ key, name: editingName });
      cancelEditing();
      toast.success("Ubicación actualizada");
    } catch (error) {
      toast.error("No se pudo renombrar la ubicación", {
        description: errorMessage(error),
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-square-modal=""
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl flex-col overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
          <DialogTitle className="text-xl font-normal">Configurar ubicaciones</DialogTitle>
          <DialogDescription>
            Este catálogo es global. Los cambios se reflejan en todos los proyectos y organizaciones.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <form onSubmit={handleCreate} className="space-y-2">
            <Label htmlFor="new-project-location">Nueva ubicación</Label>
            <div className="flex gap-2">
              <Input
                id="new-project-location"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Ej. Guadalajara"
                maxLength={80}
                disabled={savingKey !== null}
                className="rounded-none"
              />
              <Button
                type="submit"
                disabled={!newName.trim() || savingKey !== null}
                className="shrink-0 rounded-none"
              >
                {savingKey === "__create__" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Crear
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe2 className="h-4 w-4 text-subtle-foreground" />
              Ubicaciones disponibles
            </div>

            <div className="divide-y border">
              {locations === undefined ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-subtle-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando ubicaciones...
                </div>
              ) : (
                locations.map((location) => {
                  const isEditing = editingKey === location.key;
                  const isSaving = savingKey === location.key;

                  return (
                    <div key={location.key} className="flex min-h-12 items-center gap-2 px-3 py-2">
                      {isEditing ? (
                        <Input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleRename(location.key);
                            }
                            if (event.key === "Escape") cancelEditing();
                          }}
                          maxLength={80}
                          autoFocus
                          disabled={isSaving}
                          aria-label={`Nuevo nombre para ${location.name}`}
                          className="h-9 flex-1 rounded-none"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm">{location.name}</span>
                      )}

                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleRename(location.key)}
                            disabled={!editingName.trim() || isSaving}
                            aria-label={`Guardar nombre de ${location.name}`}
                            className="h-8 w-8 p-0"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditing}
                            disabled={isSaving}
                            aria-label="Cancelar edición"
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(location.key, location.name)}
                          disabled={savingKey !== null}
                          aria-label={`Renombrar ${location.name}`}
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
