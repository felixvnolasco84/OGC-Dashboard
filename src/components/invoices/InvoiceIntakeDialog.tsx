import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import ProviderFormDialog from "@/components/providers/ProviderFormDialog";
import { cn } from "@/lib/utils";

type BudgetTarget = {
  id: string;
  nivel: 2 | 3;
  partida: string;
  familia: string;
  sub_partida: string;
  label: string;
};

type ItemDraft = {
  partidaId: string;
  amount: string;
};

const MAX_XML_SIZE = 5 * 1024 * 1024;
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRfc(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9&Ñ]/g, "");
}

function fileKind(file: File) {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (mime.includes("xml") || name.endsWith(".xml")) return "xml" as const;
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf" as const;
  if (mime.startsWith("image/") || /\.(png|jpe?g)$/i.test(name)) return "image" as const;
  return null;
}

function formatMoney(amount: number | undefined, currency = "MXN") {
  if (amount === undefined || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toLocaleString("es-MX")} ${currency}`;
  }
}

function allocateAmounts(total: number, weights: number[]) {
  if (!weights.length) return [];
  const sign = total < 0 ? -1 : 1;
  const cents = Math.round(Math.abs(total) * 100);
  const safeWeights = weights.map((weight) => Math.max(0, Math.abs(weight) || 0));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const effective = weightTotal > 0 ? safeWeights : safeWeights.map(() => 1);
  const effectiveTotal = effective.reduce((sum, weight) => sum + weight, 0);
  const allocated = effective.map((weight) => Math.floor(cents * weight / effectiveTotal));
  let remainder = cents - allocated.reduce((sum, value) => sum + value, 0);
  const order = effective.map((weight, index) => ({ weight, index }))
    .sort((left, right) => right.weight - left.weight || left.index - right.index);
  for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) {
    allocated[order[cursor % order.length].index] += 1;
  }
  return allocated.map((value) => sign * value / 100);
}

function BudgetTargetPicker({
  targets,
  value,
  onChange,
}: {
  targets: BudgetTarget[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = targets.find((target) => target.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-auto min-h-10 w-full justify-between whitespace-normal text-left font-normal", !selected && "text-muted-foreground")}
        >
          <span className="line-clamp-2">{selected?.label || "Seleccionar partida / familia / subpartida"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(38rem,calc(100vw-3rem))] p-0">
        <Command>
          <CommandInput placeholder="Buscar en el presupuesto…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No se encontró una ruta válida.</CommandEmpty>
            <CommandGroup>
              {targets.map((target) => (
                <CommandItem
                  key={target.id}
                  value={`${target.label} ${target.id}`}
                  onSelect={() => {
                    onChange(target.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", value === target.id ? "opacity-100" : "opacity-0")} />
                  <span>{target.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function InvoiceIntakeDialog({
  projectId: fixedProjectId,
  projectName,
  className,
}: {
  projectId?: Id<"desarrollos">;
  projectName?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(fixedProjectId || "");
  const [files, setFiles] = useState<File[]>([]);
  const [invoiceId, setInvoiceId] = useState<Id<"invoice_records"> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providerId, setProviderId] = useState<string>("");
  const [providerFormOpen, setProviderFormOpen] = useState(false);
  const [status, setStatus] = useState<"Pagado" | "Por pagar">("Por pagar");
  const [paymentType, setPaymentType] = useState("Por definir");
  const [transactionDate, setTransactionDate] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [transactionTotal, setTransactionTotal] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const initializedRunId = useRef<string | null>(null);

  const currentUser = useQuery(api.users.getCurrentUser);
  const canReview = currentUser?.role === "admin" || currentUser?.role === "finance";
  const canUpload = Boolean(currentUser && currentUser.role !== "viewer");
  const projects = useQuery(api.desarrollos.getAll, open && !fixedProjectId ? {} : "skip");
  const analysis = useQuery(
    api.invoiceAnalysis.getDirectIntake,
    open && invoiceId ? { invoice_id: invoiceId } : "skip",
  );
  const queue = useQuery(
    api.invoiceAnalysis.listDirectIntakeQueue,
    open && canReview
      ? { project_id: fixedProjectId, limit: 30 }
      : "skip",
  );
  const providers = useQuery(api.proveedores.getAll, open && analysis?.invoice.status === "review_required" ? {} : "skip");
  const generateUploadUrl = useMutation(api.documentos.generateUploadUrl);
  const startIntake = useMutation(api.invoiceAnalysis.startDirectInvoiceIntake);
  const approveInvoice = useMutation(api.invoiceAnalysis.approveDirectInvoice);
  const reviewInvoice = useMutation(api.invoiceAnalysis.reviewInvoiceAnalysis);

  const budgetTargets = (analysis?.budget_targets || []) as BudgetTarget[];
  const selectedProjectName = fixedProjectId
    ? projectName
    : projects?.find((project) => project._id === selectedProjectId)?.nombre;

  useEffect(() => {
    if (fixedProjectId) setSelectedProjectId(fixedProjectId);
  }, [fixedProjectId]);

  useEffect(() => {
    if (!analysis?.run || analysis.invoice.status !== "review_required") return;
    if (initializedRunId.current === String(analysis.run._id)) return;
    initializedRunId.current = String(analysis.run._id);
    const signedTotal = analysis.invoice.invoice_type === "credit_note"
      ? -Math.abs(analysis.invoice.total || 0)
      : Math.abs(analysis.invoice.total || 0);
    const weights = analysis.items.map((item) =>
      Math.abs(item.gross_amount ?? ((item.net_amount || 0) - (item.discount || 0) + (item.tax_amount || 0))) || 1);
    const allocated = allocateAmounts(signedTotal || weights.reduce((sum, value) => sum + value, 0), weights);
    setItemDrafts(Object.fromEntries(analysis.items.map((item, index) => [String(item._id), {
      partidaId: item.proposed_partida_id && item.budget_match_confidence !== "low"
        ? String(item.proposed_partida_id)
        : "",
      amount: String(allocated[index] ?? 0),
    }])));
    setTransactionTotal(String(signedTotal || allocated.reduce((sum, value) => sum + value, 0)));
    setCurrency(analysis.invoice.currency && analysis.invoice.currency !== "SIN_MONEDA" ? analysis.invoice.currency : "MXN");
    setExchangeRate("1");
    setTransactionDate(String(analysis.invoice.issued_at || "").slice(0, 10));
    setStatus("Por pagar");
    setPaymentType("Por definir");
    setReason("");
  }, [analysis]);

  useEffect(() => {
    if (!analysis?.invoice || !providers?.length || providerId) return;
    const invoiceRfc = normalizeRfc(analysis.invoice.issuer_rfc);
    const invoiceName = normalize(analysis.invoice.issuer_name);
    const exactRfc = invoiceRfc
      ? providers.find((provider) => normalizeRfc(provider.rfc) === invoiceRfc)
      : undefined;
    const exactName = !exactRfc && invoiceName
      ? providers.find((provider) => normalize(provider.razon_social) === invoiceName)
      : undefined;
    const match = exactRfc || exactName;
    if (match) setProviderId(String(match._id));
  }, [analysis?.invoice, providers, providerId]);

  function resetDraft() {
    setFiles([]);
    setInvoiceId(null);
    setProviderId("");
    setItemDrafts({});
    setReason("");
    initializedRunId.current = null;
  }

  function handleFiles(nextFiles: File[]) {
    const compatible = nextFiles.filter((file) => fileKind(file));
    if (compatible.length !== nextFiles.length || compatible.length < 1 || compatible.length > 2) {
      toast.error("Selecciona un XML y, opcionalmente, un PDF o una imagen.");
      return;
    }
    const kinds = compatible.map(fileKind);
    if (kinds.filter((kind) => kind === "xml").length > 1 || kinds.filter((kind) => kind !== "xml").length > 1) {
      toast.error("Sólo se admite un XML y un respaldo visual.");
      return;
    }
    const oversized = compatible.find((file) => {
      const kind = fileKind(file);
      const max = kind === "xml" ? MAX_XML_SIZE : kind === "pdf" ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
      return file.size <= 0 || file.size > max;
    });
    if (oversized) {
      toast.error(`${oversized.name} excede el tamaño permitido.`);
      return;
    }
    setFiles(compatible);
  }

  async function handleUpload() {
    if (!selectedProjectId || !files.length) return;
    setIsUploading(true);
    try {
      const documents = [];
      for (const file of files) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || (fileKind(file) === "xml" ? "application/xml" : "application/octet-stream") },
          body: file,
        });
        if (!response.ok) throw new Error(`No se pudo subir ${file.name}.`);
        const { storageId } = await response.json();
        documents.push({
          storage_id: storageId as Id<"_storage">,
          name: file.name,
          type: "factura",
          size: file.size,
          mime_type: file.type || undefined,
        });
      }
      const result = await startIntake({
        project_id: selectedProjectId as Id<"desarrollos">,
        documents,
        client_request_id: crypto.randomUUID(),
      });
      setInvoiceId(result.invoice_id);
      toast.success("Factura recibida", { description: "La extracción y clasificación ya comenzaron." });
    } catch (error) {
      toast.error("No se pudo iniciar el análisis", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsUploading(false);
    }
  }

  const itemTotal = useMemo(() => Object.values(itemDrafts)
    .reduce((sum, draft) => sum + (Number(draft.amount) || 0), 0), [itemDrafts]);
  const allItemsMapped = Boolean(analysis?.items.length) && analysis!.items.every((item) =>
    Boolean(itemDrafts[String(item._id)]?.partidaId));
  const totalsMatch = Math.abs(itemTotal - (Number(transactionTotal) || 0)) <= 0.01;
  const needsReason = Boolean(analysis?.invoice && (
    analysis.invoice.invoice_type === "unknown" ||
    (analysis.invoice.total !== undefined && Math.abs(
      (analysis.invoice.invoice_type === "credit_note" ? -Math.abs(analysis.invoice.total) : Math.abs(analysis.invoice.total)) -
      (Number(transactionTotal) || 0),
    ) > 0.01)
  ));
  const canApprove = Boolean(
    canReview && analysis?.run && analysis.invoice.status === "review_required" &&
    !analysis.duplicate_invoice && providerId && allItemsMapped && totalsMatch &&
    transactionDate && currency && Number(exchangeRate) > 0 &&
    (status !== "Pagado" || (paymentType && paymentType !== "Por definir")) &&
    (!needsReason || reason.trim()),
  );

  async function handleApprove() {
    if (!analysis?.run || !canApprove) return;
    setIsSubmitting(true);
    try {
      const result = await approveInvoice({
        invoice_id: analysis.invoice._id,
        run_id: analysis.run._id,
        expected_revision: analysis.invoice.revision,
        provider_id: providerId as Id<"proveedores">,
        reason: reason.trim() || undefined,
        transaction: {
          monto_total: Number(transactionTotal),
          fecha: transactionDate,
          status,
          tipo_pago: status === "Pagado" ? paymentType : "Por definir",
          moneda: currency,
          tipo_cambio: exchangeRate,
          codigo_referencia: reference.trim() || undefined,
        },
        items: analysis.items.map((item) => ({
          item_id: item._id,
          partida_id: itemDrafts[String(item._id)].partidaId as Id<"partidas">,
          amount: Number(itemDrafts[String(item._id)].amount),
        })),
      });
      toast.success("Factura integrada", { description: "La transacción y sus conceptos ya forman parte del presupuesto." });
      navigate(`/proyecto/${analysis.project._id}/transacciones?factura=${encodeURIComponent(analysis.invoice.folio || analysis.invoice.uuid || "")}`);
      setOpen(false);
      resetDraft();
      return result;
    } catch (error) {
      toast.error("No se pudo integrar la factura", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReject() {
    if (!analysis?.run || !reason.trim()) return;
    setIsSubmitting(true);
    try {
      await reviewInvoice({
        invoice_id: analysis.invoice._id,
        run_id: analysis.run._id,
        expected_revision: analysis.invoice.revision,
        decision: "reject",
        reason: reason.trim(),
        items: [],
        allocations: [],
      });
      toast.success("Factura rechazada");
      resetDraft();
    } catch (error) {
      toast.error("No se pudo rechazar", { description: error instanceof Error ? error.message : "Error inesperado" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canUpload && !canReview) return null;

  return (
    <>
      <Button variant="outline" size="lg" className={cn("flex items-center gap-2 rounded-none py-6 text-subtle-foreground", className)} onClick={() => setOpen(true)}>
        Cargar factura
        <Upload className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && analysis?.invoice.status === "approved") resetDraft();
      }}>
        <DialogContent data-square-modal="" className="max-h-[94vh] max-w-6xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle>Cargar y clasificar factura</DialogTitle>
            <DialogDescription>
              {selectedProjectName ? `${selectedProjectName} · ` : ""}La transacción se crea únicamente después de la aprobación.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(94vh-82px)] overflow-y-auto">
            {!invoiceId ? (
              <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <section className="space-y-5">
                  {!fixedProjectId && (
                    <div className="space-y-2">
                      <Label>Proyecto</Label>
                      <Select value={selectedProjectId || undefined} onValueChange={setSelectedProjectId}>
                        <SelectTrigger><SelectValue placeholder="Selecciona el proyecto" /></SelectTrigger>
                        <SelectContent>{projects?.map((project) => <SelectItem key={project._id} value={project._id}>{project.nombre}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>CFDI XML y respaldo opcional</Label>
                    <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center border border-dashed border-border-strong bg-muted/20 px-6 text-center hover:bg-muted/40">
                      <Upload className="h-7 w-7 text-muted-foreground" />
                      <span className="mt-3 text-sm font-medium">Seleccionar factura</span>
                      <span className="mt-1 text-xs text-muted-foreground">XML, PDF, PNG o JPEG. Máximo un XML y un respaldo visual.</span>
                      <input type="file" className="sr-only" multiple accept=".xml,.pdf,.png,.jpg,.jpeg,application/xml,application/pdf,image/png,image/jpeg" onChange={(event) => handleFiles(Array.from(event.target.files || []))} />
                    </label>
                    {files.map((file) => (
                      <div key={`${file.name}:${file.size}`} className="flex items-center gap-3 border border-border px-3 py-2 text-sm">
                        <FileText className="h-4 w-4" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <Badge variant="outline">{fileKind(file)?.toUpperCase()}</Badge>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full" onClick={handleUpload} disabled={isUploading || !selectedProjectId || files.length === 0}>
                    {isUploading ? <Loader2 className="animate-spin" /> : <Bot />}
                    {isUploading ? "Subiendo…" : "Subir y analizar"}
                  </Button>
                </section>
                <section className="border border-border bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold">Pendientes de revisión</h3>
                  {!canReview ? (
                    <p className="mt-2 text-xs text-muted-foreground">Finanzas o un administrador aprobará las facturas cargadas.</p>
                  ) : queue === undefined ? (
                    <Loader2 className="mt-3 h-4 w-4 animate-spin" />
                  ) : queue.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No hay facturas pendientes.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {queue.map((row) => (
                        <button key={row._id} type="button" className="w-full border border-border bg-card p-3 text-left hover:bg-muted/40" onClick={() => { initializedRunId.current = null; setInvoiceId(row._id); }}>
                          <span className="block truncate text-sm font-medium">{row.folio || row.issuer_name || "Factura en análisis"}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{row.project_name} · {row.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : !analysis ? (
              <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : analysis.invoice.status === "queued" || analysis.invoice.status === "extracting" ? (
              <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <h3 className="mt-4 font-medium">Desglosando y comparando conceptos</h3>
                <p className="mt-1 text-sm text-muted-foreground">La vista se actualizará cuando termine el análisis.</p>
              </div>
            ) : analysis.invoice.status === "failed" ? (
              <div className="p-6">
                <Alert variant="destructive"><XCircle /><AlertTitle>No se pudo analizar</AlertTitle><AlertDescription>{analysis.run?.error || "Revisa el archivo e intenta nuevamente."}</AlertDescription></Alert>
                <Button className="mt-4" variant="outline" onClick={resetDraft}>Cargar otra factura</Button>
              </div>
            ) : analysis.invoice.status === "rejected" ? (
              <div className="p-6"><Alert><XCircle /><AlertTitle>Factura rechazada</AlertTitle><AlertDescription>Esta carga no se integró al presupuesto.</AlertDescription></Alert><Button className="mt-4" variant="outline" onClick={resetDraft}>Volver</Button></div>
            ) : (
              <div className="space-y-6 p-6">
                {analysis.duplicate_invoice && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>Factura duplicada</AlertTitle>
                    <AlertDescription>
                      El UUID o los archivos ya pertenecen a otra factura. Esta carga no puede integrarse.
                      {analysis.duplicate_invoice.integrated_transaction_id && (
                        <Button className="ml-2 h-7" variant="outline" size="sm" onClick={() => navigate(`/proyecto/${analysis.project._id}/transacciones?factura=${encodeURIComponent(analysis.duplicate_invoice?.folio || analysis.duplicate_invoice?.uuid || "")}`)}>Abrir existente</Button>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                {analysis.run?.warnings?.length ? (
                  <Alert><AlertCircle /><AlertTitle>Advertencias del análisis</AlertTitle><AlertDescription><ul className="list-disc space-y-1 pl-4">{analysis.run.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert>
                ) : null}
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="border border-border p-3"><span className="text-xs text-muted-foreground">Emisor</span><p className="mt-1 truncate text-sm font-medium">{analysis.invoice.issuer_name || "No identificado"}</p></div>
                  <div className="border border-border p-3"><span className="text-xs text-muted-foreground">RFC</span><p className="mt-1 text-sm font-medium">{analysis.invoice.issuer_rfc || "—"}</p></div>
                  <div className="border border-border p-3"><span className="text-xs text-muted-foreground">Folio / UUID</span><p className="mt-1 truncate text-sm font-medium">{analysis.invoice.folio || analysis.invoice.uuid || "—"}</p></div>
                  <div className="border border-border p-3"><span className="text-xs text-muted-foreground">Fecha</span><p className="mt-1 text-sm font-medium">{String(analysis.invoice.issued_at || "—").slice(0, 10)}</p></div>
                  <div className="border border-border p-3"><span className="text-xs text-muted-foreground">Total extraído</span><p className="mt-1 text-sm font-medium">{formatMoney(analysis.invoice.total, analysis.invoice.currency)}</p></div>
                </section>

                {!analysis.can_review ? (
                  <Alert><ShieldCheck /><AlertTitle>Pendiente de aprobación</AlertTitle><AlertDescription>La extracción terminó. Finanzas o un administrador debe revisar las rutas presupuestales antes de integrarla.</AlertDescription></Alert>
                ) : (
                  <>
                    <section className="grid gap-4 border border-border p-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-2 lg:col-span-2">
                        <Label>Proveedor confirmado</Label>
                        <div className="flex gap-2">
                          <Select value={providerId || undefined} onValueChange={setProviderId}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder="Selecciona el proveedor" /></SelectTrigger>
                            <SelectContent>{providers?.map((provider) => <SelectItem key={provider._id} value={provider._id}>{provider.razon_social}{provider.rfc ? ` · ${provider.rfc}` : ""}</SelectItem>)}</SelectContent>
                          </Select>
                          <Button type="button" variant="outline" size="icon" onClick={() => setProviderFormOpen(true)} aria-label="Crear proveedor"><Plus /></Button>
                        </div>
                      </div>
                      <div className="space-y-2"><Label>Estado</Label><Select value={status} onValueChange={(value) => { const next = value as typeof status; setStatus(next); if (next === "Por pagar") setPaymentType("Por definir"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Por pagar">Por pagar</SelectItem><SelectItem value="Pagado">Pagado</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label>Fecha {status === "Pagado" ? "de pago" : "de registro"}</Label><Input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></div>
                      <div className="space-y-2"><Label>Método de pago</Label><Select disabled={status !== "Pagado"} value={paymentType} onValueChange={setPaymentType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Por definir">Por definir</SelectItem><SelectItem value="transferencia">Transferencia</SelectItem><SelectItem value="efectivo">Efectivo</SelectItem><SelectItem value="tarjeta">Tarjeta</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label>Moneda</Label><Select value={currency} onValueChange={(value) => { setCurrency(value); if (value === "MXN") setExchangeRate("1"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MXN">MXN</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label>Tipo de cambio</Label><Input type="number" min="0.000001" step="0.000001" disabled={currency === "MXN"} value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} /></div>
                      <div className="space-y-2"><Label>Total revisado</Label><Input type="number" step="0.01" value={transactionTotal} onChange={(event) => setTransactionTotal(event.target.value)} /></div>
                      <div className="space-y-2 lg:col-span-2"><Label>Referencia opcional</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} /></div>
                    </section>

                    <section className="overflow-hidden border border-border">
                      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
                        <div><h3 className="text-sm font-semibold">Conceptos y ruta presupuestal</h3><p className="text-xs text-muted-foreground">Las sugerencias de confianza baja requieren selección manual.</p></div>
                        <Badge variant={totalsMatch ? "secondary" : "destructive"}>Suma {formatMoney(itemTotal, currency)}</Badge>
                      </div>
                      <div className="max-h-[32rem] divide-y divide-border overflow-y-auto">
                        {analysis.items.map((item) => {
                          const draft = itemDrafts[String(item._id)] || { partidaId: "", amount: "" };
                          return (
                            <article key={item._id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_9rem]">
                              <div className="min-w-0">
                                <p className="text-sm font-medium leading-snug">{item.description}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{item.quantity ? `${item.quantity} ${item.unit || ""} · ` : ""}{formatMoney(item.gross_amount ?? item.net_amount, currency)}</p>
                                <div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">Confianza {item.budget_match_confidence || "baja"}</Badge>{item.product_code && <Badge variant="outline">SAT {item.product_code}</Badge>}</div>
                                {item.budget_match_reason && <p className="mt-2 text-xs text-muted-foreground">{item.budget_match_reason}</p>}
                              </div>
                              <BudgetTargetPicker targets={budgetTargets} value={draft.partidaId} onChange={(value) => setItemDrafts((current) => ({ ...current, [String(item._id)]: { ...draft, partidaId: value } }))} />
                              <div className="space-y-2"><Label>Importe</Label><Input type="number" step="0.01" value={draft.amount} onChange={(event) => setItemDrafts((current) => ({ ...current, [String(item._id)]: { ...draft, amount: event.target.value } }))} /></div>
                            </article>
                          );
                        })}
                      </div>
                    </section>

                    <section className="space-y-3 border border-border p-4">
                      <div className="space-y-2"><Label>Justificación de excepción o rechazo</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={needsReason ? "Obligatoria porque el total o tipo difiere del documento" : "Opcional al aprobar; obligatoria para rechazar"} /></div>
                      {!allItemsMapped && <p className="text-xs text-amber-700">Selecciona una ruta válida para todos los conceptos.</p>}
                      {!totalsMatch && <p className="text-xs text-amber-700">La suma de conceptos debe coincidir con el total revisado.</p>}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" onClick={resetDraft}>Volver a cargas</Button>
                        <Button variant="outline" className="text-destructive" disabled={isSubmitting || !reason.trim()} onClick={handleReject}><XCircle />Rechazar</Button>
                        <Button disabled={isSubmitting || !canApprove} onClick={handleApprove}>{isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Aprobar e integrar</Button>
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ProviderFormDialog open={providerFormOpen} onOpenChange={setProviderFormOpen} onSaved={(id) => setProviderId(String(id))} />
    </>
  );
}
