import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  ChevronUp,
  ChevronDown,
  Upload,
  FileText,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";

// ============================================================
// Types
// ============================================================

type SeccionType = "licencia" | "poliza" | "plan_seguridad" | "tramites";

interface AutorizacionSection {
  _id: Id<"autorizaciones_obra">;
  proyecto: Id<"desarrollos">;
  seccion: string;
  status_manual?: string;
  responsable_id?: Id<"users">;
  responsable?: { _id: Id<"users">; name: string; email: string } | null;
  numero_licencia?: string;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  suma_asegurada?: number;
  vigencia?: string;
  documento_storage_id?: Id<"_storage">;
  documento_nombre?: string;
  documento_size?: number;
  documento_type?: string;
  documento_uploaded_at?: number;
  documento_url?: string | null;
}

interface TramiteItem {
  _id: Id<"autorizaciones_obra_tramites">;
  servicio: string;
  tramite: string;
  estado: string;
  documento_storage_id?: Id<"_storage">;
  documento_nombre?: string;
  documento_uploaded_at?: number;
  documento_url?: string | null;
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

function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return "";
  return dateStr;
}

function parseDateStr(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  try {
    if (dateStr.includes("/")) {
      return parse(dateStr, "dd/MM/yyyy", new Date());
    }
    return new Date(dateStr);
  } catch {
    return undefined;
  }
}

function formatDateToStr(date: Date): string {
  return format(date, "dd/MM/yyyy");
}

function formatFileDate(timestamp?: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return `Subido el ${d.getDate()} de ${d.toLocaleString("es-MX", { month: "long" })} del ${d.getFullYear()}`;
}

function formatCurrencyMXN(amount?: number): string {
  if (amount === undefined || amount === null) return "";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}

// ============================================================
// Sub-components
// ============================================================

