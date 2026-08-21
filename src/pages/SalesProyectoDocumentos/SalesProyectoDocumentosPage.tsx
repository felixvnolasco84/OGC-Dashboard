import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Search, Upload, Download, ExternalLink, Trash2
} from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUploadSalesProyectoDocumentsModal } from "@/hooks/upload-sales-proyecto-documents-modal";

export default function SalesProyectoDocumentosPage() {
  const { salesProyectoId } = useParams<{ salesProyectoId: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Id<"documentos"> | null>(null);

  // Fetch sales project
  const salesProyecto = useQuery(api.sales_projects.getById, salesProyectoId ? { id: salesProyectoId as Id<"sales_projects"> } : "skip");
  
  // Fetch documents for this sales project
  const documentos = useQuery(api.sales_documentos.getBySalesProyecto, salesProyectoId ? { sales_proyecto_id: salesProyectoId as Id<"sales_projects"> } : "skip");
  
  // Fetch sales transactions for this project (to get transaction details)
  const transacciones = useQuery(api.sales_transacciones_queries.getBySalesProyecto, salesProyectoId ? { sales_proyecto_id: salesProyectoId as Id<"sales_projects"> } : "skip");

  // Mutations
  const deleteDocumentMutation = useMutation(api.sales_documentos.deleteDocument);

  // Filter documents
  const filteredDocumentos = documentos?.filter(doc => {
    const matchesSearch = doc.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.type.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  // Get transaction details for a document
  const getTransactionForDoc = (transaccionId: Id<"sales_transacciones">) => {
    return transacciones?.find((tx) => tx._id === transaccionId);
  };

  // Get tipo badge color
  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo.toLowerCase()) {
      case "factura":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "comprobante":
        return "bg-green-50 text-green-700 border-green-200";
      case "presupuesto":
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "bg-muted text-foreground border-border";
    }
  };

  // Format upload date
  const formatUploadDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      const doc = documentos?.find(d => d._id === documentToDelete);
      if (!doc) return;

      // Delete from Convex database
      await deleteDocumentMutation({ id: documentToDelete });

      toast.success("Documento eliminado", {
        description: "El documento se eliminó correctamente.",
      });

      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Error al eliminar", {
        description: "No se pudo eliminar el documento.",
      });
    }
  };

  const uploadModal = useUploadSalesProyectoDocumentsModal();

  const handleUploadClick = () => {
    // Open modal with salesProyectoId from URL
    if (salesProyectoId) {
      uploadModal.onOpen(salesProyectoId as Id<"sales_projects">);
    }
  };

  const handleView = (fileUrl: string) => {
    window.open(fileUrl, '_blank');
  };

  const handleDownload = (fileUrl: string) => {
    window.open(fileUrl, '_blank');
  };

  const openDeleteDialog = (documentId: Id<"documentos">) => {
    setDocumentToDelete(documentId);
    setDeleteDialogOpen(true);
  };

  if (!salesProyecto) {
    return (
      <div className="bg-card min-h-screen flex items-center justify-center">
        <p className="text-subtle-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="bg-card min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">
        <div className="flex flex-col gap-4 px-12">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="text-sm text-subtle-foreground mb-1">Documentos</p>
              <h1 className="text-2xl text-foreground">{salesProyecto.nombre}</h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUploadClick}>
                <Upload className="mr-2 h-4 w-4" />
                Subir Documentos
              </Button>
              <Badge variant="outline" className="rounded-none px-4 py-2 bg-muted">
                <span className="text-sm font-normal">
                  Total: {documentos?.length || 0}
                </span>
              </Badge>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-8 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-disabled-foreground h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar por nombre o tipo de documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 rounded-none border-border-strong h-12"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-none">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Documento
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Cliente
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Tipo
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Transacción
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!documentos ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-subtle-foreground">
                    Cargando documentos...
                  </td>
                </tr>
              ) : filteredDocumentos && filteredDocumentos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-subtle-foreground">
                    No se encontraron documentos en este proyecto
                  </td>
                </tr>
              ) : (
                filteredDocumentos?.map((doc) => {
                  const transaction = doc.sales_transaccion_id ? getTransactionForDoc(doc.sales_transaccion_id) : null;
                  return (
                    <tr
                      key={doc._id}
                      className="hover:bg-background transition-colors"
                    >
                      <td className="px-6 py-4 border-r border-border">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-disabled-foreground" />
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {doc.nombre}
                            </div>
                            <div className="text-xs text-disabled-foreground">
                              Subido el {formatUploadDate(doc._creationTime)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                        {transaction?.nombre_cliente || "-"}
                      </td>
                      <td className="px-6 py-4 border-r border-border">
                        <Badge
                          variant="outline"
                          className={`${getTipoBadgeColor(
                            doc.type
                          )} px-3 py-1 text-xs font-normal capitalize rounded-none`}
                        >
                          {doc.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                        {transaction?.factura || transaction?.codigo_referencia || "-"}
                      </td>
                      <td className="px-6 py-4 border-r border-border">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(doc.image!)}
                            className="h-8 px-2 text-muted-foreground hover:text-foreground"
                            disabled={!doc.image}
                            title="Ver documento"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(doc.image!)}
                            className="h-8 px-2 text-muted-foreground hover:text-foreground"
                            disabled={!doc.image}
                            title="Descargar documento"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(doc._id)}
                            className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Eliminar documento"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El documento se eliminará permanentemente
              del sistema y del almacenamiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDocumentToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
