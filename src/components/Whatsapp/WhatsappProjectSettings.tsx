import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function WhatsappProjectSettings({ proyecto }: { proyecto: Id<"desarrollos"> }) {
  const settings = useQuery(api.whatsapp.projectSettings, { proyecto });
  const update = useMutation(api.whatsapp.setProjectEnabled);
  const [saving, setSaving] = useState(false);
  return <section className="space-y-2 border border-border p-3" aria-label="WhatsApp del proyecto">
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="project-whatsapp">WhatsApp automático</Label>
      <Checkbox role="switch" id="project-whatsapp" checked={settings?.enabled ?? false} disabled={!settings?.can_manage || saving} onCheckedChange={async value => {
        const enabled = value === true;
        setSaving(true);
        try { await update({ proyecto, enabled }); toast.success(enabled ? "WhatsApp activado para nuevos eventos" : "WhatsApp desactivado"); }
        catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo cambiar la configuración"); }
        finally { setSaving(false); }
      }} />
    </div>
    <p className="text-xs text-muted-foreground">Avisos de creación, revisión, pago y recepción para usuarios con teléfono y autorización registrados en Gestión de Usuarios. La app y el correo siguen activos.</p>
    <p className="text-xs text-muted-foreground">{!settings ? "Cargando configuración..." : settings.enabled ? "Activo para eventos nuevos. No se envía el historial anterior." : "Desactivado. Administración puede habilitarlo después de conectar Make."}</p>
  </section>;
}
