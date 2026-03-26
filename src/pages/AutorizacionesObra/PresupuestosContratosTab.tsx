import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Download,
  Trash2,
  RefreshCw,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { StatusDot, ResponsableSelector } from "./PermisosYLegalTab";

// ============================================================
// Types
// ============================================================

interface SubcontratistaRow {
  _id: Id<"subcontratistas">;
  proyecto: Id<"desarrollos">;
  nombre: string;
  partida_id?: Id<"partidas">;
  partida_nombre?: string;
  monto?: number;
  status_manual?: string;
  presupuesto_storage_id?: Id<"_storage">;
  presupuesto_nombre?: string;
  presupuesto_uploaded_at?: number;
  presupuesto_url?: string | null;
  contrato_storage_id?: Id<"_storage">;
  contrato_nombre?: string;
  contrato_uploaded_at?: number;
  contrato_url?: string | null;
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

/** File cell for presupuesto or contrato columns — with replace & history */
function FileCell({
  nombre,
  uploadedAt,
  url,
  onUpload,
  uploading,
  placeholder,
  parentType,
  parentId,
}: {
  nombre?: string;
  uploadedAt?: number;
  url?: string | null;
  onUpload: (file: File) => void;
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
              <span className="font-medium truncate max-w-[150px]">{nombre}</span>
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
          </div>
          {uploadedAt && (
            <span className="text-xs text-[#C5C5C3] mt-0.5 ml-5.5">
              {formatFileDate(uploadedAt)}
            </span>
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
          className="text-sm text-gray-400 hover:text-gray-600 "
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

/** Row action menu (three dots) — using DropdownMenu */
function RowActionMenu({
  sub,
  onDelete,
}: {
  sub: SubcontratistaRow;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="text-gray-400 hover:text-gray-600 p-1">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="end">
        {sub.presupuesto_url && (
          <DropdownMenuItem asChild>
            <a
              href={sub.presupuesto_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar presupuesto
            </a>
          </DropdownMenuItem>
        )}
        {sub.contrato_url && (
          <DropdownMenuItem asChild>
            <a
              href={sub.contrato_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar contrato
            </a>
          </DropdownMenuItem>
        )}
        {(sub.presupuesto_url || sub.contrato_url) && <DropdownMenuSeparator />}
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Eliminar subcontratista
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single subcontratista row */
function SubcontratistaTableRow({
  sub,
  partidas,
  onUpdate,
  onDelete,
  onUploadPresupuesto,
  onUploadContrato,
  uploadingField,
}: {
  sub: SubcontratistaRow;
  partidas: PartidaNivel1[];
  onUpdate: (fields: Record<string, unknown>) => void;
  onDelete: () => void;
  onUploadPresupuesto: (file: File) => void;
  onUploadContrato: (file: File) => void;
  uploadingField: "presupuesto" | "contrato" | null;
}) {
  const [editNombre, setEditNombre] = useState(sub.nombre);
  const [editMonto, setEditMonto] = useState("");

  return (
    <div className="grid grid-cols-[auto_1.2fr_0.8fr_1.2fr_1.2fr_1fr_auto] gap-4 items-center p-4 bg-[#FBFBFB] border border-[#E6E6E6] mb-2 rounded-sm">
      {/* Status dot */}
      <StatusDot
        status={sub.status_manual}
        onToggle={() =>
          onUpdate({
            status_manual: sub.status_manual === "activo" ? "inactivo" : "activo",
          })
        }
      />

      {/* Subcontratista name */}
      <Input
        className="h-8 rounded-none border-transparent hover:border-gray-300 focus:border-gray-400 focus:ring-1 focus:ring-gray-300 text-sm transition-colors shadow-none"
        value={editNombre}
        onChange={(e) => setEditNombre(e.target.value)}
        onBlur={() => {
          if (editNombre !== sub.nombre && editNombre.trim()) {
            onUpdate({ nombre: editNombre.trim() });
          }
        }}
        placeholder="Nombre del subcontratista"
      />

      {/* Partida selector */}
      <Select
        value={sub.partida_id || ""}
        onValueChange={(val) => {
          const selected = partidas.find((p) => p._id === val);
          if (selected) {
            onUpdate({ partida_id: selected._id, partida_nombre: selected.nombre });
          }
        }}
      >
        <SelectTrigger className="h-8 rounded-none border-transparent hover:border-gray-300 focus:border-gray-400 focus:ring-1 focus:ring-gray-300 text-sm transition-colors">
          <SelectValue placeholder="Partida">
            {sub.partida_nombre || "Partida"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {partidas.map((p) => (
            <SelectItem key={p._id} value={p._id}>
              {p.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Presupuesto file */}
      <FileCell
        nombre={sub.presupuesto_nombre}
        uploadedAt={sub.presupuesto_uploaded_at}
        url={sub.presupuesto_url}
        onUpload={onUploadPresupuesto}
        uploading={uploadingField === "presupuesto"}
        parentType="subcontratista_presupuesto"
        parentId={sub._id}
      />

      {/* Contrato file */}
      <FileCell
        nombre={sub.contrato_nombre}
        uploadedAt={sub.contrato_uploaded_at}
        url={sub.contrato_url}
        onUpload={onUploadContrato}
        uploading={uploadingField === "contrato"}
        parentType="subcontratista_contrato"
        parentId={sub._id}
      />

      {/* Monto */}
      <Input
        className="h-8 rounded-none border-transparent hover:border-gray-300 focus:border-gray-400 focus:ring-1 focus:ring-gray-300 text-sm text-right transition-colors shadown-none"
        value={editMonto || (sub.monto ? formatCurrencyMXN(sub.monto) : "")}
        onFocus={() => setEditMonto(sub.monto?.toString() || "")}
        onChange={(e) => setEditMonto(e.target.value)}
        onBlur={() => {
          const num = parseFloat(editMonto.replace(/[^0-9.]/g, ""));
          if (!isNaN(num) && num !== sub.monto) {
            onUpdate({ monto: num });
          }
          setEditMonto("");
        }}
        placeholder="$0.00"
      />

      {/* Actions menu */}
      <RowActionMenu sub={sub} onDelete={onDelete} />
    </div>
  );
}

// ============================================================
// Main Tab Component
// ============================================================

export default function PresupuestosContratosTab({ proyectoId }: { proyectoId: string }) {
  const { user } = useUser();
  const [expanded, setExpanded] = useState(true);
  const [uploadingSubId, setUploadingSubId] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<"presupuesto" | "contrato" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Queries
  const subcontratistas = useQuery(
    api.subcontratistas.getByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const allUsers = useQuery(api.autorizaciones_obra.getAllUsers);
  const allPartidas = useQuery(
    api.partida.getByNivel,
    proyectoId ? { proyecto: proyectoId as Id<"desarrollos">, nivel: 1 } : "skip"
  );

  // Section header from autorizaciones_obra
  const secciones = useQuery(
    api.autorizaciones_obra.getByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const sectionHeader = useMemo(() => {
    return secciones?.find((s) => s.seccion === "contratos_subcontratistas");
  }, [secciones]);

  // Mutations
  const createSub = useMutation(api.subcontratistas.createSubcontratista);
  const updateSub = useMutation(api.subcontratistas.updateSubcontratista);
  const deleteSub = useMutation(api.subcontratistas.deleteSubcontratista);
  const attachPresupuesto = useMutation(api.subcontratistas.attachPresupuesto);
  const attachContrato = useMutation(api.subcontratistas.attachContrato);
  const generateUploadUrl = useMutation(api.subcontratistas.generateUploadUrl);
  const ensureSeccion = useMutation(api.autorizaciones_obra.ensureSeccion);
  const updateStatus = useMutation(api.autorizaciones_obra.updateStatus);
  const updateResponsable = useMutation(api.autorizaciones_obra.updateResponsable);

  // Derived data
  const subs = (subcontratistas || []) as SubcontratistaRow[];
  const users = allUsers || [];
  const partidas: PartidaNivel1[] = useMemo(() => {
    if (!allPartidas) return [];
    // Deduplicate by nombre (nivel 1 can have dups)
    const seen = new Set<string>();
    return allPartidas
      .filter((p) => {
        if (seen.has(p.nombre)) return false;
        seen.add(p.nombre);
        return true;
      })
      .map((p) => ({ _id: p._id, nombre: p.nombre }));
  }, [allPartidas]);

  // Progress bar calculations
  const totalSubs = subs.length;
  const assignedSubs = subs.filter((s) => s.status_manual === "activo").length;
  const pendingContratos = subs.filter(
    (s) => s.presupuesto_storage_id && !s.contrato_storage_id
  ).length;
  const progressPercent = totalSubs > 0 ? (assignedSubs / totalSubs) * 100 : 0;

  // ============================================================
  // Handlers
  // ============================================================

  const ensureSectionHeader = useCallback(async () => {
    if (sectionHeader) return sectionHeader._id;
    return await ensureSeccion({
      proyecto: proyectoId as Id<"desarrollos">,
      seccion: "contratos_subcontratistas",
    });
  }, [sectionHeader, ensureSeccion, proyectoId]);

  const handleToggleSectionStatus = useCallback(async () => {
    try {
      const id = await ensureSectionHeader();
      const current = sectionHeader?.status_manual;
      await updateStatus({
        id,
        status_manual: current === "activo" ? "inactivo" : "activo",
      });
    } catch (err) {
      console.error("Error updating section status:", err);
      toast.error("Error al actualizar estado");
    }
  }, [ensureSectionHeader, sectionHeader, updateStatus]);

  const handleUpdateSectionResponsable = useCallback(
    async (userId: Id<"users"> | undefined) => {
      try {
        const id = await ensureSectionHeader();
        await updateResponsable({ id, responsable_id: userId });
      } catch (err) {
        console.error("Error updating responsable:", err);
        toast.error("Error al asignar responsable");
      }
    },
    [ensureSectionHeader, updateResponsable]
  );

  const handleCreateSubcontratista = useCallback(async () => {
    if (!proyectoId) return;
    try {
      await createSub({
        proyecto: proyectoId as Id<"desarrollos">,
        nombre: "",
      });
    } catch (err) {
      console.error("Error creating subcontratista:", err);
      toast.error("Error al crear subcontratista");
    }
  }, [proyectoId, createSub]);

  const handleUpdateSubcontratista = useCallback(
    async (id: Id<"subcontratistas">, fields: Record<string, unknown>) => {
      try {
        await updateSub({
          id,
          nombre: fields.nombre as string | undefined,
          partida_id: fields.partida_id as Id<"partidas"> | undefined,
          partida_nombre: fields.partida_nombre as string | undefined,
          monto: fields.monto as number | undefined,
          status_manual: fields.status_manual as string | undefined,
        });
      } catch (err) {
        console.error("Error updating subcontratista:", err);
        toast.error("Error al actualizar subcontratista");
      }
    },
    [updateSub]
  );

  const handleDeleteSubcontratista = useCallback(
    async (id: Id<"subcontratistas">) => {
      try {
        await deleteSub({ id });
        toast.success("Subcontratista eliminado");
        setConfirmDeleteId(null);
      } catch (err) {
        console.error("Error deleting subcontratista:", err);
        toast.error("Error al eliminar subcontratista");
      }
    },
    [deleteSub]
  );

  const handleUploadFile = useCallback(
    async (
      subId: Id<"subcontratistas">,
      file: File,
      field: "presupuesto" | "contrato"
    ) => {
      setUploadingSubId(subId);
      setUploadingField(field);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) throw new Error("Failed to upload file");
        const { storageId } = await result.json();

        if (field === "presupuesto") {
          await attachPresupuesto({
            id: subId,
            storage_id: storageId,
            nombre: file.name,
            size: file.size,
            type: file.type,
            clerk_id: user?.id,
          });
        } else {
          await attachContrato({
            id: subId,
            storage_id: storageId,
            nombre: file.name,
            size: file.size,
            type: file.type,
            clerk_id: user?.id,
          });
        }
        toast.success("Documento adjuntado");
      } catch (err) {
        console.error("Error uploading file:", err);
        toast.error("Error al subir documento");
      } finally {
        setUploadingSubId(null);
        setUploadingField(null);
      }
    },
    [generateUploadUrl, attachPresupuesto, attachContrato, user]
  );

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="text-[#282822] font-light">
      <div className="pt-6">
        <div className="flex flex-col text-left border-[#d2d1ce]">
          <p className="text-base">
            Control financiero y formalización con proveedores y subcontratistas
          </p>
        </div>
      </div>

      <div className="py-2 space-y-6">
        {/* Section: Contratos firmados con subcontratistas principales */}
        <div className="border border-gray-200 rounded-sm bg-white">
          {/* Section Header */}
          <div className="px-6">
            <div
              className="flex items-center justify-between  py-6 cursor-pointer"
              onClick={() => setExpanded(!expanded)}
            >
              <div className="flex items-center gap-3">
                <StatusDot
                  status={sectionHeader?.status_manual}
                  onToggle={handleToggleSectionStatus}
                />
                <h3 className="text-base text-gray-900">
                  Contratos firmados con subcontratistas principales
                </h3>
              </div>
              <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <ResponsableSelector
                  currentId={sectionHeader?.responsable_id}
                  users={users}
                  onSelect={handleUpdateSectionResponsable}
                />
                <button
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-2 py-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateSubcontratista();
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
                  {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {/* Progress bar */}
            {totalSubs > 0 && (
              <div className="mb-6 px-6">
                <div className="w-full h-2 bg-[#C9EEDA]  overflow-hidden">
                  <div
                    className="h-full bg-[#4CC684]  transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span className="text-[#ABABA9]">
                    {assignedSubs} de {totalSubs} contratistas asignados
                  </span>
                  {pendingContratos > 0 && (
                    <span>
                      {pendingContratos} contrato{pendingContratos > 1 ? "s" : ""} por firmar
                    </span>
                  )}
                </div>
              </div>
            )}

          </div>


          {expanded && (
            <div className="px-12 pb-6 pt-4 border-t">


              {/* Table header */}
              <div className="grid grid-cols-[auto_1.2fr_0.8fr_1.2fr_1.2fr_1fr_auto] gap-4 text-xs text-[#777770]  pb-2 border-b border-gray-200 text-left">
                <span className="w-14" />
                <span>Subcontratista</span>
                <span>Partida</span>
                <span>Presupuesto</span>
                <span>Contrato</span>
                <span className="text-right">Monto</span>
                <span className="w-8" />
              </div>

              {/* Rows */}
              {subs.map((sub) => (
                <div key={sub._id}>
                  <SubcontratistaTableRow
                    sub={sub}
                    partidas={partidas}
                    onUpdate={(fields) =>
                      handleUpdateSubcontratista(sub._id, fields)
                    }
                    onDelete={() => setConfirmDeleteId(sub._id)}
                    onUploadPresupuesto={(file) =>
                      handleUploadFile(sub._id, file, "presupuesto")
                    }
                    onUploadContrato={(file) =>
                      handleUploadFile(sub._id, file, "contrato")
                    }
                    uploadingField={
                      uploadingSubId === sub._id ? uploadingField : null
                    }
                  />
                  {/* Delete confirmation */}
                  {confirmDeleteId === sub._id && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-red-50 border border-red-100 text-sm">
                      <span className="text-red-700">
                        ¿Eliminar a {sub.nombre || "este subcontratista"}?
                      </span>
                      <button
                        className="text-red-600 font-medium hover:text-red-800"
                        onClick={() => handleDeleteSubcontratista(sub._id)}
                      >
                        Confirmar
                      </button>
                      <button
                        className="text-gray-500 hover:text-gray-700"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {subs.length === 0 && (
                <div className="py-6 text-center text-sm text-gray-400">
                  No hay subcontratistas registrados
                </div>
              )}

              {/* Add button */}
              <button
                className="mt-3 w-full flex items-start justify-start gap-2 text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 px-3 py-3 hover:border-gray-400 transition-colors"
                onClick={handleCreateSubcontratista}
              >
                <Plus className="w-4 h-4" />
                Agregar Subcontratista
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
