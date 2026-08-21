import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, MessageSquare, Pencil } from "lucide-react";
import { type ProgramaItem } from "./programa-obra-types";

type Props = {
  item: ProgramaItem;
  proyectoId: Id<"desarrollos">;
  onClose: () => void;
};

/** Convert DD/MM/YYYY to YYYY-MM-DD for HTML date inputs */
function toInputDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  if (dateStr.includes("-")) return dateStr;
  const [d, m, y] = dateStr.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Convert YYYY-MM-DD to DD/MM/YYYY for storage */
function toStorageDate(dateStr: string): string {
  if (!dateStr) return "";
  if (dateStr.includes("/")) return dateStr;
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

/** Format DD/MM/YYYY for display */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  if (dateStr.includes("-")) {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

export default function ProgramaObraComentarios({ item, proyectoId, onClose }: Props) {
  const parentType = item.level === 0 ? "partida" : "familia";
  const parentId = item.level === 0
    ? item.schedule?._id ?? ""
    : item.detalleSchedule?._id ?? "";

  const comentarios = useQuery(
    api.programa_obra.getComentariosByProyecto,
    { proyecto_id: proyectoId }
  );

  const addComentario = useMutation(api.programa_obra.addComentario);
  const updateComentario = useMutation(api.programa_obra.updateComentario);
  const deleteComentario = useMutation(api.programa_obra.deleteComentario);

  const [showForm, setShowForm] = useState(false);
  const [comentario, setComentario] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<Id<"programa_obra_comentarios"> | null>(null);
  const [editComentario, setEditComentario] = useState("");
  const [editFechaInicio, setEditFechaInicio] = useState("");
  const [editFechaFin, setEditFechaFin] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter comentarios for this item
  const itemComentarios = (comentarios ?? []).filter(
    (c) => c.parent_type === parentType && c.parent_id === parentId
  );

  const handleAdd = async () => {
    if (!comentario.trim() || !fechaInicio || !fechaFin || !parentId) return;
    setIsSaving(true);
    try {
      await addComentario({
        proyecto: proyectoId,
        parent_type: parentType,
        parent_id: parentId,
        comentario: comentario.trim(),
        fecha_inicio: toStorageDate(fechaInicio),
        fecha_fin: toStorageDate(fechaFin),
      });
      setComentario("");
      setFechaInicio("");
      setFechaFin("");
      setShowForm(false);
    } catch (error) {
      console.error("Error adding comentario:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: Id<"programa_obra_comentarios">) => {
    try {
      await deleteComentario({ comentario_id: id });
    } catch (error) {
      console.error("Error deleting comentario:", error);
    }
  };

  const startEdit = (c: { _id: Id<"programa_obra_comentarios">; comentario: string; fecha_inicio: string; fecha_fin: string }) => {
    setEditingId(c._id);
    setEditComentario(c.comentario);
    setEditFechaInicio(toInputDate(c.fecha_inicio));
    setEditFechaFin(toInputDate(c.fecha_fin));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditComentario("");
    setEditFechaInicio("");
    setEditFechaFin("");
  };

  const handleUpdate = async () => {
    if (!editingId || !editComentario.trim() || !editFechaInicio || !editFechaFin) return;
    setIsUpdating(true);
    try {
      await updateComentario({
        comentario_id: editingId,
        comentario: editComentario.trim(),
        fecha_inicio: toStorageDate(editFechaInicio),
        fecha_fin: toStorageDate(editFechaFin),
      });
      cancelEdit();
    } catch (error) {
      console.error("Error updating comentario:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comentarios
          </SheetTitle>
          <SheetDescription className="text-left">
            {item.partida} — {parentType === "partida" ? "Partida" : "Familia"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Existing comentarios */}
          {itemComentarios.length === 0 && !showForm && (
            <p className="text-sm text-disabled-foreground text-center py-6">
              No hay comentarios para este elemento
            </p>
          )}

          {itemComentarios
            .sort((a, b) => b.created_at - a.created_at)
            .map((c) =>
              editingId === c._id ? (
                // Inline edit form
                <div key={c._id} className="border border-blue-300 bg-blue-50/30 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-subtle-foreground">Comentario</Label>
                    <Textarea
                      value={editComentario}
                      onChange={(e) => setEditComentario(e.target.value)}
                      className="min-h-[60px] text-sm rounded-none resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-subtle-foreground">Fecha inicio</Label>
                      <Input
                        type="date"
                        value={editFechaInicio}
                        onChange={(e) => setEditFechaInicio(e.target.value)}
                        className="h-9 rounded-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-subtle-foreground">Fecha fin</Label>
                      <Input
                        type="date"
                        value={editFechaFin}
                        onChange={(e) => setEditFechaFin(e.target.value)}
                        className="h-9 rounded-none text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEdit} className="rounded-none text-xs">
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleUpdate}
                      disabled={isUpdating || !editComentario.trim() || !editFechaInicio || !editFechaFin}
                      className="rounded-none text-xs"
                    >
                      {isUpdating ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              ) : (
                // Display mode
                <div
                  key={c._id}
                  className="border border-border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground flex-1">{c.comentario}</p>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => startEdit(c)}
                        className="p-1 hover:bg-blue-50 rounded text-disabled-foreground hover:text-blue-500"
                        title="Editar comentario"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c._id)}
                        className="p-1 hover:bg-red-50 rounded text-disabled-foreground hover:text-red-500"
                        title="Eliminar comentario"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-subtle-foreground">
                    <span>
                      {formatDisplayDate(c.fecha_inicio)} → {formatDisplayDate(c.fecha_fin)}
                    </span>
                    {c.created_by_name && (
                      <>
                        <span>·</span>
                        <span>{c.created_by_name}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            )}

          <Separator />

          {/* Add comentario form */}
          {showForm ? (
            <div className="space-y-3 border border-dashed border-border-strong p-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-subtle-foreground">Comentario</Label>
                <Textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Escribe un comentario..."
                  className="min-h-[80px] text-sm rounded-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-subtle-foreground">Fecha inicio</Label>
                  <Input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="h-9 rounded-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-subtle-foreground">Fecha fin</Label>
                  <Input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="h-9 rounded-none text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setComentario("");
                    setFechaInicio("");
                    setFechaFin("");
                  }}
                  className="rounded-none text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={isSaving || !comentario.trim() || !fechaInicio || !fechaFin}
                  className="rounded-none text-xs"
                >
                  {isSaving ? "Guardando..." : "Agregar"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              className="rounded-none w-full gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar Comentario
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
