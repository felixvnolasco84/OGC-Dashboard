import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import ProviderFormDialog from "./ProviderFormDialog";

export default function AssignProviderDialog({
  open,
  onOpenChange,
  transactionId,
  transactionIds,
  currentProviderId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: Id<"transacciones"> | null;
  transactionIds?: Id<"transacciones">[];
  currentProviderId?: Id<"proveedores">;
}) {
  const providers = useQuery(api.proveedores.getAll);
  const updateTransaction = useMutation(api.transacciones.updateTransaction);
  const assignProviderBulk = useMutation(api.transacciones.assignProviderBulk);
  const [selected, setSelected] = useState<Id<"proveedores"> | "">("");
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const effectiveTransactionIds = transactionIds?.length
    ? transactionIds
    : transactionId ? [transactionId] : [];

  useEffect(() => {
    if (!open) return;
    setSelected(currentProviderId || "");
    setSearch("");
  }, [open, currentProviderId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return providers || [];
    return (providers || []).filter(
      (provider) =>
        provider.razon_social.toLowerCase().includes(term) ||
        provider.rfc?.toLowerCase().includes(term)
    );
  }, [providers, search]);

  const handleSave = async () => {
    if (effectiveTransactionIds.length === 0) return;
    setIsSaving(true);
    try {
      if (effectiveTransactionIds.length === 1) {
        await updateTransaction({
          id: effectiveTransactionIds[0],
          proveedor_id: selected || null,
        });
      } else {
        await assignProviderBulk({
          ids: effectiveTransactionIds,
          proveedor_id: selected || null,
        });
      }
      toast.success(selected ? "Proveedor asignado" : "Proveedor desvinculado", {
        description: `${effectiveTransactionIds.length} transacción${effectiveTransactionIds.length === 1 ? "" : "es"} actualizada${effectiveTransactionIds.length === 1 ? "" : "s"}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("No se pudo actualizar la transacción", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Asignar proveedor</DialogTitle>
            <DialogDescription>
              {effectiveTransactionIds.length > 1
                ? `Se actualizarán ${effectiveTransactionIds.length} transacciones. La relación es opcional.`
                : "La relación es opcional y puede modificarse después."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar proveedor o RFC" />
            </div>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo
            </Button>
          </div>
          <ScrollArea className="h-72 border">
            <button
              type="button"
              className={`w-full border-b px-4 py-3 text-left text-sm ${selected === "" ? "bg-gray-100" : "hover:bg-gray-50"}`}
              onClick={() => setSelected("")}
            >
              Sin proveedor
            </button>
            {filtered.map((provider) => (
              <button
                type="button"
                key={provider._id}
                className={`flex w-full items-center justify-between border-b px-4 py-3 text-left ${selected === provider._id ? "bg-gray-100" : "hover:bg-gray-50"}`}
                onClick={() => setSelected(provider._id)}
              >
                <span>
                  <span className="block text-sm font-medium">{provider.razon_social}</span>
                  <span className="block text-xs text-gray-500">{provider.rfc || "Sin RFC"}</span>
                </span>
                <Badge variant="outline">
                  {provider.tipo === "generico" ? "Genérico" : provider.is_complete ? "Completo" : "Incompleto"}
                </Badge>
              </button>
            ))}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving || effectiveTransactionIds.length === 0}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProviderFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
