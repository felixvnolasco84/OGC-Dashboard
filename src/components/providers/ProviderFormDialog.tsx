import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";

export type ProviderWithMeta = Doc<"proveedores"> & {
  tipo?: "regular" | "generico";
  is_complete?: boolean;
  is_archived?: boolean;
  creator_name?: string | null;
};

type ProviderForm = {
  razon_social: string;
  rfc: string;
  direccion: string;
  nombre_contacto: string;
  telefono_contacto: string;
  banco: string;
  cuenta: string;
  clabe: string;
};

const emptyForm: ProviderForm = {
  razon_social: "",
  rfc: "",
  direccion: "",
  nombre_contacto: "",
  telefono_contacto: "",
  banco: "",
  cuenta: "",
  clabe: "",
};

export default function ProviderFormDialog({
  open,
  onOpenChange,
  provider,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: ProviderWithMeta | null;
  onSaved?: (providerId: Doc<"proveedores">["_id"]) => void;
}) {
  const createProvider = useMutation(api.proveedores.create);
  const updateProvider = useMutation(api.proveedores.update);
  const [form, setForm] = useState<ProviderForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      provider
        ? {
            razon_social: provider.razon_social || "",
            rfc: provider.rfc || "",
            direccion: provider.direccion || "",
            nombre_contacto: provider.nombre_contacto || "",
            telefono_contacto: provider.telefono_contacto || "",
            banco: provider.banco || "",
            cuenta: provider.cuenta || "",
            clabe: provider.clabe || "",
          }
        : emptyForm
    );
  }, [open, provider]);

  const setField = (field: keyof ProviderForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.razon_social.trim()) {
      toast.error("La razón social es obligatoria");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        razon_social: form.razon_social,
        rfc: form.rfc,
        direccion: form.direccion,
        nombre_contacto: form.nombre_contacto,
        telefono_contacto: form.telefono_contacto,
        banco: form.banco,
        cuenta: form.cuenta,
        clabe: form.clabe,
        tipo: provider?.tipo || ("regular" as const),
      };
      let savedProviderId: Doc<"proveedores">["_id"];
      if (provider) {
        await updateProvider({ id: provider._id, ...payload });
        savedProviderId = provider._id;
        toast.success("Proveedor actualizado");
      } else {
        savedProviderId = await createProvider(payload);
        toast.success("Proveedor creado", {
          description: form.rfc.trim()
            ? undefined
            : "Quedó marcado como incompleto hasta capturar su RFC.",
        });
      }
      onOpenChange(false);
      onSaved?.(savedProviderId);
    } catch (error) {
      toast.error("No se pudo guardar el proveedor", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{provider ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          <DialogDescription>
            Solo la razón social es obligatoria. El proveedor se considera completo cuando también tiene RFC.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label>Razón social *</Label>
            <Input value={form.razon_social} onChange={(event) => setField("razon_social", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>RFC</Label>
            <Input value={form.rfc} onChange={(event) => setField("rfc", event.target.value.toUpperCase())} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Dirección</Label>
            <Input value={form.direccion} onChange={(event) => setField("direccion", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contacto</Label>
            <Input value={form.nombre_contacto} onChange={(event) => setField("nombre_contacto", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Teléfono</Label>
            <Input value={form.telefono_contacto} onChange={(event) => setField("telefono_contacto", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Banco</Label>
            <Input value={form.banco} onChange={(event) => setField("banco", event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cuenta</Label>
            <Input value={form.cuenta} onChange={(event) => setField("cuenta", event.target.value)} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>CLABE</Label>
            <Input
              inputMode="numeric"
              maxLength={18}
              value={form.clabe}
              onChange={(event) => setField("clabe", event.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !form.razon_social.trim()}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
