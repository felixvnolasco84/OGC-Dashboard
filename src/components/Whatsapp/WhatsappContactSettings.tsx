import { useId, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { normalizeWhatsappPhone } from "../../../convex/whatsappRules";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function WhatsappContactSettings({ user }: { user: Doc<"users"> }) {
  const id = useId();
  const save = useMutation(api.whatsapp.saveContact);
  const [phone, setPhone] = useState(user.whatsapp_phone || "");
  const [enabled, setEnabled] = useState(user.whatsapp_enabled ?? false);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  let canonicalPhone = phone.trim();
  try { canonicalPhone = normalizeWhatsappPhone(phone); } catch { /* Validation is shown when saving. */ }
  const changedPhone = canonicalPhone !== (user.whatsapp_phone || "");
  const authorized = !changedPhone && Boolean(user.whatsapp_consent_at && user.whatsapp_consent_by && (user.whatsapp_opted_out_at ?? 0) < user.whatsapp_consent_at);
  return <section className="space-y-3 border-t border-border pt-5" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="text-sm font-medium">Notificaciones por WhatsApp</h3>
    <div className="space-y-2">
      <Label htmlFor={`${id}-phone`}>Teléfono internacional</Label>
      <Input id={`${id}-phone`} type="tel" autoComplete="tel" value={phone} placeholder="+525512345678" onChange={e => { setPhone(e.target.value); setConsent(false); }} />
      <p className="text-xs text-muted-foreground">Incluye + y el código de país. Para México: +52 y los 10 dígitos del teléfono.</p>
    </div>
    <div className="flex items-start gap-2">
      <Checkbox id={`${id}-enabled`} checked={enabled} onCheckedChange={value => setEnabled(value === true)} />
      <Label htmlFor={`${id}-enabled`} className="font-normal leading-5">Recibir notificaciones de requisiciones por WhatsApp</Label>
    </div>
    {authorized && <p className="text-xs text-muted-foreground">Autorización registrada el {new Date(user.whatsapp_consent_at!).toLocaleDateString("es-MX")}.</p>}
    {Boolean(user.whatsapp_opted_out_at) && !authorized && <p className="text-xs text-muted-foreground">El usuario solicitó la baja. Necesitas una nueva autorización para reactivarlo.</p>}
    <div className="flex items-start gap-2">
      <Checkbox id={`${id}-consent`} checked={consent} onCheckedChange={value => setConsent(value === true)} />
      <Label htmlFor={`${id}-consent`} className="font-normal leading-5">Confirmo que el usuario autorizó recibir avisos de OGC en este número.</Label>
    </div>
    {changedPhone && <p className="text-xs text-muted-foreground">Al cambiar el número es necesario registrar nuevamente la autorización.</p>}
    <Button type="button" variant="outline" disabled={saving || (enabled && (!phone.trim() || (!authorized && !consent)))} onClick={async () => {
      setSaving(true);
      try {
        await save({ user_id: user._id, phone, enabled, confirm_consent: consent });
        setPhone(canonicalPhone);
        setConsent(false);
        toast.success("Configuración de WhatsApp guardada");
      } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar WhatsApp"); }
      finally { setSaving(false); }
    }}>{saving ? "Guardando..." : "Guardar WhatsApp"}</Button>
  </section>;
}
