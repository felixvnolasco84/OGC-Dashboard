import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronUp,
  ChevronDown,
  FileText,
  Plus,
  Loader2,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  History,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { StatusDot, ResponsableSelector } from "./PermisosYLegalTab";

// ============================================================
// Types
// ============================================================

interface ContratistaGeneralRow {
  _id: Id<"contratistas_generales">;
  proyecto: Id<"desarrollos">;
  nombre: string;
  responsable_id?: Id<"users">;
  status_manual?: string;
  contrato_storage_id?: Id<"_storage">;
  contrato_nombre?: string;
  contrato_uploaded_at?: number;
  contrato_url?: string | null;
  siroc_numero?: string;
  siroc_storage_id?: Id<"_storage">;
  siroc_nombre?: string;
  siroc_uploaded_at?: number;
  siroc_url?: string | null;
}

interface SubcontratistaRow {
  _id: Id<"subcontratistas">;
  proyecto: Id<"desarrollos">;
  nombre: string;
  partida_nombre?: string;
  monto?: number;
  status_manual?: string;
  contrato_storage_id?: Id<"_storage">;
  contrato_nombre?: string;
  contrato_uploaded_at?: number;
  contrato_url?: string | null;
  siroc_numero?: string;
  siroc_storage_id?: Id<"_storage">;
  siroc_nombre?: string;
  siroc_uploaded_at?: number;
  siroc_url?: string | null;
}

interface PagoCuotaRow {
  _id: Id<"imss_pagos_cuota">;
  parent_type: string;
  parent_id: string;
  cuota_tipo?: string;
  monto: number;
  comprobante_nombre?: string;
  comprobante_uploaded_at?: number;
  comprobante_url?: string | null;
  soporte_nombre?: string;
  soporte_uploaded_at?: number;
  soporte_url?: string | null;
}

interface PartidaNivel1 {
  _id: Id<"partidas">;
  nombre: string;
}

interface HistorialEntry {
  _id: string;
  documento_nombre: string;
  documento_type: string;
  documento_size: number;
  replaced_at: number;
  replaced_by_name?: string;
  url?: string | null;
}

// ============================================================
// Helpers
// ============================================================

