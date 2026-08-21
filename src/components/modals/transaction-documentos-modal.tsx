import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTransactionDocumentosModal } from "@/hooks/transaction-documentos-modal";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Loader2, FileText,
    Download,
    ExternalLink
} from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

// Type definitions
type Document = {
    _id: Id<"documentos">;
    transaccion_id?: Id<"transacciones">; // Optional: may reference regular transaction
    sales_transaccion_id?: Id<"sales_transacciones">; // Optional: may reference sales transaction
    nombre: string;
    descripcion: string;
    image?: string; // Optional: Legacy Appwrite file ID
    storage_id?: Id<"_storage">; // Optional: New Convex storage ID
    type: string;
    proyecto?: Id<"desarrollos">; // Optional: may reference regular project
    sales_proyecto?: Id<"sales_projects">; // Optional: may reference sales project
    size?: number;
    uploaded_at?: number;
    url?: string | null;
};

export default function TransactionDocumentosModal() {
    const { isOpen, onClose, transactionId } = useTransactionDocumentosModal();

    const transaction = useQuery(
        api.transacciones.getTransactionDocumentsById,
        isOpen && transactionId ? { id: transactionId } : "skip"
    );

    const getDocumentTypeColor = (type?: string) => {
        switch (type?.toLowerCase()) {
            case "factura":
                return "bg-blue-50 text-blue-700 border-blue-200";
            case "comprobante":
                return "bg-green-50 text-green-700 border-green-200";
            case "cotización":
            case "cotizacion":
                return "bg-purple-50 text-purple-700 border-purple-200";
            case "contrato":
                return "bg-orange-50 text-orange-700 border-orange-200";
            default:
                return "bg-muted text-foreground border-border";
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent data-square-modal="" className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-normal">Documentos de Transacción</DialogTitle>
                    {transaction?.factura && (
                        <p className="text-sm text-subtle-foreground">Factura: {transaction.factura}</p>
                    )}
                </DialogHeader>

                {!transaction ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-disabled-foreground" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Summary */}
                        <div className="bg-background rounded-none p-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-sm text-subtle-foreground">Total Documentos</p>
                                    <p className="text-2xl font-semibold text-foreground">
                                        {transaction.documents?.length || 0}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-subtle-foreground">Fecha de Transacción</p>
                                    <p className="text-sm text-foreground">
                                        {transaction.fecha
                                            ? new Date(transaction.fecha.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
                                                day: "2-digit",
                                                month: "short",
                                                year: "numeric",
                                            })
                                            : "-"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Documents List */}
                        {!transaction.documents || transaction.documents.length === 0 ? (
                            <div className="text-center py-12">
                                <FileText className="h-12 w-12 text-disabled-foreground mx-auto mb-4" />
                                <p className="text-subtle-foreground">No hay documentos registrados para esta transacción</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {transaction.documents.map((doc: Document) => {
                                    const documentUrl = doc.url || doc.image;

                                    return (
                                      <div
                                        key={doc._id}
                                        className="border border-border rounded-none p-4 hover:bg-background transition-colors"
                                      >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4 flex-1">
                                                <div className="p-3 bg-muted rounded-none">
                                                    <FileText className="h-6 w-6 text-muted-foreground" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {documentUrl ? (
                                                            <a
                                                                href={documentUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                                            >
                                                                {doc.nombre}
                                                            </a>
                                                        ) : (
                                                            <h4 className="text-sm font-medium text-foreground">{doc.nombre}</h4>
                                                        )}
                                                        <Badge
                                                            variant="outline"
                                                            className={`${getDocumentTypeColor(doc.type)} rounded-none px-2 py-0.5 text-xs`}
                                                        >
                                                            {doc.type}
                                                        </Badge>
                                                    </div>
                                                    {doc.descripcion && (
                                                        <p className="text-sm text-muted-foreground mb-3">{doc.descripcion}</p>
                                                    )}
                                                    <div className="flex items-center gap-3">
                                                        {documentUrl && (
                                                            <>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="rounded-none"
                                                                    asChild
                                                                >
                                                                    <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                                                                        <ExternalLink className="h-4 w-4 mr-2" />
                                                                        Ver documento
                                                                    </a>
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="rounded-none"
                                                                    asChild
                                                                >
                                                                    <a href={documentUrl} download={doc.nombre} target="_blank" rel="noopener noreferrer">
                                                                        <Download className="h-4 w-4 mr-2" />
                                                                        Descargar
                                                                    </a>
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                      </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Document Types Summary */}
                        {transaction.documents && transaction.documents.length > 0 && (
                            <div className="border-t pt-4">
                                <h3 className="text-sm font-medium text-foreground mb-3">Tipos de documentos</h3>
                                <div className="flex flex-wrap gap-2">
                                    {Array.from(
                                        new Set(transaction.documents.map((doc: Document) => doc.type))
                                    ).map((type: string) => {
                                        const count = transaction.documents.filter((doc: Document) => doc.type === type).length;
                                        return (
                                            <Badge
                                                key={type}
                                                variant="outline"
                                                className={`${getDocumentTypeColor(type)} rounded-none px-3 py-1`}
                                            >
                                                {type}: {count}
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
