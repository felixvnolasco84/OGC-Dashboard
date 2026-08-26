import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUploadSalesProyectoDocumentsModal } from "@/hooks/upload-sales-proyecto-documents-modal";
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

const DOCUMENT_TYPES = [
    "Factura",
    "Comprobante",
    "Cotización",
    "Contrato",
    "Recibo",
    "Orden de Compra",
    "Otro"
];

export default function UploadSalesProyectoDocumentsModal() {
    const { isOpen, onClose, salesProyectoId: initialSalesProyectoId, transactionId: initialTransactionId } = useUploadSalesProyectoDocumentsModal();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [files, setFiles] = useState<FileUpload[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedSalesProyectoId, setSelectedSalesProyectoId] = useState<Id<"sales_projects"> | undefined>(undefined);
    const [selectedTransactionId, setSelectedTransactionId] = useState<Id<"sales_transacciones"> | undefined>(undefined);

    // Queries
    const salesProjects = useQuery(api.sales_projects.getAll);
    const transactions = useQuery(
        api.sales_transacciones_queries.getBySalesProyecto,
        selectedSalesProyectoId ? { sales_proyecto_id: selectedSalesProyectoId } : "skip"
    );

    // Mutations
    const generateUploadUrl = useMutation(api.documentos.generateUploadUrl);
    const createDocument = useMutation(api.documentos.createWithStorage);

    // Initialize with provided values if any
    useEffect(() => {
        if (isOpen) {
            setSelectedSalesProyectoId(initialSalesProyectoId);
            setSelectedTransactionId(initialTransactionId);
        }
    }, [isOpen, initialSalesProyectoId, initialTransactionId]);

    // Filter and format transactions for display
    const formattedTransactions = useMemo(() => {
        if (!transactions) return [];
        
        return transactions.map(tx => ({
            id: tx._id,
            label: `${tx.fecha} - ${tx.tipo_pago} - $${tx.monto_total.toLocaleString('es-MX')} - ${tx.nombre_cliente || 'Sin cliente'}`,
            factura: tx.factura,
        }));
    }, [transactions]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (!selectedFiles) return;

        const newFiles: FileUpload[] = Array.from(selectedFiles).map(file => ({
            file,
            nombre: file.name,
            descripcion: "",
            type: "Otro",
            status: "pending" as const,
        }));

        setFiles(prev => [...prev, ...newFiles]);
        
        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
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
        if (!selectedTransactionId || !selectedSalesProyectoId) {
            updateFile(index, { status: "error", error: "Missing transaction or project ID" });
            return false;
        }

        try {
            updateFile(index, { status: "uploading" });

            // Step 1: Generate upload URL
            const uploadUrl = await generateUploadUrl();

            // Step 2: Upload file to Convex storage
            const result = await fetch(uploadUrl, {
                method: "POST",
                headers: { "Content-Type": fileUpload.file.type },
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
                sales_proyecto: selectedSalesProyectoId,
                sales_transaccion_id: selectedTransactionId,
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
        if (!selectedSalesProyectoId) {
            toast.error("Por favor selecciona un proyecto de ventas");
            return;
        }

        if (!selectedTransactionId) {
            toast.error("Por favor selecciona una transacción");
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

        for (const { file, index } of pendingFiles) {
            const success = await uploadSingleFile(file, index);
            if (success) successCount++;
            else errorCount++;
        }

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
        setSelectedSalesProyectoId(undefined);
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

    const canUpload = selectedSalesProyectoId && selectedTransactionId && files.length > 0 && !isUploading;
    const pendingCount = files.filter(f => f.status === "pending").length;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent data-square-modal="" className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-normal">Subir Documentos de Ventas</DialogTitle>
                    <DialogDescription>
                        Sube múltiples documentos a la vez. Puedes personalizar el nombre, descripción y tipo de cada archivo.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Project and Transaction Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Sales Project Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="sales-project-select">
                                Proyecto de Ventas <span className="text-red-500">*</span>
                            </Label>
                            <Select
                                value={selectedSalesProyectoId}
                                onValueChange={(value) => {
                                    setSelectedSalesProyectoId(value as Id<"sales_projects">);
                                    setSelectedTransactionId(undefined); // Reset transaction when project changes
                                }}
                                disabled={isUploading}
                            >
                                <SelectTrigger id="sales-project-select">
                                    <SelectValue placeholder="Selecciona un proyecto" />
                                </SelectTrigger>
                                <SelectContent data-square-modal="">
                                    {salesProjects?.map((project) => (
                                        <SelectItem key={project._id} value={project._id}>
                                            {project.nombre}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Transaction Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="transaction-select">
                                Transacción <span className="text-red-500">*</span>
                            </Label>
                            <Select
                                value={selectedTransactionId}
                                onValueChange={(value) => setSelectedTransactionId(value as Id<"sales_transacciones">)}
                                disabled={!selectedSalesProyectoId || isUploading}
                            >
                                <SelectTrigger id="transaction-select">
                                    <SelectValue placeholder={
                                        !selectedSalesProyectoId 
                                            ? "Primero selecciona un proyecto" 
                                            : "Selecciona una transacción"
                                    } />
                                </SelectTrigger>
                                <SelectContent data-square-modal="">
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
                    </div>

                    {/* Upload Area */}
                    <div className="border-2 border-dashed border-border-strong rounded-none p-8 text-center hover:border-border-strong transition-colors">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        />
                        <Upload className="h-12 w-12 text-disabled-foreground mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground mb-2">
                            Arrastra archivos aquí o haz clic para seleccionar
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
