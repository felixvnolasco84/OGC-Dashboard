import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUploadProyectoDocumentsModal } from "@/hooks/upload-proyecto-documents-modal";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Upload,
    FileText,
    X,
    CheckCircle2,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";

type FileUpload = {
    file: File;
    nombre: string;
    descripcion: string;
    type: string;
    status: "pending" | "uploading" | "success" | "error";
    error?: string;
};

const createFileUploads = (files: File[]): FileUpload[] =>
    files.map((file) => ({
        file,
        nombre: file.name,
        descripcion: "",
        type: "Otro",
        status: "pending",
    }));

const DOCUMENT_TYPES = [
    "Factura",
    "Comprobante",
    "Cotización",
    "Contrato",
    "Recibo",
    "Orden de Compra",
    "Otro"
];

export default function UploadProyectoDocumentsModal() {
    const {
        folderId,
        initialFiles,
        isOpen,
        onClose,
        proyectoId,
        transactionId: initialTransactionId,
    } = useUploadProyectoDocumentsModal();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [files, setFiles] = useState<FileUpload[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);
    const [selectedTransactionId, setSelectedTransactionId] = useState<Id<"transacciones"> | undefined>(undefined);

    // Queries - Only fetch transactions for the specific project
    const transactions = useQuery(
        api.transacciones.getByProyecto,
        proyectoId ? { proyecto_id: proyectoId } : "skip"
    );

    const proyecto = useQuery(
        api.desarrollos.getById,
        proyectoId ? { id: proyectoId } : "skip"
    );

    const documentMetadata = useQuery(
        api.documentos.getProjectFileManagerMetadata,
        proyectoId ? { proyecto: proyectoId } : "skip"
    );

    // Mutations
    const generateUploadUrl = useMutation(api.documentos.generateUploadUrl);
    const createDocument = useMutation(api.documentos.createWithStorage);

    // Initialize with provided transaction if any
    useEffect(() => {
        if (isOpen) {
            setSelectedTransactionId(initialTransactionId);
            setFiles(createFileUploads(initialFiles));
            setIsDragActive(false);
        }
    }, [initialFiles, initialTransactionId, isOpen]);

    // Filter and format transactions for display
    const formattedTransactions = useMemo(() => {
        if (!transactions) return [];
        
        return transactions.map(tx => ({
            id: tx._id,
            label: `${tx.fecha} - ${tx.tipo_pago} - $${tx.monto_total.toLocaleString('es-MX')} - ${tx.status}`,
            factura: tx.factura,
        }));
    }, [transactions]);

    const destinationFolder = folderId
        ? documentMetadata?.folders.find((folder) => folder?._id === folderId)
        : undefined;
    const destinationLabel = folderId
        ? destinationFolder?.nombre || "Carpeta seleccionada"
        : "Biblioteca";

    const addFiles = (selectedFiles: File[]) => {
        const validFiles = selectedFiles.filter((file) => file.size > 0);
        if (validFiles.length === 0) return;

        setFiles((previousFiles) => {
            const existingKeys = new Set(
                previousFiles.map(
                    ({ file }) => `${file.name}:${file.size}:${file.lastModified}`,
                ),
            );
            const uniqueFiles = validFiles.filter(
                (file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`),
            );
            return [...previousFiles, ...createFileUploads(uniqueFiles)];
        });
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            addFiles(Array.from(event.target.files));
        }
        
        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragActive(false);
        addFiles(Array.from(event.dataTransfer.files));
    };

    const updateFile = (index: number, updates: Partial<FileUpload>) => {
        setFiles(prev => prev.map((file, i) => 
            i === index ? { ...file, ...updates } : file
        ));
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const uploadSingleFile = async (fileUpload: FileUpload, index: number): Promise<boolean> => {
        if (!proyectoId) {
            updateFile(index, { status: "error", error: "Missing project ID" });
            return false;
        }

        try {
            updateFile(index, { status: "uploading" });

            // Step 1: Generate upload URL
            const uploadUrl = await generateUploadUrl();

            // Step 2: Upload file to Convex storage
            const result = await fetch(uploadUrl, {
                method: "POST",
                headers: {
                    "Content-Type": fileUpload.file.type || "application/octet-stream",
                },
                body: fileUpload.file,
            });

            if (!result.ok) {
                throw new Error("Failed to upload file");
            }

            const { storageId } = await result.json();

            // Step 3: Save metadata to database
            await createDocument({
                nombre: fileUpload.nombre,
                descripcion: fileUpload.descripcion,
                storage_id: storageId,
                type: fileUpload.type,
                size: fileUpload.file.size,
                mime_type: fileUpload.file.type || undefined,
                proyecto: proyectoId,
                transaccion_id: selectedTransactionId,
                folder_id: folderId,
            });

            updateFile(index, { status: "success" });
            return true;
        } catch (error) {
            console.error("Error uploading file:", error);
            updateFile(index, { 
                status: "error", 
                error: error instanceof Error ? error.message : "Upload failed"
            });
            return false;
        }
    };

    const handleUploadAll = async () => {
        if (!proyectoId) {
            toast.error("Proyecto no seleccionado");
            return;
        }

        if (files.length === 0) {
            toast.error("No hay archivos para subir");
            return;
        }

        setIsUploading(true);

        const pendingFiles = files
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => file.status === "pending");

        let successCount = 0;
        let errorCount = 0;
        let nextFileIndex = 0;

        const uploadWorker = async () => {
            while (nextFileIndex < pendingFiles.length) {
                const pendingFile = pendingFiles[nextFileIndex];
                nextFileIndex += 1;

                const success = await uploadSingleFile(
                    pendingFile.file,
                    pendingFile.index,
                );
                if (success) successCount += 1;
                else errorCount += 1;
            }
        };

        await Promise.all(
            Array.from(
                { length: Math.min(3, pendingFiles.length) },
                () => uploadWorker(),
            ),
        );

        setIsUploading(false);

        if (errorCount === 0) {
            toast.success(`${successCount} documento(s) subido(s) correctamente`);
            setTimeout(() => {
                handleClose();
            }, 1500);
        } else {
            toast.error(`${successCount} exitoso(s), ${errorCount} fallido(s)`);
        }
    };

    const handleClose = () => {
        setFiles([]);
        setIsDragActive(false);
        setSelectedTransactionId(undefined);
        onClose();
    };

    const getStatusIcon = (status: FileUpload["status"]) => {
        switch (status) {
            case "uploading":
                return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
            case "success":
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case "error":
                return <X className="h-4 w-4 text-red-500" />;
            default:
                return <FileText className="h-4 w-4 text-disabled-foreground" />;
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    };

    const pendingCount = files.filter(f => f.status === "pending").length;
    const canUpload = Boolean(proyectoId && pendingCount > 0 && !isUploading);

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent data-square-modal="" className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-normal">Subir Documentos</DialogTitle>
                    <DialogDescription>
                        Proyecto: <span className="font-medium text-foreground">{proyecto?.nombre}</span>
                        <span className="mt-1 block">
                            Destino: <span className="font-medium text-foreground">{destinationLabel}</span>
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Transaction Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="transaction-select">
                            Transacción <span className="font-normal text-disabled-foreground">(opcional)</span>
                        </Label>
                        <Select
                            value={selectedTransactionId || "none"}
                            onValueChange={(value) =>
                                setSelectedTransactionId(
                                    value === "none" ? undefined : value as Id<"transacciones">,
                                )
                            }
                            disabled={isUploading}
                        >
                            <SelectTrigger id="transaction-select">
                                <SelectValue placeholder="Sin transacción" />
                            </SelectTrigger>
                            <SelectContent data-square-modal="">
                                <SelectItem value="none">Sin transacción</SelectItem>
                                {formattedTransactions.length === 0 ? (
                                    <div className="px-2 py-4 text-sm text-subtle-foreground text-center">
                                        No hay transacciones disponibles
                                    </div>
                                ) : (
                                    formattedTransactions.map((tx) => (
                                        <SelectItem key={tx.id} value={tx.id}>
                                            {tx.label}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Upload Area */}
                    <div
                        className={cn(
                            "rounded-none border-2 border-dashed p-8 text-center transition-colors",
                            isDragActive
                                ? "border-foreground bg-background"
                                : "border-border-strong hover:border-border-strong",
                        )}
                        onDragEnter={(event) => {
                            event.preventDefault();
                            setIsDragActive(true);
                        }}
                        onDragLeave={(event) => {
                            event.preventDefault();
                            setIsDragActive(false);
                        }}
                        onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={handleDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
                            accept="image/*,.xml,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar,.7z"
                        />
                        <Upload className="h-12 w-12 text-disabled-foreground mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground mb-2">
                            {isDragActive
                                ? "Suelta los archivos para agregarlos"
                                : "Arrastra varios archivos aquí o selecciónalos desde tu equipo"}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            Seleccionar Archivos
                        </Button>
                    </div>

                    {/* Files List */}
                    {files.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-medium">
                                    Archivos ({files.length})
                                </h3>
                                {pendingCount > 0 && (
                                    <span className="text-sm text-subtle-foreground">
                                        {pendingCount} pendiente(s)
                                    </span>
                                )}
                            </div>

                            <div className="space-y-4 max-h-[400px] overflow-y-auto">
                                {files.map((fileUpload, index) => (
                                    <div
                                        key={index}
                                        className={cn(
                                            "border rounded-none p-4 space-y-3",
                                            fileUpload.status === "success" && "bg-green-50 border-green-200",
                                            fileUpload.status === "error" && "bg-red-50 border-red-200"
                                        )}
                                    >
                                        {/* Header */}
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                {getStatusIcon(fileUpload.status)}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">
                                                        {fileUpload.file.name}
                                                    </p>
                                                    <p className="text-xs text-subtle-foreground">
                                                        {formatFileSize(fileUpload.file.size)}
                                                    </p>
                                                </div>
                                            </div>
                                            {fileUpload.status === "pending" && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeFile(index)}
                                                    disabled={isUploading}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>

                                        {/* Error Message */}
                                        {fileUpload.status === "error" && fileUpload.error && (
                                            <p className="text-xs text-red-600">{fileUpload.error}</p>
                                        )}

                                        {/* Edit Fields (only for pending files) */}
                                        {fileUpload.status === "pending" && (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label htmlFor={`nombre-${index}`} className="text-xs">
                                                        Nombre
                                                    </Label>
                                                    <Input
                                                        id={`nombre-${index}`}
                                                        value={fileUpload.nombre}
                                                        onChange={(e) => updateFile(index, { nombre: e.target.value })}
                                                        disabled={isUploading}
                                                        className="h-8 text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor={`type-${index}`} className="text-xs">
                                                        Tipo
                                                    </Label>
                                                    <Select
                                                        value={fileUpload.type}
                                                        onValueChange={(value) => updateFile(index, { type: value })}
                                                        disabled={isUploading}
                                                    >
                                                        <SelectTrigger id={`type-${index}`} className="h-8 text-sm">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent data-square-modal="">
                                                            {DOCUMENT_TYPES.map((type) => (
                                                                <SelectItem key={type} value={type}>
                                                                    {type}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="col-span-2 space-y-1">
                                                    <Label htmlFor={`descripcion-${index}`} className="text-xs">
                                                        Descripción
                                                    </Label>
                                                    <Textarea
                                                        id={`descripcion-${index}`}
                                                        value={fileUpload.descripcion}
                                                        onChange={(e) => updateFile(index, { descripcion: e.target.value })}
                                                        disabled={isUploading}
                                                        className="h-16 text-sm resize-none"
                                                        placeholder="Descripción opcional"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClose}
                            disabled={isUploading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleUploadAll}
                            disabled={!canUpload}
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Subiendo...
                                </>
                            ) : (
                                `Subir ${pendingCount} archivo(s)`
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
