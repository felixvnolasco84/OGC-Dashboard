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
};

export default function TransactionDocumentosModal() {
    const { isOpen, onClose, transactionId } = useTransactionDocumentosModal();

    const transaction = useQuery(
        api.transacciones.getTransactionById,
        transactionId ? { id: transactionId } : "skip"
    );

    const getDocumentUrl = (documentUrl: string) => {
        return documentUrl;
    };

    const getDocumentDownloadUrl = (documentUrl: string) => {
        return documentUrl;
    };

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
                return "bg-gray-100 text-gray-700 border-gray-200";
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-normal">Documentos de Transacción</DialogTitle>
                    {transaction?.factura && (
                        <p className="text-sm text-gray-500">Factura: {transaction.factura}</p>
                    )}
                </DialogHeader>

                {!transaction ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Summary */}
                        <div className="bg-gray-50 rounded-none p-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-sm text-gray-500">Total Documentos</p>
                                    <p className="text-2xl font-semibold text-gray-900">
                                        {transaction.documents?.length || 0}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Fecha de Transacción</p>
                                    <p className="text-sm text-gray-900">
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
                                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                                <p className="text-gray-500">No hay documentos registrados para esta transacción</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {transaction.documents.map((doc: Document) => (
                                    <div
                                        key={doc._id}
                                        className="border border-gray-200 rounded-none p-4 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4 flex-1">
                                                <div className="p-3 bg-gray-100 rounded-none">
                                                    <FileText className="h-6 w-6 text-gray-600" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <h4 className="text-sm font-medium text-gray-900">{doc.nombre}</h4>
                                                        <Badge
                                                            variant="outline"
                                                            className={`${getDocumentTypeColor(doc.type)} rounded-none px-2 py-0.5 text-xs`}
                                                        >
                                                            {doc.type}
                                                        </Badge>
                                                    </div>
                                                    {doc.descripcion && (
                                                        <p className="text-sm text-gray-600 mb-3">{doc.descripcion}</p>
                                                    )}
                                                    <div className="flex items-center gap-3">
                                                        {doc.image && (
                                                            <>

                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="rounded-none"
                                                                    onClick={() => window.open(getDocumentUrl(doc.image!), '_blank')}
                                                                >
                                                                    <ExternalLink className="h-4 w-4 mr-2" />
                                                                    Ver documento
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="rounded-none"
                                                                    onClick={() => {
                                                                        (async () => {
                                                                            const downloadUrl = await getDocumentDownloadUrl(doc.image!);
                                                                            if (downloadUrl) {
                                                                                window.open(downloadUrl, '_blank');
                                                                            }
                                                                        })();
                                                                    }}
                                                                >
                                                                    <Download className="h-4 w-4 mr-2" />
                                                                    Descargar
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Document Types Summary */}
                        {transaction.documents && transaction.documents.length > 0 && (
                            <div className="border-t pt-4">
                                <h3 className="text-sm font-medium text-gray-700 mb-3">Tipos de documentos</h3>
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