function formatCurrencyMXN(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatFileDate(timestamp?: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return `Subido el ${d.getDate()} de ${d.toLocaleString("es-MX", { month: "long" })} del ${d.getFullYear()}`;
}

// ============================================================
// Sub-components
// ============================================================

/** File cell with replace, delete & history support */
function FileCell({
  nombre,
  uploadedAt,
  url,
  onUpload,
  onDelete,
  uploading,
  placeholder,
  parentType,
  parentId,
}: {
  nombre?: string;
  uploadedAt?: number;
  url?: string | null;
  onUpload: (file: File) => void;
  onDelete?: () => void;
  uploading: boolean;
  placeholder?: string;
  parentType: string;
  parentId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  const historial = useQuery(
    api.autorizaciones_obra.getHistorial,
    parentId ? { parent_type: parentType, parent_id: parentId } : "skip"
  );

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          if (replaceInputRef.current) replaceInputRef.current.value = "";
        }}
      />
      {nombre ? (
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <a
              href={url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-gray-800 hover:text-gray-600"
            >
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="font-normal truncate max-w-[150px]">{nombre}</span>
            </a>
            <button
              className="text-gray-400 hover:text-gray-600 p-0.5"
              onClick={() => replaceInputRef.current?.click()}
              disabled={uploading}
              title="Reemplazar archivo"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
            </button>
            {historial && historial.length > 0 && (
              <button
                className="text-gray-400 hover:text-gray-600 p-0.5"
                onClick={() => setShowHistory(!showHistory)}
                title="Ver historial de archivos"
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                className="text-gray-400 hover:text-red-500 p-0.5"
                onClick={onDelete}
                title="Eliminar archivo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {uploadedAt && (
            <span className="text-xs text-[#C5C5C3] mt-0.5 ml-5.5 font-light text-left">
              {formatFileDate(uploadedAt)}
            </span>
          )}
          {showHistory && historial && historial.length > 0 && (
            <div className="mt-2 border border-gray-100 rounded p-2 bg-gray-50">
              <div className="text-xs font-normal text-gray-500 mb-1">Historial de archivos</div>
              {historial.map((h: HistorialEntry) => (
                <div key={h._id} className="flex items-center gap-2 py-1 text-xs text-gray-500">
                  <FileText className="w-3 h-3 shrink-0" />
                  <a
                    href={h.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline truncate max-w-[120px]"
                  >
                    {h.documento_nombre}
                  </a>
                  <span className="shrink-0 text-gray-400">
                    {new Date(h.replaced_at).toLocaleDateString("es-MX")}
                  </span>
                  {h.replaced_by_name && (
                    <span className="shrink-0 text-gray-400">por {h.replaced_by_name}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          className="text-sm text-gray-400 hover:text-gray-600"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            placeholder || "Por confirmar"
          )}
        </button>
      )}
    </div>
  );
}

/** Single Pago de Cuota row */
function PagoCuotaTableRow({
  pago,
  onUploadComprobante,
  onUploadSoporte,
  onDeleteComprobante,
  onDeleteSoporte,
  onUpdate,
  onDelete,
  uploadingField,
  showCuotaTipo,
  partidas,
}: {
  pago: PagoCuotaRow;
  onUploadComprobante: (file: File) => void;
  onUploadSoporte: (file: File) => void;
  onDeleteComprobante: () => void;
  onDeleteSoporte: () => void;
  onUpdate: (fields: { cuota_tipo?: string; monto?: number }) => void;
  onDelete: () => void;
  uploadingField: "comprobante" | "soporte" | null;
  showCuotaTipo: boolean;
  partidas: PartidaNivel1[];
}) {
  const [editMonto, setEditMonto] = useState("");

  const cols = showCuotaTipo
    ? "grid-cols-[1.2fr_1.2fr_1fr_1fr_auto]"
    : "grid-cols-[1.2fr_1.2fr_1fr_auto]";

  return (
    <div className={`grid ${cols} gap-4 items-center bg-[#FBFBFB] p-3 border-b  mt-2 border border-[#EAEAEA] rounded-sm`}>
      {/* Comprobante */}
      <FileCell
        nombre={pago.comprobante_nombre}
        uploadedAt={pago.comprobante_uploaded_at}
        url={pago.comprobante_url}
        onUpload={onUploadComprobante}
        onDelete={pago.comprobante_nombre ? onDeleteComprobante : undefined}
        uploading={uploadingField === "comprobante"}
        placeholder="Agregar comprobante"
        parentType="imss_comprobante"
        parentId={pago._id}
      />

      {/* Soporte */}
      <FileCell
        nombre={pago.soporte_nombre}
        uploadedAt={pago.soporte_uploaded_at}
        url={pago.soporte_url}
        onUpload={onUploadSoporte}
        onDelete={pago.soporte_nombre ? onDeleteSoporte : undefined}
        uploading={uploadingField === "soporte"}
        placeholder="Agregar soporte"
        parentType="imss_soporte"
        parentId={pago._id}
      />

      {/* Cuota tipo (only for CG section) */}
      {showCuotaTipo && (
        <Select
          value={pago.cuota_tipo || ""}
          onValueChange={(val) => onUpdate({ cuota_tipo: val })}
        >
          <SelectTrigger className="h-8 rounded-none border-gray-200 text-sm">
            <SelectValue placeholder="Tipo">
              {pago.cuota_tipo || "Tipo"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {partidas.map((p) => (
              <SelectItem key={p._id} value={p.nombre}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Monto */}
      <Input
        className="h-8 rounded-none border-transparent hover:border-gray-200 focus:border-gray-300 text-sm text-right"
        value={editMonto || (pago.monto ? formatCurrencyMXN(pago.monto) : "")}
        onFocus={() => setEditMonto(pago.monto?.toString() || "")}
        onChange={(e) => setEditMonto(e.target.value)}
        onBlur={() => {
          const num = parseFloat(editMonto.replace(/[^0-9.]/g, ""));
          if (!isNaN(num) && num !== pago.monto) {
            onUpdate({ monto: num });
          }
          setEditMonto("");
        }}
        placeholder="$0.00"
      />

      {/* Delete */}
      <button
        className="text-gray-300 hover:text-red-500 p-1"
        onClick={onDelete}
        title="Eliminar pago"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Pagos de Cuota section (used in both CG and Sub sections) */
function PagosCuotaSection({
  pagos,
  onCreatePago,
  onUpdatePago,
  onDeletePago,
  onUploadFile,
  onDeleteFile,
  uploadingPagoId,
  uploadingField,
  showCuotaTipo,
  partidas,
}: {
  pagos: PagoCuotaRow[];
  onCreatePago: () => void;
  onUpdatePago: (id: Id<"imss_pagos_cuota">, fields: { cuota_tipo?: string; monto?: number }) => void;
  onDeletePago: (id: Id<"imss_pagos_cuota">) => void;
  onUploadFile: (pagoId: Id<"imss_pagos_cuota">, file: File, field: "comprobante" | "soporte") => void;
  onDeleteFile: (pagoId: Id<"imss_pagos_cuota">, field: "comprobante" | "soporte") => void;
  uploadingPagoId: string | null;
  uploadingField: "comprobante" | "soporte" | null;
  showCuotaTipo: boolean;
  partidas: PartidaNivel1[];
}) {
  const headerCols = showCuotaTipo
    ? "grid-cols-[1.2fr_1.2fr_1fr_1fr_auto]"
    : "grid-cols-[1.2fr_1.2fr_1fr_auto]";

  return (
    <div className="mt-4">
      {/* Header */}
      <div className={`grid ${headerCols} gap-4 text-xs text-[#777770] font-normal pb-2 text-left`}>
        <span>Comprobante</span>
        <span>Soporte</span>
        {showCuotaTipo && <span>Cuota</span>}
        <span className="text-right">Monto</span>
        <span className="w-8" />
      </div>

      {/* Rows */}
      {pagos.map((p) => (
        <PagoCuotaTableRow
          key={p._id}
          pago={p}
          onUploadComprobante={(file) => onUploadFile(p._id, file, "comprobante")}
          onUploadSoporte={(file) => onUploadFile(p._id, file, "soporte")}
          onDeleteComprobante={() => onDeleteFile(p._id, "comprobante")}
          onDeleteSoporte={() => onDeleteFile(p._id, "soporte")}
          onUpdate={(fields) => onUpdatePago(p._id, fields)}
          onDelete={() => onDeletePago(p._id)}
          uploadingField={uploadingPagoId === p._id ? uploadingField : null}
          showCuotaTipo={showCuotaTipo}
          partidas={partidas}
        />
      ))}

      {pagos.length === 0 && (
        <div className="py-4 text-center text-sm text-gray-400">
          No hay pagos de cuota registrados
        </div>
      )}

      {/* Add button */}
      <button
        className="mt-3 w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 px-3 py-2 hover:border-gray-400 transition-colors"
        onClick={onCreatePago}
      >
        <Plus className="w-4 h-4" />
        Agregar Pago de Cuota
      </button>
    </div>
  );
}

/** Expandable Subcontratista Row for IMSS section */
function SubcontratistaImssRow({
  sub,
  pagos,
  totalSubsMonto,
  onCreatePago,
  onUpdatePago,
  onDeletePago,
  onUploadPagoFile,
  onDeletePagoFile,
  onUploadSirocFile,
  onUpdateSirocNumero,
  uploadingPagoId,
  uploadingField,
  uploadingSirocId,
  partidas,
}: {
  sub: SubcontratistaRow;
  pagos: PagoCuotaRow[];
  totalSubsMonto: number;
  onCreatePago: () => void;
  onUpdatePago: (id: Id<"imss_pagos_cuota">, fields: { cuota_tipo?: string; monto?: number }) => void;
  onDeletePago: (id: Id<"imss_pagos_cuota">) => void;
  onUploadPagoFile: (pagoId: Id<"imss_pagos_cuota">, file: File, field: "comprobante" | "soporte") => void;
  onDeletePagoFile: (pagoId: Id<"imss_pagos_cuota">, field: "comprobante" | "soporte") => void;
  onUploadSirocFile: (file: File) => void;
  onUpdateSirocNumero: (numero: string) => void;
  uploadingPagoId: string | null;
  uploadingField: "comprobante" | "soporte" | null;
  uploadingSirocId: string | null;
  partidas: PartidaNivel1[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editSiroc, setEditSiroc] = useState(sub.siroc_numero || "");

  const avanceTotal = pagos.reduce((sum, p) => sum + p.monto, 0);
  const progressPercent = totalSubsMonto > 0 ? Math.min((avanceTotal / totalSubsMonto) * 100, 100) : 0;
  const barColor = progressPercent > 50 ? "bg-[#4CC684]" : progressPercent > 25 ? "bg-yellow-400" : "bg-orange-400";

  return (
    <div>
      {/* Row */}
      <div
        className="grid grid-cols-[1.2fr_0.8fr_0.8fr_1.5fr_1fr_auto] gap-4 items-center p-3 border border-[#EAEAEA] cursor-pointer bg-[#FBFBFB] mt-2 rounded-sm"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-sm text-gray-900">{sub.nombre || "Sin nombre"}</span>
        <span className="text-sm text-gray-500">{sub.partida_nombre || "—"}</span>
        <span className="text-sm text-gray-700 font-normal">{sub.siroc_numero || "—"}</span>
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all duration-300`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 shrink-0">{Math.round(progressPercent)}%</span>
        </div>
        <span className="text-sm text-gray-900 text-right">{formatCurrencyMXN(avanceTotal)}</span>
        <button className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-4 bg-gray-50 border border-[#EAEAEA]">
          <div className="flex gap-8">
            {/* Left: SIROC + Contrato */}
            <div className="w-48 shrink-0 space-y-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">SIROC</div>
                <Input
                  className="h-7 rounded-none text-sm mb-1"
                  value={editSiroc}
                  onChange={(e) => setEditSiroc(e.target.value)}
                  onBlur={() => {
                    if (editSiroc !== (sub.siroc_numero || "")) {
                      onUpdateSirocNumero(editSiroc);
                    }
                  }}
                  placeholder="Número SIROC"
                />
                <FileCell
                  nombre={sub.siroc_nombre}
                  uploadedAt={sub.siroc_uploaded_at}
                  url={sub.siroc_url}
                  onUpload={onUploadSirocFile}
                  uploading={uploadingSirocId === sub._id}
                  placeholder="Agregar SIROC"
                  parentType="imss_siroc_sub"
                  parentId={sub._id}
                />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Contrato</div>
                {sub.contrato_nombre ? (
                  <a
                    href={sub.contrato_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-gray-800 hover:text-gray-600"
                  >
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="font-normal truncate max-w-[140px]">{sub.contrato_nombre}</span>
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">Sin contrato</span>
                )}
              </div>
            </div>

            {/* Right: Pagos */}
            <div className="flex-1 border border-gray-200 rounded bg-white p-4">
              <PagosCuotaSection
                pagos={pagos}
                onCreatePago={onCreatePago}
                onUpdatePago={onUpdatePago}
                onDeletePago={onDeletePago}
                onUploadFile={onUploadPagoFile}
                onDeleteFile={onDeletePagoFile}
                uploadingPagoId={uploadingPagoId}
                uploadingField={uploadingField}
                showCuotaTipo={false}
                partidas={partidas}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Tab Component
// ============================================================

export default function ImssYSirocTab({ proyectoId }: { proyectoId: string }) {
  const { user } = useUser();
  const [uploadingPagoId, setUploadingPagoId] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<"comprobante" | "soporte" | null>(null);
  const [uploadingSirocId, setUploadingSirocId] = useState<string | null>(null);
  const [uploadingContratoId, setUploadingContratoId] = useState<string | null>(null);
  const [costoInput, setCostoInput] = useState("");
  const [isEditingCostoTotal, setIsEditingCostoTotal] = useState(false);

  // ============================================================
  // Queries
  // ============================================================
  const imssConfig = useQuery(
    api.imss_siroc.getConfigByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const contratistas = useQuery(
    api.subcontratistas.getContratistasGeneralesByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const subcontratistas = useQuery(
    api.subcontratistas.getByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const allPagos = useQuery(
    api.imss_siroc.getPagosCuotaByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const allUsers = useQuery(api.autorizaciones_obra.getAllUsers);
  const allPartidas = useQuery(
    api.partida.getByNivel,
    proyectoId ? { proyecto: proyectoId as Id<"desarrollos">, nivel: 1 } : "skip"
  );

  // ============================================================
  // Mutations
  // ============================================================
  const upsertConfig = useMutation(api.imss_siroc.upsertConfig);
  const createPago = useMutation(api.imss_siroc.createPagoCuota);
  const updatePago = useMutation(api.imss_siroc.updatePagoCuota);
  const deletePago = useMutation(api.imss_siroc.deletePagoCuota);
  const attachComprobante = useMutation(api.imss_siroc.attachComprobante);
  const attachSoporte = useMutation(api.imss_siroc.attachSoporte);
  const removeComprobante = useMutation(api.imss_siroc.removeComprobante);
  const removeSoporte = useMutation(api.imss_siroc.removeSoporte);
  const generateUploadUrl = useMutation(api.imss_siroc.generateUploadUrl);
  const updateCG = useMutation(api.subcontratistas.updateContratistaGeneral);
  const attachCGContrato = useMutation(api.subcontratistas.attachContratistaGeneralContrato);
  const attachCGSiroc = useMutation(api.subcontratistas.attachContratistaGeneralSiroc);
  const updateSubSiroc = useMutation(api.subcontratistas.updateSubcontratistaSiroc);
  const attachSubSiroc = useMutation(api.subcontratistas.attachSubcontratistaSiroc);

  // ============================================================
  // Derived data
  // ============================================================
  const cgs = (contratistas || []) as ContratistaGeneralRow[];
  const subs = (subcontratistas || []) as SubcontratistaRow[];
  const pagos = (allPagos || []) as PagoCuotaRow[];
  const users = allUsers || [];
  const partidas: PartidaNivel1[] = useMemo(() => {
    if (!allPartidas) return [];
    const seen = new Set<string>();
    return allPartidas
      .filter((p) => {
        if (seen.has(p.nombre)) return false;
        seen.add(p.nombre);
        return true;
      })
      .map((p) => ({ _id: p._id, nombre: p.nombre }));
  }, [allPartidas]);

  const costoTotal = imssConfig?.costo_total_imss || 0;
  const montoCG = costoTotal * 0.2;
  const montoSubs = costoTotal * 0.8;

  // Pagos grouped by parent
  const pagosByCG = useMemo(() => {
    const map: Record<string, PagoCuotaRow[]> = {};
    pagos.forEach((p) => {
      if (p.parent_type === "contratista_general") {
        if (!map[p.parent_id]) map[p.parent_id] = [];
        map[p.parent_id].push(p);
      }
    });
    return map;
  }, [pagos]);

  const pagosBySub = useMemo(() => {
    const map: Record<string, PagoCuotaRow[]> = {};
    pagos.forEach((p) => {
      if (p.parent_type === "subcontratista") {
        if (!map[p.parent_id]) map[p.parent_id] = [];
        map[p.parent_id].push(p);
      }
    });
    return map;
  }, [pagos]);

  // Totals
  const totalPagosCG = pagos
    .filter((p) => p.parent_type === "contratista_general")
    .reduce((sum, p) => sum + p.monto, 0);
  const totalPagosSubs = pagos
    .filter((p) => p.parent_type === "subcontratista")
    .reduce((sum, p) => sum + p.monto, 0);
  const totalPagosAll = totalPagosCG + totalPagosSubs;
  const liquidadoPercent = costoTotal > 0 ? Math.min((totalPagosAll / costoTotal) * 100, 100) : 0;
  const pendiente = Math.max(costoTotal - totalPagosAll, 0);

  // CG metrics
  const avanceManoObraCG = pagos
    .filter((p) => p.parent_type === "contratista_general" && p.cuota_tipo === "Mano de Obra")
    .reduce((sum, p) => sum + p.monto, 0);
  const avanceMaterialCG = pagos
    .filter((p) => p.parent_type === "contratista_general" && p.cuota_tipo === "Material")
    .reduce((sum, p) => sum + p.monto, 0);
  const avanceTotalCG = totalPagosCG;
  const progressCG = montoCG > 0 ? Math.min((avanceTotalCG / montoCG) * 100, 100) : 0;

  // Sub SIROC metrics
  const progressSubs = montoSubs > 0 ? Math.min((totalPagosSubs / montoSubs) * 100, 100) : 0;

  // First CG SIROC for the project-level display
  const mainCG = cgs.length > 0 ? cgs[0] : null;

  // ============================================================
  // Handlers
  // ============================================================

  const handleSaveCostoTotal = useCallback(async () => {
    setIsEditingCostoTotal(false);
    const num = parseFloat(costoInput.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) {
      try {
        await upsertConfig({
          proyecto: proyectoId as Id<"desarrollos">,
          costo_total_imss: num,
        });
      } catch (err) {
        console.error("Error saving IMSS config:", err);
        toast.error("Error al guardar configuración IMSS");
      }
    }
    setCostoInput("");
  }, [costoInput, upsertConfig, proyectoId]);

  const handleCreatePago = useCallback(
    async (parentType: string, parentId: string) => {
      try {
        await createPago({
          proyecto: proyectoId as Id<"desarrollos">,
          parent_type: parentType,
          parent_id: parentId,
          monto: 0,
        });
      } catch (err) {
        console.error("Error creating pago:", err);
        toast.error("Error al crear pago de cuota");
      }
    },
    [createPago, proyectoId]
  );

  const handleUpdatePago = useCallback(
    async (id: Id<"imss_pagos_cuota">, fields: { cuota_tipo?: string; monto?: number }) => {
      try {
        await updatePago({ id, ...fields });
      } catch (err) {
        console.error("Error updating pago:", err);
        toast.error("Error al actualizar pago");
      }
    },
    [updatePago]
  );

  const handleDeletePago = useCallback(
    async (id: Id<"imss_pagos_cuota">) => {
      try {
        await deletePago({ id });
        toast.success("Pago eliminado");
      } catch (err) {
        console.error("Error deleting pago:", err);
        toast.error("Error al eliminar pago");
      }
    },
    [deletePago]
  );

  const handleUploadPagoFile = useCallback(
    async (pagoId: Id<"imss_pagos_cuota">, file: File, field: "comprobante" | "soporte") => {
      setUploadingPagoId(pagoId);
      setUploadingField(field);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) throw new Error("Upload failed");
        const { storageId } = await result.json();

        if (field === "comprobante") {
          await attachComprobante({
            id: pagoId,
            storage_id: storageId,
            nombre: file.name,
            size: file.size,
            type: file.type,
            clerk_id: user?.id,
          });
        } else {
          await attachSoporte({
            id: pagoId,
            storage_id: storageId,
            nombre: file.name,
            size: file.size,
            type: file.type,
            clerk_id: user?.id,
          });
        }
        toast.success("Archivo adjuntado");
      } catch (err) {
        console.error("Error uploading file:", err);
        toast.error("Error al subir archivo");
      } finally {
        setUploadingPagoId(null);
        setUploadingField(null);
      }
    },
    [generateUploadUrl, attachComprobante, attachSoporte, user]
  );

  const handleDeletePagoFile = useCallback(
    async (pagoId: Id<"imss_pagos_cuota">, field: "comprobante" | "soporte") => {
      try {
        if (field === "comprobante") {
          await removeComprobante({ id: pagoId });
        } else {
          await removeSoporte({ id: pagoId });
        }
        toast.success("Documento eliminado");
      } catch (err) {
        console.error("Error removing file:", err);
        toast.error("Error al eliminar documento");
      }
    },
    [removeComprobante, removeSoporte]
  );

  const handleUploadCGContrato = useCallback(
    async (cgId: Id<"contratistas_generales">, file: File) => {
      setUploadingContratoId(cgId);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) throw new Error("Upload failed");
        const { storageId } = await result.json();
        await attachCGContrato({
          id: cgId,
          storage_id: storageId,
          nombre: file.name,
          size: file.size,
          type: file.type,
        });
        toast.success("Contrato adjuntado");
      } catch (err) {
        console.error("Error uploading contrato:", err);
        toast.error("Error al subir contrato");
      } finally {
        setUploadingContratoId(null);
      }
    },
    [generateUploadUrl, attachCGContrato]
  );

  const handleUploadCGSiroc = useCallback(
    async (cgId: Id<"contratistas_generales">, file: File) => {
      setUploadingSirocId(cgId);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) throw new Error("Upload failed");
        const { storageId } = await result.json();
        await attachCGSiroc({
          id: cgId,
          storage_id: storageId,
          nombre: file.name,
          size: file.size,
          type: file.type,
        });
        toast.success("Archivo SIROC adjuntado");
      } catch (err) {
        console.error("Error uploading SIROC:", err);
        toast.error("Error al subir archivo SIROC");
      } finally {
        setUploadingSirocId(null);
      }
    },
    [generateUploadUrl, attachCGSiroc]
  );

  const handleUploadSubSiroc = useCallback(
    async (subId: Id<"subcontratistas">, file: File) => {
      setUploadingSirocId(subId);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) throw new Error("Upload failed");
        const { storageId } = await result.json();
        await attachSubSiroc({
          id: subId,
          storage_id: storageId,
          nombre: file.name,
          size: file.size,
          type: file.type,
        });
        toast.success("Archivo SIROC adjuntado");
      } catch (err) {
        console.error("Error uploading SIROC:", err);
        toast.error("Error al subir archivo SIROC");
      } finally {
        setUploadingSirocId(null);
      }
    },
    [generateUploadUrl, attachSubSiroc]
  );

  const handleEditCostoTotal = () => {
    setIsEditingCostoTotal(true);
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div>
      {/* ====== SECTION 1: Avance global IMSS ====== */}
      <div className="pt-6 pb-4">
        <p className="text-base text-left">Avance global IMSS</p>
      </div>

      <div className="border border-gray-200 rounded-sm bg-white p-6 space-y-6">
        {/* Three metric cards */}
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-gray-500 mb-1">Costo Total Obra IMSS</p>
            {
              !isEditingCostoTotal ? (
                <p className="text-3xl font-light text-gray-900 cursor-pointer" onClick={handleEditCostoTotal}>{formatCurrencyMXN(costoTotal)}</p>
              ) : (
                <Input
                  autoFocus
                  className="text-3xl font-light h-auto py-1 rounded-none border-transparent hover:border-gray-200 focus:border-gray-300"
                  value={costoInput}
                  onFocus={() => setCostoInput(costoTotal?.toString() || "")}
                  onChange={(e) => setCostoInput(e.target.value)}
                  onBlur={handleSaveCostoTotal}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setIsEditingCostoTotal(false); setCostoInput(""); } }}
                  placeholder="$0.00"
                />
              )
            }
            <p className="text-xs text-gray-400 mt-1">Base total registrada ante IMSS</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Contratista General</p>
            <p className="text-3xl font-light text-gray-900">{formatCurrencyMXN(montoCG)}</p>
            <p className="text-xs text-gray-400 mt-1">~20% del costo de obra ejecutado directamente</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Subcontratistas</p>
            <p className="text-3xl font-light text-gray-900">{formatCurrencyMXN(montoSubs)}</p>
            <p className="text-xs text-gray-400 mt-1">~80% participación de subcontratistas</p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="w-full h-3 bg-[#C9EEDA] overflow-hidden">
            <div
              className="h-full bg-[#4CC684] transition-all duration-300"
              style={{ width: `${liquidadoPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>{Math.round(liquidadoPercent)}% liquidado</span>
            <span>Pendiente: {formatCurrencyMXN(pendiente)}</span>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-orange-50 border border-orange-100 px-4 py-3 text-sm text-gray-700">
          Las cuotas IMSS se estiman en función de la base de obra registrada y los salarios reportados.
          Incluyen aportaciones obrero-patronales, INFONAVIT y SAR, y se determinan mediante el SUA.
        </div>
      </div>

      {/* ====== SECTION 2: Contratista General ====== */}
      <div className="mt-8 border border-gray-200 rounded-sm bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-6 border-b">
          <h3 className="text-base text-gray-900">Contratista General</h3>
          <div className="flex items-center gap-3">
            {mainCG && (
              <ResponsableSelector
                currentId={mainCG.responsable_id}
                users={users}
                onSelect={async (userId) => {
                  try {
                    await updateCG({ id: mainCG._id, responsable_id: userId });
                  } catch (err) {
                    console.error(err);
                    toast.error("Error al asignar responsable");
                  }
                }}
              />
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-4">
          {/* CG Table */}
          <div className="grid grid-cols-[auto_1.5fr_1.5fr_1fr_auto] gap-4 text-xs  font-normal pb-2 border-b border-gray-200 text-[#777770] text-left">
            <span className="w-6" />
            <span>Contratista</span>
            <span>Contrato</span>
            <span className="text-right">Pagos</span>
            <span className="w-8" />
          </div>

          {cgs.map((cg) => {
            const cgPagos = pagosByCG[cg._id] || [];
            const cgTotal = cgPagos.reduce((s, p) => s + p.monto, 0);

            return (
              <div
                key={cg._id}
                className="grid grid-cols-[auto_1.5fr_1.5fr_1fr_auto] gap-4 items-center py-4 border-b border-gray-100 text-left"
              >
                <StatusDot
                  status={cg.status_manual}
                  onToggle={async () => {
                    try {
                      await updateCG({
                        id: cg._id,
                        status_manual: cg.status_manual === "activo" ? "inactivo" : "activo",
                      });
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                />
                <span className="text-sm text-gray-900">{cg.nombre}</span>
                <FileCell
                  nombre={cg.contrato_nombre}
                  uploadedAt={cg.contrato_uploaded_at}
                  url={cg.contrato_url}
                  onUpload={(file) => handleUploadCGContrato(cg._id, file)}
                  uploading={uploadingContratoId === cg._id}
                  placeholder="Agregar contrato"
                  parentType="imss_cg_contrato"
                  parentId={cg._id}
                />
                <span className="text-sm text-gray-900 text-right">{formatCurrencyMXN(cgTotal)}</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-gray-400 hover:text-gray-600 p-1">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="end">
                    {cg.contrato_url && (
                      <a
                        href={cg.contrato_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded w-full"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Descargar contrato
                      </a>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            );
          })}

          {cgs.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-400">
              No hay contratistas generales registrados
            </div>
          )}

          {/* SIROC sub-section (for CG) */}
          {mainCG && (
            <div className="mt-6 border border-[#ECECEC] rounded-sm p-6">
              <div className="flex items-start gap-8 border-b border-[#ECECEC] pb-4">
                {/* Left: SIROC info */}
                <div className="shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-normal text-gray-900">
                      SIROC: {mainCG.siroc_numero || "Sin número"}
                    </span>
                  </div>
                  <FileCell
                    nombre={mainCG.siroc_nombre}
                    uploadedAt={mainCG.siroc_uploaded_at}
                    url={mainCG.siroc_url}
                    onUpload={(file) => handleUploadCGSiroc(mainCG._id, file)}
                    uploading={uploadingSirocId === mainCG._id}
                    placeholder="Agregar archivo SIROC"
                    parentType="imss_cg_siroc"
                    parentId={mainCG._id}
                  />
                </div>

                {/* Right: Metrics */}
                <div className="flex-1">
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Contratista General</p>
                      <p className="text-lg font-normal text-gray-900">{formatCurrencyMXN(montoCG)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Avance Mano de Obra</p>
                      <p className="text-lg font-normal text-gray-900">{formatCurrencyMXN(avanceManoObraCG)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Avance Material</p>
                      <p className="text-lg font-normal text-gray-900">{formatCurrencyMXN(avanceMaterialCG)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Avance Total</p>
                      <p className="text-lg font-normal text-gray-900">{formatCurrencyMXN(avanceTotalCG)}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-[#C9EEDA] overflow-hidden">
                    <div
                      className="h-full bg-[#4CC684] transition-all duration-300"
                      style={{ width: `${progressCG}%` }}
                    />
                  </div>
                  <div className="text-right mt-1">
                    <span className="text-xs text-gray-400">{Math.round(progressCG)}%</span>
                  </div>
                </div>
              </div>

              {/* Pagos de Cuota for CG */}
              <PagosCuotaSection
                pagos={pagosByCG[mainCG._id] || []}
                onCreatePago={() => handleCreatePago("contratista_general", mainCG._id)}
                onUpdatePago={handleUpdatePago}
                onDeletePago={handleDeletePago}
                onUploadFile={handleUploadPagoFile}
                onDeleteFile={handleDeletePagoFile}
                uploadingPagoId={uploadingPagoId}
                uploadingField={uploadingField}
                showCuotaTipo={true}
                partidas={partidas}
              />
            </div>
          )}
        </div>
      </div>

      {/* ====== SECTION 3: Subcontratistas ====== */}
      <div className="mt-8 border border-gray-200 rounded-sm bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-6 border-b">
          <h3 className="text-base text-gray-900">Contratista General</h3>
          <div className="flex items-center gap-3">
            {mainCG && (
              <ResponsableSelector
                currentId={mainCG.responsable_id}
                users={users}
                onSelect={async (userId) => {
                  try {
                    await updateCG({ id: mainCG._id, responsable_id: userId });
                  } catch (err) {
                    console.error(err);
                    toast.error("Error al asignar responsable");
                  }
                }}
              />
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-4">
          {/* SIROC sub-section for Subs */}
          <div className="border border-gray-200 rounded-sm p-6 mb-6">
            <div className="flex items-start gap-8">
              <div className="shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-normal text-gray-900">
                    SIROC: {mainCG?.siroc_numero || "Sin número"}
                  </span>
                </div>
                {mainCG?.siroc_nombre && (
                  <a
                    href={mainCG.siroc_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-gray-800 hover:text-gray-600"
                  >
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="font-normal">{mainCG.siroc_nombre}</span>
                  </a>
                )}
              </div>

              <div className="flex-1">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Subcontratistas</p>
                    <p className="text-lg font-normal text-gray-900">{formatCurrencyMXN(montoSubs)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-1">Avance Total</p>
                    <p className="text-lg font-normal text-gray-900">{formatCurrencyMXN(totalPagosSubs)}</p>
                  </div>
                </div>
                <div className="w-full h-2 bg-[#C9EEDA] overflow-hidden">
                  <div
                    className="h-full bg-[#4CC684] transition-all duration-300"
                    style={{ width: `${progressSubs}%` }}
                  />
                </div>
                <div className="text-right mt-1">
                  <span className="text-xs text-gray-400">{Math.round(progressSubs)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Subcontratistas table */}
          <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_1.5fr_1fr_auto] gap-4 text-xs text-gray-500 font-normal pb-2 border-b border-gray-200">
            <span>Subcontratista</span>
            <span>Partida</span>
            <span>SIROC</span>
            <span />
            <span className="text-right">Monto Avance</span>
            <span className="w-6" />
          </div>

          {subs.map((sub) => {
            const subPagos = pagosBySub[sub._id] || [];
            // Use the sub's monto from tab 2, or fallback to an equal share of montoSubs
            const subExpected = sub.monto || (subs.length > 0 ? montoSubs / subs.length : 0);

            return (
              <SubcontratistaImssRow
                key={sub._id}
                sub={sub}
                pagos={subPagos}
                totalSubsMonto={subExpected}
                onCreatePago={() => handleCreatePago("subcontratista", sub._id)}
                onUpdatePago={handleUpdatePago}
                onDeletePago={handleDeletePago}
                onUploadPagoFile={handleUploadPagoFile}
                onDeletePagoFile={handleDeletePagoFile}
                onUploadSirocFile={(file) => handleUploadSubSiroc(sub._id, file)}
                onUpdateSirocNumero={async (numero) => {
                  try {
                    await updateSubSiroc({ id: sub._id, siroc_numero: numero });
                  } catch (err) {
                    console.error(err);
                    toast.error("Error al actualizar SIROC");
                  }
                }}
                uploadingPagoId={uploadingPagoId}
                uploadingField={uploadingField}
                uploadingSirocId={uploadingSirocId}
                partidas={partidas}
              />
            );
          })}

          {subs.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-400">
              No hay subcontratistas registrados
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
