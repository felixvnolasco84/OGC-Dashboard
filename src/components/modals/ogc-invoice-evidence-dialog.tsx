import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OGC_INVOICE_FILE_ACCEPT, uploadOgcInvoiceProof, validateOgcInvoiceFile } from "@/lib/ogcInvoiceEvidence";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

type InvoiceMovement = Pick<Doc<"ogc_movimientos">, "_id" | "tipo" | "status" | "factura_referencia" | "factura_comprobante">;

export function OgcInvoiceEvidenceDialog({ movement, compact = false }: { movement: InvoiceMovement; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeProof, setRemoveProof] = useState(false);
  const [saving, setSaving] = useState(false);
  const generateUploadUrl = useMutation(api.ogc_movimientos.generateUploadUrl);
  const setInvoiceEvidence = useMutation(api.ogc_movimientos.setInvoiceEvidence);
  const proofUrl = useQuery(api.ogc_movimientos.getInvoiceProofUrl, open && movement.factura_comprobante
    ? { movimiento_id: movement._id }
    : "skip");
  const active = !movement.status || movement.status === "activo";

  const changeOpen = (next: boolean) => {
    if (saving) return;
    if (next && !open) {
      setReference(movement.factura_referencia || "");
      setFile(null);
      setRemoveProof(false);
    }
    setOpen(next);
  };

  const save = async () => {
    const trimmed = reference.trim();
    if ((file || (movement.factura_comprobante && !removeProof)) && !trimmed) {
      toast.error("El comprobante requiere folio o referencia.");
      return;
    }
    if (file) {
      const error = validateOgcInvoiceFile(file);
      if (error) { toast.error(error); return; }
    }
    setSaving(true);
    try {
      const comprobante = file ? await uploadOgcInvoiceProof(file, generateUploadUrl) : undefined;
      await setInvoiceEvidence({
        id: movement._id,
        referencia: trimmed,
        comprobante,
        remove_comprobante: removeProof || undefined,
      });
      toast.success("Factura del ingreso actualizada");
      setOpen(false);
    } catch (error) {
      toast.error("No se pudo actualizar la factura", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (movement.tipo !== "ingreso") return null;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={compact ? "h-7 max-w-[180px] text-xs" : "max-w-full"} title={movement.factura_referencia || "Agregar factura"}>
          <FileText className="h-3.5 w-3.5" />
          <span className="truncate">{movement.factura_referencia || "Agregar factura"}</span>
          {movement.factura_comprobante && <span aria-label="Con comprobante">•</span>}
        </Button>
      </DialogTrigger>
      <DialogContent data-square-modal="" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Factura del ingreso OGC</DialogTitle>
          <DialogDescription>El folio y el comprobante quedan vinculados a este movimiento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`ogc-invoice-reference-${movement._id}`}>Folio o referencia</Label>
            <Input id={`ogc-invoice-reference-${movement._id}`} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} disabled={!active || saving} />
          </div>
          {movement.factura_comprobante && !removeProof && (
            <div className="flex flex-wrap items-center gap-2 border border-border p-3 text-sm">
              <span className="min-w-0 flex-1 truncate" title={movement.factura_comprobante.nombre}>{movement.factura_comprobante.nombre}</span>
              {proofUrl && <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink className="h-4 w-4" /> Abrir</a>}
              {active && <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => { setRemoveProof(true); setFile(null); }}>Quitar</Button>}
            </div>
          )}
          {removeProof && <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setRemoveProof(false)}>Conservar archivo actual</Button>}
          {active && (
            <div className="space-y-1.5">
              <Label htmlFor={`ogc-invoice-file-${movement._id}`}>{movement.factura_comprobante ? "Reemplazar comprobante" : "Adjuntar comprobante (opcional)"}</Label>
              <Input
                id={`ogc-invoice-file-${movement._id}`}
                type="file"
                accept={OGC_INVOICE_FILE_ACCEPT}
                disabled={saving}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  event.target.value = "";
                  if (!selected) return;
                  const error = validateOgcInvoiceFile(selected);
                  if (error) toast.error(error);
                  else { setFile(selected); setRemoveProof(false); }
                }}
              />
              {file && <p className="text-xs text-muted-foreground">Archivo seleccionado: {file.name}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cerrar</Button>
            {active && <Button type="button" onClick={save} disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : "Guardar factura"}</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
