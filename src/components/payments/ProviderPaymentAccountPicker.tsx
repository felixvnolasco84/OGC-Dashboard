import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isValidAccount, isValidClabe } from "../../../convex/paymentAccountRules";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  projectId: Id<"desarrollos">;
  providerId: Id<"proveedores"> | "";
  method: string;
  selectedId: Id<"payment_accounts"> | "";
  banco: string;
  numeroCuenta: string;
  clabe: string;
  onSelect: (id: Id<"payment_accounts"> | "") => void;
};

const accountStatusLabel = {
  active: "Activa", pending_review: "En revisión", archived: "Archivada",
};

const candidateReasonLabel: Record<string, string> = {
  sin_proveedor: "Sin proveedor",
  proveedor_no_disponible: "Proveedor archivado",
  datos_incompletos: "Datos incompletos",
  datos_contradictorios: "Datos contradictorios",
  cuenta_archivada: "Cuenta archivada",
  proveedor_fusionado: "Proveedor fusionado",
  proveedor_fusionado_pendiente: "Fusión con datos pendientes",
};

export default function ProviderPaymentAccountPicker({
  projectId, providerId, method, selectedId, banco, numeroCuenta, clabe, onSelect,
}: Props) {
  const enabled = Boolean(providerId && ["transferencia", "cheque"].includes(method.toLowerCase()));
  const accounts = useQuery(api.paymentAccounts.listForProvider,
    enabled ? { projectId, providerId: providerId as Id<"proveedores"> } : "skip");
  const rights = useQuery(api.paymentAccounts.permissions, enabled ? { projectId } : "skip");
  const createAccount = useMutation(api.paymentAccounts.create);
  const updateAccount = useMutation(api.paymentAccounts.update);
  const archiveAccount = useMutation(api.paymentAccounts.archive);
  const resolveCandidate = useMutation(api.paymentAccounts.resolveCandidate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<Id<"payment_accounts"> | null>(null);
  const [candidateId, setCandidateId] = useState<Id<"payment_account_candidates"> | null>(null);
  const [reviewProviderId, setReviewProviderId] = useState<Id<"proveedores"> | "">("");
  const [editAlias, setEditAlias] = useState("");
  const [editBank, setEditBank] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editClabe, setEditClabe] = useState("");
  const management = useQuery(api.paymentAccounts.listManagement,
    manageOpen && rights?.canReview ? { projectId, providerId: providerId || undefined } : "skip");
  const providers = useQuery(api.proveedores.getAll, manageOpen && rights?.canReview ? {} : "skip");

  if (!enabled) return null;

  const selected = accounts?.find(account => account._id === selectedId);
  const canSaveManual = Boolean(rights?.canWrite && !selectedId && banco.trim() &&
    (numeroCuenta.trim() || clabe.trim()) &&
    (!numeroCuenta.trim() || isValidAccount(numeroCuenta)) &&
    (!clabe.trim() || isValidClabe(clabe)));

  const saveManual = async () => {
    if (!providerId || !canSaveManual || busy) return;
    setBusy(true);
    try {
      const id = await createAccount({ projectId, providerId, banco,
        numeroCuenta: numeroCuenta || undefined, clabe: clabe || undefined });
      onSelect(id);
      toast.success("Cuenta guardada en la biblioteca");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la cuenta");
    } finally { setBusy(false); }
  };

  const beginEdit = (account: NonNullable<typeof management>["accounts"][number]) => {
    setEditingId(account._id);
    setCandidateId(null);
    setEditAlias(account.alias);
    setEditBank(account.banco);
    setEditNumber(account.numero_cuenta || "");
    setEditClabe(account.clabe || "");
  };

  const beginReview = (candidate: NonNullable<typeof management>["candidates"][number]) => {
    setEditingId(null);
    setCandidateId(candidate._id);
    setReviewProviderId(candidate.provider_id || "");
    setEditBank(candidate.banco || "");
    setEditNumber(candidate.numero_cuenta || "");
    setEditClabe(candidate.clabe || "");
  };

  const saveEdit = async () => {
    if (!providerId || !editingId || busy) return;
    setBusy(true);
    try {
      await updateAccount({ id: editingId, projectId, providerId, banco: editBank,
        numeroCuenta: editNumber || undefined, clabe: editClabe || undefined,
        alias: editAlias || undefined });
      toast.success("Cuenta actualizada");
      setEditingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la cuenta");
    } finally { setBusy(false); }
  };

  const decideCandidate = async (decision: "approve" | "reject") => {
    if (!candidateId || busy) return;
    setBusy(true);
    try {
      await resolveCandidate({ projectId, id: candidateId, decision,
        providerId: reviewProviderId || undefined, banco: editBank || undefined,
        numeroCuenta: editNumber || undefined, clabe: editClabe || undefined });
      toast.success(decision === "approve" ? "Cuenta aprobada" : "Registro descartado");
      setCandidateId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo revisar el registro");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <span className="block text-xs text-muted-foreground">Cuenta guardada del proveedor</span>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="combobox" role="combobox" aria-expanded={pickerOpen}>
            <span className="truncate">{selected
              ? `${selected.alias} · ${selected.banco} · ${selected.account_mask || selected.clabe_mask}`
              : selectedId ? "Cuenta no disponible; elige otra" : "Capturar manualmente o elegir cuenta"}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent variant="filter" align="start" className="z-[100] w-[var(--radix-popover-trigger-width)]">
          <Command>
            <CommandInput placeholder="Buscar banco o cuenta..." />
            <CommandList>
              <CommandEmpty>No hay cuentas guardadas</CommandEmpty>
              <CommandGroup>
                <CommandItem value="capturar manualmente" onSelect={() => { onSelect(""); setPickerOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", selectedId ? "opacity-0" : "opacity-100")} />
                  Capturar manualmente
                </CommandItem>
                {accounts?.map(account => (
                  <CommandItem key={account._id}
                    value={`${account.alias} ${account.banco} ${account.account_mask} ${account.clabe_mask}`}
                    onSelect={() => { onSelect(account._id); setPickerOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", account._id === selectedId ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{account.alias} · {account.banco} · {account.account_mask || account.clabe_mask}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="flex flex-wrap gap-2">
        {!selectedId && <Button type="button" variant="outline" size="sm" disabled={!canSaveManual || busy} onClick={saveManual}>
          <Plus className="h-4 w-4" /> Guardar en biblioteca
        </Button>}
        {rights?.canReview && <Button type="button" variant="quiet" size="sm" onClick={() => setManageOpen(true)}>
          Administrar biblioteca
        </Button>}
      </div>
      {rights?.canWrite && !selectedId && Boolean(numeroCuenta.trim() || clabe.trim()) && !canSaveManual && (
        <p className="text-xs text-muted-foreground">
          Para guardar, indica banco, cuenta de 8 a 20 dígitos o CLABE de 18 dígitos.
        </p>
      )}

      <Dialog open={manageOpen} onOpenChange={(open) => { setManageOpen(open); if (!open) { setEditingId(null); setCandidateId(null); } }}>
        <DialogContent data-square-modal="" className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Biblioteca de cuentas</DialogTitle>
            <DialogDescription>Revisa las cuentas del proveedor y los registros históricos pendientes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="font-medium">Cuentas del proveedor</h3>
              {management?.accounts.length ? management.accounts.map(account => (
                <div key={account._id} className="flex items-center justify-between gap-3 border p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{account.alias}</p>
                    <p className="text-muted-foreground">{account.banco} · {account.numero_cuenta || account.clabe} · {accountStatusLabel[account.status]}</p></div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => beginEdit(account)}>Editar</Button>
                    {account.status !== "archived" && <Button type="button" variant="outlineDanger" size="sm" disabled={busy}
                      onClick={async () => { setBusy(true); try { await archiveAccount({ projectId, id: account._id });
                        if (selectedId === account._id) onSelect(""); toast.success("Cuenta archivada");
                      } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo archivar"); }
                      finally { setBusy(false); } }}>Archivar</Button>}
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">Todavía no hay cuentas para este proveedor.</p>}
            </section>
            <section className="space-y-2">
              <h3 className="font-medium">Datos históricos pendientes</h3>
              {management?.candidates.length ? management.candidates.map(candidate => (
                <div key={candidate._id} className="flex items-center justify-between gap-3 border p-3 text-sm">
                  <div className="min-w-0"><p className="truncate">{candidate.banco || "Banco pendiente"} · {candidate.numero_cuenta || candidate.clabe || "Cuenta pendiente"}</p>
                    <p className="text-xs text-muted-foreground">{candidateReasonLabel[candidate.reason] || candidate.reason} · {providers?.find(provider => provider._id === candidate.provider_id)?.razon_social || "Sin proveedor"}</p></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => beginReview(candidate)}>Revisar</Button>
                </div>
              )) : <p className="text-sm text-muted-foreground">No hay registros pendientes.</p>}
            </section>
            {(editingId || candidateId) && <section className="space-y-3 border-t pt-4">
              <h3 className="font-medium">{editingId ? "Editar cuenta" : "Revisar registro histórico"}</h3>
              {candidateId && <Select value={reviewProviderId || "none"} onValueChange={value => setReviewProviderId(value === "none" ? "" : value as Id<"proveedores">)}>
                <SelectTrigger aria-label="Proveedor"><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Seleccionar proveedor</SelectItem>
                  {providers?.map(provider => <SelectItem key={provider._id} value={provider._id}>{provider.razon_social}</SelectItem>)}</SelectContent>
              </Select>}
              {editingId && <Input aria-label="Alias" placeholder="Alias" value={editAlias} onChange={event => setEditAlias(event.target.value)} />}
              <Input aria-label="Banco" placeholder="Banco" value={editBank} onChange={event => setEditBank(event.target.value)} />
              <Input aria-label="Número de cuenta" placeholder="Número de cuenta" value={editNumber} onChange={event => setEditNumber(event.target.value)} />
              <Input aria-label="CLABE" placeholder="CLABE" value={editClabe} onChange={event => setEditClabe(event.target.value)} />
              <div className="flex gap-2">
                {editingId && <Button type="button" disabled={busy} onClick={saveEdit}>Guardar cambios</Button>}
                {candidateId && <><Button type="button" disabled={busy || !reviewProviderId} onClick={() => decideCandidate("approve")}>Aprobar cuenta</Button>
                  <Button type="button" variant="outlineDanger" disabled={busy} onClick={() => decideCandidate("reject")}>Descartar</Button></>}
              </div>
            </section>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