/** Status indicator dot - clickable to toggle */
export function StatusDot({
  status,
  onToggle,
}: {
  status?: string;
  onToggle: () => void;
}) {
  const isActive = status === "activo";
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors border-2",
        isActive
          ? "bg-[#1A5D21] border-[#1A5D21] text-white"
          : "bg-white border-gray-300 text-gray-300 hover:border-gray-400"
      )}
      title={isActive ? "Activo — clic para desactivar" : "Inactivo — clic para activar"}
    >
      {isActive && (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

/** Responsable badge / selector */
export function ResponsableSelector({
  currentId,
  users,
  onSelect,
}: {
  currentId?: Id<"users">;
  users: { _id: Id<"users">; name: string; email: string }[];
  onSelect: (userId: Id<"users"> | undefined) => void;
}) {
  const current = users.find((u) => u._id === currentId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {current ? (
          <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900">
            <span>{current.name}</span>
            <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
              {current.name.charAt(0).toUpperCase()}
            </span>
          </button>
        ) : (
          <button className="text-sm text-[#777770] hover:text-gray-600">
            Asignar responsable
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="text-xs font-medium text-gray-500 px-2 py-1 mb-1">
          Seleccionar responsable
        </div>
        <div className="max-h-48 overflow-y-auto">
          {current && (
            <button
              className="w-full text-left px-2 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded"
              onClick={() => onSelect(undefined)}
            >
              Quitar responsable
            </button>
          )}
          {users.map((u) => (
            <button
              key={u._id}
              className={cn(
                "w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded flex items-center gap-2",
                u._id === currentId && "bg-gray-100 font-medium"
              )}
              onClick={() => onSelect(u._id)}
            >
              <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{u.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Date picker field */
function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (dateStr: string) => void;
}) {
  const dateObj = value ? parseDateStr(value) : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex items-center h-9 w-full border border-gray-200 px-3 text-sm text-left hover:border-gray-300">
            <span className={cn("flex-1", !value && "text-gray-400")}>
              {value ? formatDateDisplay(value) : "Fecha"}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateObj}
            onSelect={(d) => {
              if (d) onChange(formatDateToStr(d));
            }}
            locale={es}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Document attachment display with replace option */
function DocumentAttachment({
  nombre,
  uploadedAt,
  url,
  onUpload,
  onReplace,
  uploading,
  parentType,
  parentId,
}: {
  nombre?: string;
  uploadedAt?: number;
  url?: string | null;
  onUpload: (file: File) => void;
  onReplace: (file: File) => void;
  uploading: boolean;
  parentType: string;
  parentId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  const historial = useQuery(api.autorizaciones_obra.getHistorial, {
    parent_type: parentType,
    parent_id: parentId,
  });

  if (!nombre) {
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
        <button
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 px-3 py-2 hover:border-gray-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Agregar documento
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <a
          href={url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-gray-800 hover:text-gray-600"
        >
          <FileText className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="font-medium">{nombre}</span>
        </a>
        <input
          ref={replaceInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onReplace(f);
            if (replaceInputRef.current) replaceInputRef.current.value = "";
          }}
        />
        <button
          className="text-gray-400 hover:text-gray-600 p-1"
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
            className="text-gray-400 hover:text-gray-600 p-1"
            onClick={() => setShowHistory(!showHistory)}
            title="Ver historial de archivos"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {uploadedAt && (
        <span className="text-xs text-[#C5C5C3] font-light">{formatFileDate(uploadedAt)}</span>
      )}
      {showHistory && historial && historial.length > 0 && (
        <div className="mt-2 border border-gray-100 rounded p-2 bg-gray-50">
          <div className="text-xs font-medium text-gray-500 mb-1">Historial de archivos</div>
          {historial.map((h: HistorialEntry) => (
            <div key={h._id} className="flex items-center gap-2 py-1 text-xs text-gray-500">
              <FileText className="w-3 h-3 shrink-0" />
              <a
                href={h.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-700 truncate"
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
  );
}

// ============================================================
// Section Components
// ============================================================

/** Licencia de construcción vigente */
function LicenciaSection({
  section,
  users,
  onUpdateStatus,
  onUpdateResponsable,
  onUpdateFields,
  onUploadDocument,
  uploading,
}: {
  section?: AutorizacionSection;
  users: { _id: Id<"users">; name: string; email: string }[];
  onUpdateStatus: (seccion: SeccionType, sectionId?: Id<"autorizaciones_obra">) => void;
  onUpdateResponsable: (seccion: SeccionType, userId: Id<"users"> | undefined, sectionId?: Id<"autorizaciones_obra">) => void;
  onUpdateFields: (seccion: SeccionType, fields: Record<string, unknown>, sectionId?: Id<"autorizaciones_obra">) => void;
  onUploadDocument: (seccion: SeccionType, file: File, replace: boolean) => void;
  uploading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-sm bg-white">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-6 cursor-pointer border-b"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <StatusDot
            status={section?.status_manual}
            onToggle={() => {
              onUpdateStatus("licencia", section?._id);
            }}
          />
          <h3 className="text-base  text-gray-900">
            Licencia de construcción vigente
          </h3>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <ResponsableSelector
            currentId={section?.responsable_id}
            users={users}
            onSelect={(userId) => onUpdateResponsable("licencia", userId, section?._id)}
          />
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-6 pb-6 pt-6 grid grid-cols-3 gap-6 text-left">
          {/* Número de Licencia + Document */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500">Número de Licencia</span>
            <DocumentAttachment
              nombre={section?.documento_nombre}
              uploadedAt={section?.documento_uploaded_at}
              url={section?.documento_url}
              onUpload={(f) => onUploadDocument("licencia", f, false)}
              onReplace={(f) => onUploadDocument("licencia", f, true)}
              uploading={uploading}
              parentType="autorizacion"
              parentId={section?._id ?? ""}
            />
          </div>

          {/* Fecha de emisión */}
          <DatePickerField
            label="Fecha de emisión"
            value={section?.fecha_emision}
            onChange={(v) => onUpdateFields("licencia", { fecha_emision: v }, section?._id)}
          />

          {/* Fecha de Vencimiento */}
          <DatePickerField
            label="Fecha de Vencimiento"
            value={section?.fecha_vencimiento}
            onChange={(v) => onUpdateFields("licencia", { fecha_vencimiento: v }, section?._id)}
          />
        </div>
      )}
    </div>
  );
}

/** Póliza de seguro de obra activa */
function PolizaSection({
  section,
  users,
  onUpdateStatus,
  onUpdateResponsable,
  onUpdateFields,
  onUploadDocument,
  uploading,
}: {
  section?: AutorizacionSection;
  users: { _id: Id<"users">; name: string; email: string }[];
  onUpdateStatus: (seccion: SeccionType, sectionId?: Id<"autorizaciones_obra">) => void;
  onUpdateResponsable: (seccion: SeccionType, userId: Id<"users"> | undefined, sectionId?: Id<"autorizaciones_obra">) => void;
  onUpdateFields: (seccion: SeccionType, fields: Record<string, unknown>, sectionId?: Id<"autorizaciones_obra">) => void;
  onUploadDocument: (seccion: SeccionType, file: File, replace: boolean) => void;
  uploading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [sumaInput, setSumaInput] = useState("");

  const handleSumaBlur = () => {
    const num = parseFloat(sumaInput.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) {
      onUpdateFields("poliza", { suma_asegurada: num }, section?._id);
    }
  };

  // Sync local input from section data
  const displaySuma = sumaInput || (section?.suma_asegurada ? formatCurrencyMXN(section.suma_asegurada) : "");

  return (
    <div className="border border-gray-200 rounded-sm bg-white">
      <div
        className="flex items-center justify-between px-6 py-6 cursor-pointer border-b"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <StatusDot
            status={section?.status_manual}
            onToggle={() => onUpdateStatus("poliza", section?._id)}
          />
          <h3 className="text-base  text-gray-900">
            Poliza de seguro de obra activa
          </h3>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <ResponsableSelector
            currentId={section?.responsable_id}
            users={users}
            onSelect={(userId) => onUpdateResponsable("poliza", userId, section?._id)}
          />
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-6 pt-6 grid grid-cols-3 gap-6 text-left">
          {/* Póliza de seguro */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500">Póliza de seguro</span>
            <DocumentAttachment
              nombre={section?.documento_nombre}
              uploadedAt={section?.documento_uploaded_at}
              url={section?.documento_url}
              onUpload={(f) => onUploadDocument("poliza", f, false)}
              onReplace={(f) => onUploadDocument("poliza", f, true)}
              uploading={uploading}
              parentType="autorizacion"
              parentId={section?._id ?? ""}
            />
          </div>

          {/* Suma asegurada */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500">Suma asegurada</span>
            <div className="flex items-center gap-2">
              <Input
                placeholder="$0.00"
                className="h-9 rounded-none"
                value={displaySuma}
                onFocus={() => setSumaInput(section?.suma_asegurada?.toString() || "")}
                onChange={(e) => setSumaInput(e.target.value)}
                onBlur={handleSumaBlur}
              />
              <span className="text-sm text-gray-500 shrink-0">MXN</span>
            </div>
          </div>

          {/* Vigencia */}
          <DatePickerField
            label="Vigencia"
            value={section?.vigencia}
            onChange={(v) => onUpdateFields("poliza", { vigencia: v }, section?._id)}
          />
        </div>
      )}
    </div>
  );
}

/** Trámites de conexión CFE y agua potable */
function TramitesSection({
  section,
  tramites,
  users,
  onUpdateStatus,
  onUpdateResponsable,
  onCreateTramite,
  onUpdateTramite,
  onDeleteTramite,
  onUploadTramiteDocument,
  uploadingTramiteId,
}: {
  section?: AutorizacionSection;
  tramites: TramiteItem[];
  users: { _id: Id<"users">; name: string; email: string }[];
  proyectoId: Id<"desarrollos">;
  onUpdateStatus: (seccion: SeccionType, sectionId?: Id<"autorizaciones_obra">) => void;
  onUpdateResponsable: (seccion: SeccionType, userId: Id<"users"> | undefined, sectionId?: Id<"autorizaciones_obra">) => void;
  onCreateTramite: () => void;
  onUpdateTramite: (id: Id<"autorizaciones_obra_tramites">, fields: Record<string, string>) => void;
  onDeleteTramite: (id: Id<"autorizaciones_obra_tramites">) => void;
  onUploadTramiteDocument: (tramiteId: Id<"autorizaciones_obra_tramites">, file: File) => void;
  uploadingTramiteId: string | null;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-sm bg-white">
      <div
        className="flex items-center justify-between px-6 py-6 border-b cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <StatusDot
            status={section?.status_manual}
            onToggle={() => onUpdateStatus("tramites", section?._id)}
          />
          <h3 className="text-base  text-gray-900">
            Trámites de conexión CFE y agua potable
          </h3>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <ResponsableSelector
            currentId={section?.responsable_id}
            users={users}
            onSelect={(userId) => onUpdateResponsable("tramites", userId, section?._id)}
          />
          <button
            className="flex items-center gap-1.5 text-sm text-[#777770] hover:text-gray-700 border border-gray-200 bg-[#DDDCD8] px-2 py-2 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onCreateTramite();
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-6 pt-6">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1.5fr_1fr_1.5fr_auto] gap-4 text-xs text-gray-500 font-medium pb-2 border-b border-gray-100">
            <span>Servicio</span>
            <span>Trámite</span>
            <span>Estado</span>
            <span className="text-right">Comprobante</span>
            <span className="w-8" />
          </div>

          {/* Rows */}
          {tramites.map((t) => (
            <TramiteRow
              key={t._id}
              tramite={t}
              onUpdate={(fields) => onUpdateTramite(t._id, fields)}
              onDelete={() => onDeleteTramite(t._id)}
              onUploadDocument={(file) => onUploadTramiteDocument(t._id, file)}
              uploading={uploadingTramiteId === t._id}
            />
          ))}

          {tramites.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-400">
              No hay trámites registrados
            </div>
          )}

          {/* Add button */}
          <button
            className="mt-3 w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 px-3 py-2 hover:border-gray-400 transition-colors"
            onClick={onCreateTramite}
          >
            <Plus className="w-4 h-4" />
            Agregar servicio
          </button>
        </div>
      )}
    </div>
  );
}

/** Single tramite row */
function TramiteRow({
  tramite,
  onUpdate,
  onDelete,
  onUploadDocument,
  uploading,
}: {
  tramite: TramiteItem;
  onUpdate: (fields: Record<string, string>) => void;
  onDelete: () => void;
  onUploadDocument: (file: File) => void;
  uploading: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editServicio, setEditServicio] = useState(tramite.servicio);
  const [editTramite, setEditTramite] = useState(tramite.tramite);

  return (
    <div className="grid grid-cols-[1fr_1.5fr_1fr_1.5fr_auto] gap-4 items-center py-3 border-b border-gray-50">
      {/* Servicio */}
      <div className="flex items-center gap-2">
        <StatusDot
          status={tramite.estado === "Activo" ? "activo" : undefined}
          onToggle={() =>
            onUpdate({ estado: tramite.estado === "Activo" ? "Pendiente" : "Activo" })
          }
        />
        <Input
          className="h-8 rounded-none border-transparent hover:border-gray-200 focus:border-gray-300 text-sm"
          value={editServicio}
          onChange={(e) => setEditServicio(e.target.value)}
          onBlur={() => {
            if (editServicio !== tramite.servicio) {
              onUpdate({ servicio: editServicio });
            }
          }}
          placeholder="Servicio"
        />
      </div>

      {/* Trámite */}
      <Input
        className="h-8 rounded-none border-transparent hover:border-gray-200 focus:border-gray-300 text-sm"
        value={editTramite}
        onChange={(e) => setEditTramite(e.target.value)}
        onBlur={() => {
          if (editTramite !== tramite.tramite) {
            onUpdate({ tramite: editTramite });
          }
        }}
        placeholder="Trámite"
      />

      {/* Estado */}
      <span
        className={cn(
          "text-sm",
          tramite.estado === "Activo" ? "text-gray-900" : "text-gray-500"
        )}
      >
        {tramite.estado}
      </span>

      {/* Comprobante */}
      <div className="text-right">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadDocument(f);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        {tramite.documento_nombre ? (
          <div className="flex items-center justify-end gap-2">
            <a
              href={tramite.documento_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-gray-800 hover:text-gray-600"
            >
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-medium truncate max-w-[160px]">{tramite.documento_nombre}</span>
            </a>
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Reemplazar"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
            </button>
          </div>
        ) : (
          <button
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 ml-auto"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Agregar documento
          </button>
        )}
        {tramite.documento_uploaded_at && (
          <div className="text-xs text-gray-400 mt-0.5">
            {formatFileDate(tramite.documento_uploaded_at)}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        className="text-gray-300 hover:text-red-500 p-1"
        onClick={onDelete}
        title="Eliminar trámite"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Plan de seguridad e higiene en obra */
function PlanSeguridadSection({
  section,
  users,
  onUpdateStatus,
  onUpdateResponsable,
  onUpdateFields,
  onUploadDocument,
  uploading,
}: {
  section?: AutorizacionSection;
  users: { _id: Id<"users">; name: string; email: string }[];
  onUpdateStatus: (seccion: SeccionType, sectionId?: Id<"autorizaciones_obra">) => void;
  onUpdateResponsable: (seccion: SeccionType, userId: Id<"users"> | undefined, sectionId?: Id<"autorizaciones_obra">) => void;
  onUpdateFields: (seccion: SeccionType, fields: Record<string, unknown>, sectionId?: Id<"autorizaciones_obra">) => void;
  onUploadDocument: (seccion: SeccionType, file: File, replace: boolean) => void;
  uploading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-sm bg-white">
      <div
        className="flex items-center justify-between px-6 py-6 border-b cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <StatusDot
            status={section?.status_manual}
            onToggle={() => onUpdateStatus("plan_seguridad", section?._id)}
          />
          <h3 className="text-base  text-gray-900">
            Plan de seguridad e higiene en obra
          </h3>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <ResponsableSelector
            currentId={section?.responsable_id}
            users={users}
            onSelect={(userId) => onUpdateResponsable("plan_seguridad", userId, section?._id)}
          />
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-6 pt-6 grid grid-cols-3 gap-6 text-left">
          {/* Plan de seguridad */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500">Plan de seguridad</span>
            <DocumentAttachment
              nombre={section?.documento_nombre}
              uploadedAt={section?.documento_uploaded_at}
              url={section?.documento_url}
              onUpload={(f) => onUploadDocument("plan_seguridad", f, false)}
              onReplace={(f) => onUploadDocument("plan_seguridad", f, true)}
              uploading={uploading}
              parentType="autorizacion"
              parentId={section?._id ?? ""}
            />
          </div>

          {/* Fecha de emisión */}
          <DatePickerField
            label="Fecha de emisión"
            value={section?.fecha_emision}
            onChange={(v) => onUpdateFields("plan_seguridad", { fecha_emision: v }, section?._id)}
          />

          {/* Fecha de Vencimiento */}
          <DatePickerField
            label="Fecha de Vencimiento"
            value={section?.fecha_vencimiento}
            onChange={(v) => onUpdateFields("plan_seguridad", { fecha_vencimiento: v }, section?._id)}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Tab Component
// ============================================================

export default function PermisosYLegalTab({ proyectoId }: { proyectoId: string }) {
  const { user } = useUser();

  // Queries
  const secciones = useQuery(
    api.autorizaciones_obra.getByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const allTramites = useQuery(
    api.autorizaciones_obra.getTramitesByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const allUsers = useQuery(api.autorizaciones_obra.getAllUsers);

  // Mutations
  const ensureSeccion = useMutation(api.autorizaciones_obra.ensureSeccion);
  const updateStatus = useMutation(api.autorizaciones_obra.updateStatus);
  const updateResponsable = useMutation(api.autorizaciones_obra.updateResponsable);
  const updateFields = useMutation(api.autorizaciones_obra.updateSeccionFields);
  const attachDocument = useMutation(api.autorizaciones_obra.attachDocument);
  const generateUploadUrl = useMutation(api.autorizaciones_obra.generateUploadUrl);
  const createTramite = useMutation(api.autorizaciones_obra.createTramite);
  const updateTramite = useMutation(api.autorizaciones_obra.updateTramite);
  const deleteTramite = useMutation(api.autorizaciones_obra.deleteTramite);
  const attachTramiteDoc = useMutation(api.autorizaciones_obra.attachTramiteDocument);

  // Upload state
  const [uploadingSection, setUploadingSection] = useState<string | null>(null);
  const [uploadingTramiteId, setUploadingTramiteId] = useState<string | null>(null);

  // Section lookup
  const sectionMap = useMemo(() => {
    const map: Record<string, AutorizacionSection> = {};
    secciones?.forEach((s) => {
      map[s.seccion] = s as AutorizacionSection;
    });
    return map;
  }, [secciones]);

  // Tramites filtered to the tramites section
  const tramitesSection = sectionMap["tramites"];
  const tramitesList = useMemo(() => {
    if (!allTramites || !tramitesSection) return [];
    return allTramites.filter(
      (t) => t.autorizacion_id === tramitesSection._id
    ) as TramiteItem[];
  }, [allTramites, tramitesSection]);

  // ============================================================
  // Handlers
  // ============================================================

  const ensureSectionExists = useCallback(
    async (seccion: SeccionType): Promise<Id<"autorizaciones_obra">> => {
      if (sectionMap[seccion]) return sectionMap[seccion]._id;
      return await ensureSeccion({
        proyecto: proyectoId as Id<"desarrollos">,
        seccion,
      });
    },
    [sectionMap, ensureSeccion, proyectoId]
  );

  const handleUpdateStatus = useCallback(
    async (seccion: SeccionType, sectionId?: Id<"autorizaciones_obra">) => {
      try {
        const id = sectionId || (await ensureSectionExists(seccion));
        const current = sectionMap[seccion]?.status_manual;
        const newStatus = current === "activo" ? "inactivo" : "activo";
        await updateStatus({ id, status_manual: newStatus });
      } catch (err) {
        console.error("Error updating status:", err);
        toast.error("Error al actualizar estado");
      }
    },
    [ensureSectionExists, sectionMap, updateStatus]
  );

  const handleUpdateResponsable = useCallback(
    async (
      seccion: SeccionType,
      userId: Id<"users"> | undefined,
      sectionId?: Id<"autorizaciones_obra">
    ) => {
      try {
        const id = sectionId || (await ensureSectionExists(seccion));
        await updateResponsable({ id, responsable_id: userId });
      } catch (err) {
        console.error("Error updating responsable:", err);
        toast.error("Error al asignar responsable");
      }
    },
    [ensureSectionExists, updateResponsable]
  );

  const handleUpdateFields = useCallback(
    async (
      seccion: SeccionType,
      fields: Record<string, unknown>,
      sectionId?: Id<"autorizaciones_obra">
    ) => {
      try {
        const id = sectionId || (await ensureSectionExists(seccion));
        await updateFields({
          id,
          numero_licencia: fields.numero_licencia as string | undefined,
          fecha_emision: fields.fecha_emision as string | undefined,
          fecha_vencimiento: fields.fecha_vencimiento as string | undefined,
          suma_asegurada: fields.suma_asegurada as number | undefined,
          vigencia: fields.vigencia as string | undefined,
        });
      } catch (err) {
        console.error("Error updating fields:", err);
        toast.error("Error al actualizar campo");
      }
    },
    [ensureSectionExists, updateFields]
  );

  const handleUploadDocument = useCallback(
    async (seccion: SeccionType, file: File) => {
      if (!proyectoId) return;
      setUploadingSection(seccion);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) throw new Error("Failed to upload file");
        const { storageId } = await result.json();

        await attachDocument({
          proyecto: proyectoId as Id<"desarrollos">,
          seccion,
          storage_id: storageId,
          nombre: file.name,
          size: file.size,
          type: file.type,
          clerk_id: user?.id,
        });
        toast.success("Documento adjuntado");
      } catch (err) {
        console.error("Error uploading document:", err);
        toast.error("Error al subir documento");
      } finally {
        setUploadingSection(null);
      }
    },
    [proyectoId, generateUploadUrl, attachDocument, user]
  );

  const handleCreateTramite = useCallback(async () => {
    if (!proyectoId) return;
    try {
      const sectionId = await ensureSectionExists("tramites");
      await createTramite({
        proyecto: proyectoId as Id<"desarrollos">,
        autorizacion_id: sectionId,
        servicio: "",
        tramite: "",
        estado: "Pendiente",
      });
    } catch (err) {
      console.error("Error creating tramite:", err);
      toast.error("Error al crear trámite");
    }
  }, [proyectoId, ensureSectionExists, createTramite]);

  const handleUpdateTramite = useCallback(
    async (id: Id<"autorizaciones_obra_tramites">, fields: Record<string, string>) => {
      try {
        await updateTramite({ id, ...fields });
      } catch (err) {
        console.error("Error updating tramite:", err);
        toast.error("Error al actualizar trámite");
      }
    },
    [updateTramite]
  );

  const handleDeleteTramite = useCallback(
    async (id: Id<"autorizaciones_obra_tramites">) => {
      try {
        await deleteTramite({ id });
        toast.success("Trámite eliminado");
      } catch (err) {
        console.error("Error deleting tramite:", err);
        toast.error("Error al eliminar trámite");
      }
    },
    [deleteTramite]
  );

  const handleUploadTramiteDocument = useCallback(
    async (tramiteId: Id<"autorizaciones_obra_tramites">, file: File) => {
      setUploadingTramiteId(tramiteId);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) throw new Error("Failed to upload file");
        const { storageId } = await result.json();

        await attachTramiteDoc({
          tramite_id: tramiteId,
          storage_id: storageId,
          nombre: file.name,
          size: file.size,
          type: file.type,
          clerk_id: user?.id,
        });
        toast.success("Documento adjuntado");
      } catch (err) {
        console.error("Error uploading tramite document:", err);
        toast.error("Error al subir documento");
      } finally {
        setUploadingTramiteId(null);
      }
    },
    [generateUploadUrl, attachTramiteDoc, user]
  );

  const users = allUsers || [];

  return (
    <div>
      <div className="pt-6">
        <div className="flex flex-col text-left border-[#d2d1ce]">
          <p className="text-base">
            Autorizaciones municipales, estatales y obligaciones legales de la obra
          </p>          
        </div>
      </div>

      {/* Sections */}
      <div className="py-2 space-y-6">
        <LicenciaSection
          section={sectionMap["licencia"]}
          users={users}
          onUpdateStatus={handleUpdateStatus}
          onUpdateResponsable={handleUpdateResponsable}
          onUpdateFields={handleUpdateFields}
          onUploadDocument={handleUploadDocument}
          uploading={uploadingSection === "licencia"}
        />

        <PolizaSection
          section={sectionMap["poliza"]}
          users={users}
          onUpdateStatus={handleUpdateStatus}
          onUpdateResponsable={handleUpdateResponsable}
          onUpdateFields={handleUpdateFields}
          onUploadDocument={handleUploadDocument}
          uploading={uploadingSection === "poliza"}
        />

        <TramitesSection
          section={tramitesSection}
          tramites={tramitesList}
          users={users}
          proyectoId={proyectoId as Id<"desarrollos">}
          onUpdateStatus={handleUpdateStatus}
          onUpdateResponsable={handleUpdateResponsable}
          onCreateTramite={handleCreateTramite}
          onUpdateTramite={handleUpdateTramite}
          onDeleteTramite={handleDeleteTramite}
          onUploadTramiteDocument={handleUploadTramiteDocument}
          uploadingTramiteId={uploadingTramiteId}
        />

        <PlanSeguridadSection
          section={sectionMap["plan_seguridad"]}
          users={users}
          onUpdateStatus={handleUpdateStatus}
          onUpdateResponsable={handleUpdateResponsable}
          onUpdateFields={handleUpdateFields}
          onUploadDocument={handleUploadDocument}
          uploading={uploadingSection === "plan_seguridad"}
        />
      </div>
    </div>
  );
}
