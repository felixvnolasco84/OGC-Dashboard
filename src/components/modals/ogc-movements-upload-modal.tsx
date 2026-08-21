import { useId, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Copy, FileSpreadsheet, FileText, Image, Loader2, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

type OgcMovementType = "ingreso" | "costo_estructura";
type ExchangeRateMode = "pnl" | "manual";
type DeliveryNoteStatus = "none" | "parcial" | "completa";
type UploadedDeliveryNoteStatus = Exclude<DeliveryNoteStatus, "none">;
type DeliveryNoteFile = {
  id: string;
  file: File;
};

type DeliveryNoteDocument = {
  storage_id: Id<"_storage">;
  nombre: string;
  type: string;
  size: number;
  uploaded_at: number;
};

type DesarrolloOption = {
  _id: Id<"desarrollos">;
  nombre: string;
};

type OgcUploadMovement = {
  rowIndex: number;
  tipo: OgcMovementType;
  categoria: string;
  monto: number;
  fecha: string;
  proyecto_nombre?: string;
  descripcion?: string;
  moneda: string;
  tipo_cambio?: number;
  nota_recepcion_status?: UploadedDeliveryNoteStatus;
  nota_recepcion_storage_id?: Id<"_storage">;
  nota_recepcion_nombre?: string;
  nota_recepcion_type?: string;
  nota_recepcion_size?: number;
  nota_recepcion_uploaded_at?: number;
  nota_recepcion_documentos?: DeliveryNoteDocument[];
};

type OgcUploadResult = {
  success: boolean;
  message?: string;
  fileName?: string;
  summary?: {
    totalRows: number;
    validRows: number;
    errors: number;
    totalAmount: number;
    ingresos: number;
    costosEstructura: number;
  };
  movimientos?: OgcUploadMovement[];
  errors?: Array<{ row: number; error: string }>;
};

type PreparedMovement = {
  tipo: OgcMovementType;
  categoria: string;
  monto: number;
  fecha: string;
  descripcion?: string;
  moneda: string;
  tipo_cambio?: number;
  proyecto?: Id<"desarrollos">;
  archivo_origen?: string;
  fila_origen?: number;
  nota_recepcion_status?: UploadedDeliveryNoteStatus;
  nota_recepcion_storage_id?: Id<"_storage">;
  nota_recepcion_nombre?: string;
  nota_recepcion_type?: string;
  nota_recepcion_size?: number;
  nota_recepcion_uploaded_at?: number;
  nota_recepcion_documentos?: DeliveryNoteDocument[];
};

type ValidationReport = {
  valid: PreparedMovement[];
  errors: Array<{ row: number; message: string }>;
  missingProjects: string[];
  totalAmount: number;
  ingresos: number;
  costosEstructura: number;
};

type EditableMovementRow = {
  id: string;
  tipo: OgcMovementType;
  categoria: string;
  monto: string;
  fecha: string;
  proyecto: Id<"desarrollos"> | "empresa";
  descripcion: string;
  moneda: string;
  tipo_cambio_mode: ExchangeRateMode;
  tipo_cambio: string;
  nota_recepcion_status: DeliveryNoteStatus;
  nota_recepcion_files: DeliveryNoteFile[];
};

type ExchangeRateSettings = {
  USD: number;
  EUR: number;
};

type UploadedDeliveryNote = {
  status: UploadedDeliveryNoteStatus;
  documentos: DeliveryNoteDocument[];
};

const OGC_UPLOAD_ENDPOINTS = [
  "https://ogc-excel-reader.vercel.app/upload/ogc-transactions",
  "http://localhost:3000/upload/ogc-transactions",
];
const MAX_DELIVERY_NOTE_FILE_SIZE = 20 * 1024 * 1024;
const MAX_DELIVERY_NOTE_FILES_PER_ROW = 8;
const DELIVERY_NOTE_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp", ".tif", ".tiff"];
const DELIVERY_NOTE_ACCEPT = [
  "image/*",
  "application/pdf",
  ".pdf",
  ...DELIVERY_NOTE_IMAGE_EXTENSIONS,
].join(",");

const CATEGORIES = [
  "HONORARIOS",
  "INDIRECTOS",
  "NOMINA",
  "CARGAS SOCIALES ADMN (IMSS, ISN, INFONAVIT)",
  "TRANSPORTE",
  "RENTA",
  "OTROS",
  "DISP HONORARIOS",
];

const normalizeLookupText = (value?: string) => {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
};

const normalizeTipo = (value?: string, fallback: OgcMovementType = "costo_estructura"): OgcMovementType => {
  const normalized = normalizeLookupText(value);
  if (normalized.includes("ingreso") || normalized.includes("cobro")) return "ingreso";
  if (normalized.includes("costo") || normalized.includes("gasto") || normalized.includes("egreso")) return "costo_estructura";
  return fallback;
};

const normalizeDate = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${day}/${month}/${year}`;
  }

  return raw;
};

const isValidDate = (value: string) => {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

const parseAmount = (value?: string | number) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value || "")
    .trim()
    .replace(/\s|\u00a0/g, "")
    .replace(/[$%]/g, "");

  const isParenthesizedNegative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[()]/g, "").replace(/[^0-9.,-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupSeparator = decimalSeparator === "," ? "." : ",";
    normalized = cleaned.replace(new RegExp(`\\${groupSeparator}`, "g"), "").replace(decimalSeparator, ".");
  } else if (lastComma !== -1) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\.(?=.*\.)/g, "");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return isParenthesizedNegative ? -Math.abs(parsed) : parsed;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const createMovementRow = (overrides: Partial<EditableMovementRow> = {}): EditableMovementRow => ({
  id: crypto.randomUUID(),
  tipo: "costo_estructura",
  categoria: "OTROS",
  monto: "",
  fecha: new Date().toISOString().slice(0, 10),
  proyecto: "empresa",
  descripcion: "",
  moneda: "MXN",
  tipo_cambio_mode: "pnl",
  tipo_cambio: "",
  nota_recepcion_status: "none",
  nota_recepcion_files: [],
  ...overrides,
});

const rowHasUserInput = (row: EditableMovementRow) => {
  return Boolean(
    row.monto.trim() ||
    row.descripcion.trim() ||
    row.proyecto !== "empresa" ||
    row.tipo !== "costo_estructura" ||
    row.categoria !== "OTROS"
  );
};

const isAcceptedDeliveryNoteFile = (file: File) => {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    lowerName.endsWith(".pdf") ||
    DELIVERY_NOTE_IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  );
};

const isDeliveryNoteImageFile = (file: File) => {
  const lowerName = file.name.toLowerCase();
  return file.type.startsWith("image/") || DELIVERY_NOTE_IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
};

const getDeliveryNoteFileKey = (file: File) => {
  return `${file.name.toLowerCase()}-${file.size}-${file.lastModified}`;
};

export function OgcMovementsUploadModal({
  open,
  onOpenChange,
  exchangeRates = { USD: 17, EUR: 18.5 },
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exchangeRates?: ExchangeRateSettings;
}) {
  const fileInputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [manualRows, setManualRows] = useState<EditableMovementRow[]>(() => [createMovementRow()]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OgcUploadResult | null>(null);
  const proyectos = useQuery(api.desarrollos.getAll) as DesarrolloOption[] | undefined;
  const generateOgcUploadUrl = useMutation(api.ogc_movimientos.generateUploadUrl);
  const validateBulkCreateMovements = useMutation(api.ogc_movimientos.validateBulkCreate);
  const bulkCreateMovements = useMutation(api.ogc_movimientos.bulkCreate);

  const projectLookup = useMemo(() => {
    const lookup = new Map<string, Id<"desarrollos">>();
    proyectos?.forEach((proyecto) => {
      lookup.set(normalizeLookupText(proyecto.nombre), proyecto._id);
    });
    return lookup;
  }, [proyectos]);

  const projectNameById = useMemo(() => {
    const lookup = new Map<string, string>();
    proyectos?.forEach((proyecto) => {
      lookup.set(proyecto._id, proyecto.nombre);
    });
    return lookup;
  }, [proyectos]);

  const resetState = () => {
    setFile(null);
    setManualRows([createMovementRow()]);
    setResult(null);
  };

  const getConfiguredExchangeRate = (currency?: string) => {
    const normalizedCurrency = (currency || "MXN").toUpperCase();
    if (normalizedCurrency === "USD") return Number.isFinite(exchangeRates.USD) && exchangeRates.USD > 0 ? exchangeRates.USD : 0;
    if (normalizedCurrency === "EUR") return Number.isFinite(exchangeRates.EUR) && exchangeRates.EUR > 0 ? exchangeRates.EUR : 0;
    return 0;
  };

  const handleClose = (nextOpen: boolean) => {
    if (isProcessing) return;
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const validateMovements = (movements: OgcUploadMovement[], sourceName?: string): ValidationReport => {
    const errors: ValidationReport["errors"] = [];
    const missingProjects = new Set<string>();
    const valid: PreparedMovement[] = [];

    movements.forEach((movement) => {
      const rowErrors: string[] = [];
      const monto = Math.abs(safeAmount(movement.monto));
      const fecha = normalizeDate(movement.fecha);
      const moneda = (movement.moneda || "MXN").toUpperCase();
      const tipoCambio = safeAmount(movement.tipo_cambio || getConfiguredExchangeRate(moneda));
      const projectName = normalizeLookupText(movement.proyecto_nombre);
      const proyecto = projectName ? projectLookup.get(projectName) : undefined;

      if (monto <= 0) rowErrors.push("Monto invalido");
      if (!isValidDate(fecha)) rowErrors.push("Fecha invalida");
      if (moneda !== "MXN" && tipoCambio <= 0) rowErrors.push("Tipo de cambio requerido");
      if (projectName && !proyecto) {
        missingProjects.add(movement.proyecto_nombre || "Sin nombre");
        rowErrors.push("Obra no encontrada");
      }

      if (rowErrors.length > 0) {
        errors.push({ row: movement.rowIndex, message: rowErrors.join(", ") });
        return;
      }

      valid.push({
        tipo: normalizeTipo(movement.tipo),
        categoria: movement.categoria || "OTROS",
        monto,
        fecha,
        descripcion: movement.descripcion || undefined,
        moneda,
        tipo_cambio: moneda === "MXN" ? undefined : tipoCambio,
        proyecto,
        archivo_origen: sourceName,
        fila_origen: movement.rowIndex,
        nota_recepcion_status: movement.nota_recepcion_status,
        nota_recepcion_storage_id: movement.nota_recepcion_storage_id,
        nota_recepcion_nombre: movement.nota_recepcion_nombre,
        nota_recepcion_type: movement.nota_recepcion_type,
        nota_recepcion_size: movement.nota_recepcion_size,
        nota_recepcion_uploaded_at: movement.nota_recepcion_uploaded_at,
        nota_recepcion_documentos: movement.nota_recepcion_documentos,
      });
    });

    return {
      valid,
      errors,
      missingProjects: Array.from(missingProjects),
      totalAmount: valid.reduce((sum, movement) => sum + movement.monto, 0),
      ingresos: valid.filter((movement) => movement.tipo === "ingreso").length,
      costosEstructura: valid.filter((movement) => movement.tipo === "costo_estructura").length,
    };
  };

  const safeAmount = (value: number) => {
    return Number.isFinite(value) ? value : 0;
  };

  const rowsToMovements = (
    rows: EditableMovementRow[],
    uploadedNotes = new Map<string, UploadedDeliveryNote>()
  ): OgcUploadMovement[] => {
    return rows.flatMap((row, index) => {
      if (!rowHasUserInput(row)) return [];

      const uploadedNote = uploadedNotes.get(row.id);
      const primaryDocument = uploadedNote?.documentos[0];

      return [{
        rowIndex: index + 1,
        tipo: row.tipo,
        categoria: row.categoria,
        monto: Math.abs(parseAmount(row.monto)),
        fecha: normalizeDate(row.fecha),
        proyecto_nombre: row.proyecto === "empresa" ? "" : projectNameById.get(row.proyecto) || "",
        descripcion: row.descripcion.trim(),
        moneda: row.moneda,
        tipo_cambio: row.moneda === "MXN"
          ? undefined
          : row.tipo_cambio_mode === "pnl"
            ? getConfiguredExchangeRate(row.moneda)
            : parseAmount(row.tipo_cambio),
        nota_recepcion_status: uploadedNote?.status,
        nota_recepcion_storage_id: primaryDocument?.storage_id,
        nota_recepcion_nombre: primaryDocument?.nombre,
        nota_recepcion_type: primaryDocument?.type,
        nota_recepcion_size: primaryDocument?.size,
        nota_recepcion_uploaded_at: primaryDocument?.uploaded_at,
        nota_recepcion_documentos: uploadedNote?.documentos,
      }];
    });
  };

  const updateManualRow = <K extends keyof EditableMovementRow>(
    id: string,
    key: K,
    value: EditableMovementRow[K]
  ) => {
    setManualRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, [key]: value } : row))
    );
  };

  const addManualRow = () => {
    const lastRow = manualRows[manualRows.length - 1];
    setManualRows((currentRows) => [
      ...currentRows,
      createMovementRow({
        tipo: lastRow?.tipo || "costo_estructura",
        categoria: lastRow?.categoria || "OTROS",
        fecha: lastRow?.fecha || new Date().toISOString().slice(0, 10),
        moneda: lastRow?.moneda || "MXN",
        tipo_cambio_mode: lastRow?.tipo_cambio_mode || "pnl",
        tipo_cambio: lastRow?.tipo_cambio || "",
      }),
    ]);
  };

  const duplicateManualRow = (row: EditableMovementRow) => {
    setManualRows((currentRows) => {
      const index = currentRows.findIndex((currentRow) => currentRow.id === row.id);
      const duplicate = createMovementRow({
        ...row,
        id: crypto.randomUUID(),
        nota_recepcion_status: "none",
        nota_recepcion_files: [],
      });

      if (index === -1) return [...currentRows, duplicate];
      return [
        ...currentRows.slice(0, index + 1),
        duplicate,
        ...currentRows.slice(index + 1),
      ];
    });
  };

  const addManualRowDeliveryNotes = (id: string, files: File[]) => {
    setManualRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== id) return row;
        const existingKeys = new Set(row.nota_recepcion_files.map((item) => getDeliveryNoteFileKey(item.file)));
        const availableSlots = Math.max(MAX_DELIVERY_NOTE_FILES_PER_ROW - row.nota_recepcion_files.length, 0);
        const seenKeys = new Set(existingKeys);
        const nextFiles = files
          .filter((file) => {
            const key = getDeliveryNoteFileKey(file);
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
          })
          .slice(0, availableSlots)
          .map((file) => ({ id: crypto.randomUUID(), file }));

        return {
          ...row,
          nota_recepcion_files: [...row.nota_recepcion_files, ...nextFiles],
          nota_recepcion_status: nextFiles.length > 0 && row.nota_recepcion_status === "none" ? "completa" : row.nota_recepcion_status,
        };
      })
    );
  };

  const removeManualRowDeliveryNote = (rowId: string, noteId?: string) => {
    setManualRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) return row;
        const nextFiles = noteId
          ? row.nota_recepcion_files.filter((note) => note.id !== noteId)
          : [];

        return {
          ...row,
          nota_recepcion_files: nextFiles,
          nota_recepcion_status: nextFiles.length > 0 ? row.nota_recepcion_status : "none",
        };
      })
    );
  };

  const handleDeliveryNoteFileChange = (id: string, event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (selectedFiles.length === 0) return;
    const invalidFiles = selectedFiles.filter((file) => !isAcceptedDeliveryNoteFile(file));
    if (invalidFiles.length > 0) {
      toast.error("Archivo invalido", {
        description: invalidFiles.length === 1
          ? `${invalidFiles[0].name} no es foto o PDF.`
          : `${invalidFiles.length} archivos no son fotos o PDFs.`,
      });
      return;
    }
    const oversizedFiles = selectedFiles.filter((file) => file.size > MAX_DELIVERY_NOTE_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast.error("Archivo demasiado grande", {
        description: `Cada nota debe pesar maximo ${formatFileSize(MAX_DELIVERY_NOTE_FILE_SIZE)}.`,
      });
      return;
    }

    const currentRow = manualRows.find((row) => row.id === id);
    const currentCount = currentRow?.nota_recepcion_files.length || 0;
    if (currentCount >= MAX_DELIVERY_NOTE_FILES_PER_ROW) {
      toast.warning("Limite de documentos", {
        description: `Puedes adjuntar hasta ${MAX_DELIVERY_NOTE_FILES_PER_ROW} documentos por concepto.`,
      });
      return;
    }

    const filesToAdd = selectedFiles.slice(0, MAX_DELIVERY_NOTE_FILES_PER_ROW - currentCount);
    if (filesToAdd.length < selectedFiles.length) {
      toast.warning("Se omitieron algunos archivos", {
        description: `Solo se agregaron ${filesToAdd.length} por el limite de ${MAX_DELIVERY_NOTE_FILES_PER_ROW} documentos.`,
      });
    }

    addManualRowDeliveryNotes(id, filesToAdd);
  };

  const uploadManualRowNotes = async (rows: EditableMovementRow[]) => {
    const uploadedNotes = new Map<string, UploadedDeliveryNote>();

    for (const row of rows) {
      if (row.nota_recepcion_files.length === 0 || row.nota_recepcion_status === "none") continue;
      const documentos: DeliveryNoteDocument[] = [];

      for (const note of row.nota_recepcion_files) {
        const uploadUrl = await generateOgcUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": note.file.type || "application/octet-stream" },
          body: note.file,
        });

        if (!uploadResult.ok) {
          throw new Error(`No se pudo subir ${note.file.name}.`);
        }

        const { storageId } = await uploadResult.json();
        documentos.push({
          storage_id: storageId as Id<"_storage">,
          nombre: note.file.name,
          type: note.file.type || "application/octet-stream",
          size: note.file.size,
          uploaded_at: Date.now(),
        });
      }

      uploadedNotes.set(row.id, {
        status: row.nota_recepcion_status,
        documentos,
      });
    }

    return uploadedNotes;
  };

  const removeManualRow = (id: string) => {
    setManualRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== id);
      return nextRows.length > 0 ? nextRows : [createMovementRow()];
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const extension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."));
    if (![".xlsx", ".xls", ".xlsm"].includes(extension)) {
      toast.error("Archivo invalido", { description: "Sube un Excel .xlsx, .xls o .xlsm." });
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
    setResult(null);
    event.target.value = "";
  };

  const parseFile = async (selectedFile: File) => {
    const defaultError = "No se pudo procesar el archivo.";
    let lastError = defaultError;

    for (const endpoint of OGC_UPLOAD_ENDPOINTS) {
      const formData = new FormData();
      formData.append("file", selectedFile);

      try {
        const response = await fetch(endpoint, { method: "POST", body: formData });
        const data = await response.json().catch(() => null);
        if (response.ok && data) {
          const parsed = data as OgcUploadResult;
          if (parsed.success && parsed.movimientos?.length) return parsed;
          lastError = parsed.message || parsed.errors?.[0]?.error || lastError;
          continue;
        }
        lastError = data?.message || data?.error || lastError;
      } catch (error) {
        if (lastError === defaultError) {
          lastError = error instanceof Error ? error.message : lastError;
        }
      }
    }

    throw new Error(lastError);
  };

  const saveValidatedMovements = async (report: ValidationReport) => {
    if (report.valid.length === 0) {
      throw new Error("No hay movimientos validos para guardar.");
    }

    let createdCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    const chunkSize = 100;
    for (let index = 0; index < report.valid.length; index += chunkSize) {
      const chunk = report.valid.slice(index, index + chunkSize);
      const created = await bulkCreateMovements({ movimientos: chunk });
      createdCount += created.created;
      duplicateCount += created.skippedDuplicates || 0;
      rejectedCount += created.rejected || 0;
    }

    const skippedDetails = [
      report.errors.length ? `${report.errors.length} filas omitidas` : "",
      report.missingProjects.length ? `${report.missingProjects.length} obras no encontradas` : "",
      duplicateCount ? `${duplicateCount} duplicadas` : "",
      rejectedCount ? `${rejectedCount} rechazadas` : "",
      report.valid.length - createdCount - duplicateCount - rejectedCount > 0
        ? `${report.valid.length - createdCount - duplicateCount - rejectedCount} no guardadas`
        : "",
    ].filter(Boolean).join(", ");

    toast.success("Carga OGC completada", {
      description: `${createdCount} movimientos guardados${skippedDetails ? `, ${skippedDetails}` : ""}.`,
    });
    handleClose(false);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Selecciona un archivo");
      return;
    }

    if (!proyectos) {
      toast.error("Espera a que carguen las obras");
      return;
    }

    setIsProcessing(true);

    try {
      const parsed = await parseFile(file);
      setResult(parsed);

      if (!parsed.success || !parsed.movimientos?.length) {
        throw new Error(parsed.message || "No se encontraron movimientos validos.");
      }

      const report = validateMovements(parsed.movimientos, file.name);
      await saveValidatedMovements(report);
    } catch (error) {
      toast.error("Error al cargar movimientos OGC", {
        description: error instanceof Error ? error.message : "Ocurrio un error inesperado.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreviewManual = () => {
    const parsed = rowsToMovements(manualRows);

    if (parsed.length === 0) {
      toast.error("Agrega al menos una fila de movimientos");
      return;
    }

    const report = validateMovements(parsed, "captura masiva");
    if (report.errors.length > 0) {
      toast.warning("Vista previa con advertencias", {
        description: `${report.valid.length} validos, ${report.errors.length} con error.`,
      });
    } else {
      toast.success("Vista previa lista", { description: `${report.valid.length} movimientos validos.` });
    }
  };

  const handleSaveManual = async () => {
    if (!proyectos) {
      toast.error("Espera a que carguen las obras");
      return;
    }

    const preliminaryMovements = rowsToMovements(manualRows);
    const preliminaryReport = validateMovements(preliminaryMovements, "captura masiva");
    setIsProcessing(true);
    try {
      const preflight = await validateBulkCreateMovements({ movimientos: preliminaryReport.valid });
      const rowsThatWillCreate = new Set(preflight.validRows);
      const rowsReadyToSave = manualRows.filter((row, index) => rowHasUserInput(row) && rowsThatWillCreate.has(index + 1));
      const uploadedNotes = await uploadManualRowNotes(rowsReadyToSave);
      const parsed = rowsToMovements(manualRows, uploadedNotes);
      const report = validateMovements(parsed, "captura masiva");
      await saveValidatedMovements(report);
    } catch (error) {
      toast.error("Error al guardar movimientos", {
        description: error instanceof Error ? error.message : "Ocurrio un error inesperado.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const manualMovements = useMemo(() => rowsToMovements(manualRows), [manualRows, projectNameById, exchangeRates]);
  const manualReport = useMemo(() => validateMovements(manualMovements, "captura masiva"), [manualMovements, projectLookup, exchangeRates]);
  const deliveryNoteSummary = useMemo(() => {
    const activeRows = manualRows.filter(rowHasUserInput);
    const total = activeRows.length;
    const complete = activeRows.filter((row) => row.nota_recepcion_files.length > 0 && row.nota_recepcion_status === "completa").length;
    const partial = activeRows.filter((row) => row.nota_recepcion_files.length > 0 && row.nota_recepcion_status === "parcial").length;
    const documents = activeRows.reduce((sum, row) => sum + row.nota_recepcion_files.length, 0);
    const hasAllComplete = total > 0 && complete === total;

    return { total, complete, partial, documents, hasAllComplete };
  }, [manualRows]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-square-modal="" className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-x-hidden overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Cargar movimientos OGC</DialogTitle>
          <DialogDescription>
            Sube ingresos y costos de estructura. Las filas con obra se reflejan en rentabilidad; las filas sin obra quedan solo a nivel empresa.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual" className="min-w-0 space-y-5">
          <TabsList className="rounded-none">
            <TabsTrigger value="manual" className="rounded-none">Captura masiva</TabsTrigger>
            <TabsTrigger value="excel" className="rounded-none">Archivo Excel</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="min-w-0 space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <Label className="text-sm text-foreground">Movimientos manuales</Label>
                <p className="mt-1 text-xs text-subtle-foreground">
                  Agrega filas editables; selecciona una obra solo cuando el movimiento aplique a una obra especifica.
                  TC P&L: USD {exchangeRates.USD.toLocaleString("es-MX", { maximumFractionDigits: 4 })} / EUR {exchangeRates.EUR.toLocaleString("es-MX", { maximumFractionDigits: 4 })}.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtle-foreground">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-none",
                      deliveryNoteSummary.hasAllComplete
                        ? "bg-[#7EC18E]"
                        : deliveryNoteSummary.partial > 0
                          ? "bg-amber-500"
                          : "bg-disabled"
                    )}
                  />
                  <span>
                    Notas de recepcion: {deliveryNoteSummary.complete}/{deliveryNoteSummary.total} completas
                    {deliveryNoteSummary.partial > 0 ? `, ${deliveryNoteSummary.partial} parciales` : ""}
                    {deliveryNoteSummary.documents > 0 ? `, ${deliveryNoteSummary.documents} archivos` : ""}
                  </span>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={addManualRow} disabled={isProcessing}>
                <Plus className="h-4 w-4" />
                Agregar fila
              </Button>
            </div>

            <EditableMovementsTable
              rows={manualRows}
              proyectos={proyectos || []}
              exchangeRates={exchangeRates}
              errors={manualReport.errors}
              disabled={isProcessing}
              onUpdate={updateManualRow}
              onDeliveryNoteFileChange={handleDeliveryNoteFileChange}
              onRemoveDeliveryNote={removeManualRowDeliveryNote}
              onDuplicate={duplicateManualRow}
              onRemove={removeManualRow}
            />

            <MovementPreview report={manualReport} movements={manualMovements} compact />

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isProcessing}>
                Cancelar
              </Button>
              <Button type="button" variant="outline" onClick={handlePreviewManual} disabled={isProcessing || manualRows.length === 0}>
                Vista previa
              </Button>
              <Button type="button" onClick={handleSaveManual} disabled={isProcessing || manualReport.valid.length === 0}>
                {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : "Guardar movimientos"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="excel" className="min-w-0 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Archivo Excel</Label>
              <div className="border border-dashed border-border-strong p-6">
                {file ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className="h-8 w-8 text-[#1A5D21]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{file.name}</p>
                        <p className="text-xs text-subtle-foreground">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <Button type="button" variant="outline" onClick={() => setFile(null)} disabled={isProcessing}>
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Upload className="h-10 w-10 text-disabled-foreground" />
                    <div>
                      <p className="text-sm text-foreground">Excel con columnas: tipo, categoria, monto, fecha, obra, descripcion</p>
                      <p className="mt-1 text-xs text-subtle-foreground">La obra puede quedar vacia para costos solo de empresa.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => document.getElementById(fileInputId)?.click()}>
                      Seleccionar archivo
                    </Button>
                  </div>
                )}
                <input
                  id={fileInputId}
                  type="file"
                  accept=".xlsx,.xls,.xlsm"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {result?.summary && (
              <div className="border border-border bg-[#FBFAF2] p-4 text-sm text-foreground">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryStat label="Filas validas" value={result.summary.validRows} />
                  <SummaryStat label="Ingresos" value={result.summary.ingresos} />
                  <SummaryStat label="Costos" value={result.summary.costosEstructura} />
                  <SummaryStat label="Errores" value={result.summary.errors} />
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isProcessing}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleUpload} disabled={!file || isProcessing}>
                {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</> : "Cargar Excel"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-subtle-foreground">{label}</p>
      <p className="text-lg text-foreground">{value}</p>
    </div>
  );
}

function EditableMovementsTable({
  rows,
  proyectos,
  exchangeRates,
  errors,
  disabled,
  onUpdate,
  onDeliveryNoteFileChange,
  onRemoveDeliveryNote,
  onDuplicate,
  onRemove,
}: {
  rows: EditableMovementRow[];
  proyectos: DesarrolloOption[];
  exchangeRates: ExchangeRateSettings;
  errors: ValidationReport["errors"];
  disabled: boolean;
  onUpdate: <K extends keyof EditableMovementRow>(id: string, key: K, value: EditableMovementRow[K]) => void;
  onDeliveryNoteFileChange: (id: string, event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveDeliveryNote: (rowId: string, noteId?: string) => void;
  onDuplicate: (row: EditableMovementRow) => void;
  onRemove: (id: string) => void;
}) {
  const getConfiguredExchangeRate = (currency?: string) => {
    const normalizedCurrency = (currency || "MXN").toUpperCase();
    if (normalizedCurrency === "USD") return Number.isFinite(exchangeRates.USD) && exchangeRates.USD > 0 ? exchangeRates.USD : 0;
    if (normalizedCurrency === "EUR") return Number.isFinite(exchangeRates.EUR) && exchangeRates.EUR > 0 ? exchangeRates.EUR : 0;
    return 0;
  };

  const formatExchangeRate = (value: number) => {
    return value > 0 ? String(value) : "";
  };

  const errorsByRow = useMemo(() => {
    const map = new Map<number, string>();
    errors.forEach((error) => map.set(error.row, error.message));
    return map;
  }, [errors]);

  return (
    <div className="min-w-0 space-y-3">
      {rows.map((row, index) => {
        const rowError = errorsByRow.get(index + 1);
        const configuredExchangeRate = getConfiguredExchangeRate(row.moneda);
        const isPnlExchangeRate = row.tipo_cambio_mode === "pnl";
        const hasDeliveryNotes = row.nota_recepcion_files.length > 0;
        const deliveryNoteInputId = `delivery-note-${row.id}`;

        return (
          <div
            key={row.id}
            className={cn(
              "min-w-0 border border-border p-3",
              rowError ? "bg-red-50" : "bg-card"
            )}
          >
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                <FieldLabel>Fila</FieldLabel>
                <div className="flex h-9 items-center gap-2 text-sm text-foreground">
                  <span>{index + 1}</span>
                  {rowError && <AlertTriangle className="h-4 w-4 shrink-0 text-[#802424]" />}
                </div>
              </div>

              <div className="min-w-0 lg:col-span-2">
                <FieldLabel>Tipo</FieldLabel>
                <Select
                  value={row.tipo}
                  onValueChange={(value) => onUpdate(row.id, "tipo", value as OgcMovementType)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-square-modal="">
                    <SelectItem value="costo_estructura">Costo estructura</SelectItem>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 lg:col-span-3">
                <FieldLabel>Categoria</FieldLabel>
                <Select
                  value={row.categoria}
                  onValueChange={(value) => onUpdate(row.id, "categoria", value)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-square-modal="">
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 lg:col-span-2">
                <FieldLabel>Monto</FieldLabel>
                <Input
                  inputMode="decimal"
                  value={row.monto}
                  onChange={(event) => onUpdate(row.id, "monto", event.target.value)}
                  placeholder="0.00"
                  disabled={disabled}
                />
              </div>

              <div className="min-w-0 lg:col-span-2">
                <FieldLabel>Fecha</FieldLabel>
                <Input
                  type="date"
                  value={row.fecha}
                  onChange={(event) => onUpdate(row.id, "fecha", event.target.value)}
                  disabled={disabled}
                />
              </div>

              <div className="min-w-0 lg:col-span-3">
                <FieldLabel>Obra</FieldLabel>
                <Select
                  value={row.proyecto}
                  onValueChange={(value) => onUpdate(row.id, "proyecto", value as EditableMovementRow["proyecto"])}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-square-modal="">
                    <SelectItem value="empresa">Empresa</SelectItem>
                    {proyectos.map((proyecto) => (
                      <SelectItem key={proyecto._id} value={proyecto._id}>{proyecto.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 lg:col-span-3">
                <FieldLabel>Descripcion</FieldLabel>
                <Input
                  value={row.descripcion}
                  onChange={(event) => onUpdate(row.id, "descripcion", event.target.value)}
                  placeholder="Detalle del movimiento"
                  disabled={disabled}
                />
              </div>

              <div className="min-w-0 lg:col-span-1">
                <FieldLabel>Moneda</FieldLabel>
                <Select
                  value={row.moneda}
                  onValueChange={(value) => {
                    onUpdate(row.id, "moneda", value);
                    if (value === "MXN") {
                      onUpdate(row.id, "tipo_cambio_mode", "pnl");
                      onUpdate(row.id, "tipo_cambio", "");
                    }
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-square-modal="">
                    <SelectItem value="MXN">MXN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 lg:col-span-2">
                <FieldLabel>TC</FieldLabel>
                <div className="flex min-w-0 gap-2">
                  <Select
                    value={row.tipo_cambio_mode}
                    onValueChange={(value) => {
                      const mode = value as ExchangeRateMode;
                      onUpdate(row.id, "tipo_cambio_mode", mode);
                      if (mode === "manual" && !row.tipo_cambio.trim() && configuredExchangeRate > 0) {
                        onUpdate(row.id, "tipo_cambio", formatExchangeRate(configuredExchangeRate));
                      }
                    }}
                    disabled={disabled || row.moneda === "MXN"}
                  >
                    <SelectTrigger className="w-[88px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent data-square-modal="">
                      <SelectItem value="pnl">P&L</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="decimal"
                    value={isPnlExchangeRate && row.moneda !== "MXN" ? formatExchangeRate(configuredExchangeRate) : row.tipo_cambio}
                    onChange={(event) => onUpdate(row.id, "tipo_cambio", event.target.value)}
                    placeholder={row.moneda === "MXN" ? "-" : "0.00"}
                    disabled={disabled || row.moneda === "MXN" || isPnlExchangeRate}
                  />
                </div>
              </div>

              <div className="min-w-0 sm:col-span-2 lg:col-span-10">
                <div
                  className={cn(
                    "min-w-0 border px-3 py-2",
                    hasDeliveryNotes ? "border-[#B7D9BE] bg-[#F4FBF5]" : "border-dashed border-border-strong bg-card"
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle2
                        className={cn(
                          "h-5 w-5 shrink-0",
                          row.nota_recepcion_status === "completa" && hasDeliveryNotes
                            ? "text-[#16A34A]"
                            : row.nota_recepcion_status === "parcial" && hasDeliveryNotes
                              ? "text-amber-500"
                              : "text-disabled-foreground"
                        )}
                        aria-label={hasDeliveryNotes ? `Evidencia ${row.nota_recepcion_status}` : "Sin evidencia"}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">Notas de recepcion</p>
                        <p className="truncate text-[11px] text-subtle-foreground">
                          {hasDeliveryNotes
                            ? `${row.nota_recepcion_files.length} archivo${row.nota_recepcion_files.length === 1 ? "" : "s"} adjunto${row.nota_recepcion_files.length === 1 ? "" : "s"}`
                            : "Fotos o PDFs de notas"}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <Select
                        value={row.nota_recepcion_status}
                        onValueChange={(value) => {
                          if (value === "none") {
                            onRemoveDeliveryNote(row.id);
                            return;
                          }
                          onUpdate(row.id, "nota_recepcion_status", value as DeliveryNoteStatus);
                        }}
                        disabled={disabled || !hasDeliveryNotes}
                      >
                        <SelectTrigger className="h-8 w-[118px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent data-square-modal="">
                          <SelectItem value="none">Sin nota</SelectItem>
                          <SelectItem value="parcial">Parcial</SelectItem>
                          <SelectItem value="completa">Completa</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById(deliveryNoteInputId)?.click()}
                        disabled={disabled || row.nota_recepcion_files.length >= MAX_DELIVERY_NOTE_FILES_PER_ROW}
                        title="Agregar fotos o PDFs"
                        className="h-8 shrink-0"
                      >
                        <Paperclip className="h-4 w-4" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                  <input
                    id={deliveryNoteInputId}
                    type="file"
                    multiple
                    accept={DELIVERY_NOTE_ACCEPT}
                    className="hidden"
                    onChange={(event) => onDeliveryNoteFileChange(row.id, event)}
                    disabled={disabled}
                  />
                  {hasDeliveryNotes && (
                    <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                      {row.nota_recepcion_files.map((note) => (
                        <span
                          key={note.id}
                          className="inline-flex max-w-full items-center gap-1 border border-border bg-card px-2 py-1 text-[11px] text-foreground"
                          title={`${note.file.name} - ${formatFileSize(note.file.size)}`}
                        >
                          {isDeliveryNoteImageFile(note.file) ? (
                            <Image className="h-3.5 w-3.5 shrink-0 text-[#1A5D21]" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
                          )}
                          <span className="max-w-[180px] truncate">{note.file.name}</span>
                          <span className="shrink-0 text-disabled-foreground">{formatFileSize(note.file.size)}</span>
                          <button
                            type="button"
                            onClick={() => onRemoveDeliveryNote(row.id, note.id)}
                            disabled={disabled}
                            className="shrink-0 text-disabled-foreground hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Quitar archivo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                <FieldLabel>Acciones</FieldLabel>
                <div className="flex h-9 justify-start gap-1 lg:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDuplicate(row)}
                    disabled={disabled}
                    title="Duplicar fila"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(row.id)}
                    disabled={disabled}
                    title="Eliminar fila"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {rowError && (
                <p className="min-w-0 break-words text-xs text-[#802424] sm:col-span-2 lg:col-span-12">
                  {rowError}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Label className="mb-1 block text-xs font-normal text-subtle-foreground">
      {children}
    </Label>
  );
}

function MovementPreview({
  report,
  movements,
  compact = false,
}: {
  report: ValidationReport;
  movements: OgcUploadMovement[];
  compact?: boolean;
}) {
  const errorRows = new Set(report.errors.map((error) => error.row));
  const visibleMovements = movements.slice(0, compact ? 5 : 8);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="border border-border bg-[#FBFAF2] p-3">
          <p className="text-xs text-subtle-foreground">Validos</p>
          <p className="flex items-center gap-2 text-lg text-foreground"><CheckCircle2 className="h-4 w-4 text-[#1A5D21]" />{report.valid.length}</p>
        </div>
        <div className="border border-border bg-card p-3">
          <p className="text-xs text-subtle-foreground">Con error</p>
          <p className="flex items-center gap-2 text-lg text-foreground"><AlertTriangle className="h-4 w-4 text-[#802424]" />{report.errors.length}</p>
        </div>
        <div className="border border-border bg-card p-3">
          <p className="text-xs text-subtle-foreground">Ingresos</p>
          <p className="text-lg text-foreground">{report.ingresos}</p>
        </div>
        <div className="border border-border bg-card p-3">
          <p className="text-xs text-subtle-foreground">Costos</p>
          <p className="text-lg text-foreground">{report.costosEstructura}</p>
        </div>
      </div>

      <div className="min-w-0 border border-border text-sm">
        <div className="hidden grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] border-b border-border bg-[#FBFAF2] text-subtle-foreground md:grid">
          <p className="px-3 py-2">Fila</p>
          <p className="px-3 py-2">Tipo</p>
          <p className="px-3 py-2">Categoria</p>
          <p className="px-3 py-2">Monto</p>
          <p className="px-3 py-2">Fecha</p>
          <p className="px-3 py-2">Obra</p>
        </div>

        {visibleMovements.map((movement) => (
          <div
            key={movement.rowIndex}
            className={cn(
              "grid min-w-0 grid-cols-1 gap-2 border-b border-border p-3 md:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:gap-0 md:p-0",
              errorRows.has(movement.rowIndex) ? "bg-red-50" : "bg-card"
            )}
          >
            <PreviewCell label="Fila">{movement.rowIndex}</PreviewCell>
            <PreviewCell label="Tipo">{movement.tipo === "ingreso" ? "Ingreso" : "Costo estructura"}</PreviewCell>
            <PreviewCell label="Categoria">{movement.categoria}</PreviewCell>
            <PreviewCell label="Monto">${movement.monto.toLocaleString("es-MX")}</PreviewCell>
            <PreviewCell label="Fecha">{movement.fecha}</PreviewCell>
            <PreviewCell label="Obra">{movement.proyecto_nombre || "Empresa"}</PreviewCell>
          </div>
        ))}
      </div>

      {report.errors.length > 0 && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {report.errors.slice(0, 4).map((error) => (
            <p key={`${error.row}-${error.message}`}>Fila {error.row}: {error.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewCell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 break-words md:px-3 md:py-2">
      <span className="mr-2 text-xs text-subtle-foreground md:hidden">{label}</span>
      <span>{children}</span>
    </div>
  );
}
