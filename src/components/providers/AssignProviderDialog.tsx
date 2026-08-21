import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Check, Loader2, Plus, Search, UserRoundX } from "lucide-react";
import { toast } from "sonner";
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
  const { isAuthenticated } = useConvexAuth();
  const providers = useQuery(
    api.proveedores.getAll,
    open && isAuthenticated ? {} : "skip"
  );
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
        <DialogContent data-square-modal="" className="min-w-0 w-[calc(100vw-2rem)] max-w-lg gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl">
          <DialogHeader className="min-w-0 border-b border-border px-6 py-5 pr-12">
            <DialogTitle className="text-lg font-medium">Asignar proveedor</DialogTitle>
            <DialogDescription>
              {effectiveTransactionIds.length > 1
                ? `${effectiveTransactionIds.length} transacciones seleccionadas`
                : "Selecciona un proveedor para esta transacción"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-4 px-6 py-5">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 min-w-0 border-border-strong bg-card pl-9 shadow-none"
                  placeholder="Buscar proveedor o RFC"
                />
              </div>
              <Button variant="outline" className="h-10 shrink-0 border-border-strong px-3 shadow-none" onClick={() => setCreateOpen(true)}>
                <Plus /> Nuevo
              </Button>
            </div>
            <ScrollArea className="h-[min(18rem,42vh)] min-w-0 border border-border">
              <button
                type="button"
                className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors ${selected === "" ? "bg-muted" : "hover:bg-muted/40"}`}
                onClick={() => setSelected("")}
                aria-pressed={selected === ""}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-card">
                  <UserRoundX className="h-4 w-4 text-subtle-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Sin proveedor</span>
                  <span className="block text-xs text-subtle-foreground">Desvincular la transacción</span>
                </span>
                {selected === "" && <Check className="h-4 w-4 shrink-0" />}
              </button>

              {providers === undefined ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-subtle-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-24 items-center justify-center px-4 text-center text-sm text-subtle-foreground">
                  No se encontraron proveedores
                </div>
              ) : filtered.map((provider) => {
                const isSelected = selected === provider._id;
                const providerStatus = provider.tipo === "generico"
                  ? "Genérico"
                  : provider.is_complete ? "Datos completos" : "Datos incompletos";

                return (
                  <button
                    type="button"
                    key={provider._id}
                    className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 ${isSelected ? "bg-muted" : "hover:bg-muted/40"}`}
                    onClick={() => setSelected(provider._id)}
                    aria-pressed={isSelected}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{provider.razon_social}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-subtle-foreground">
                        <span>{provider.rfc || "Sin RFC"}</span>
                        <span aria-hidden="true">·</span>
                        <span>{providerStatus}</span>
                      </span>
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </ScrollArea>
          </div>
          <DialogFooter className="min-w-0 border-t border-border bg-muted/40 px-6 py-4">
            <Button
              variant="ghost"
              className="h-9 px-3 shadow-none"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button className="h-9 min-w-0 px-4 shadow-none" onClick={handleSave} disabled={isSaving || effectiveTransactionIds.length === 0}>
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
