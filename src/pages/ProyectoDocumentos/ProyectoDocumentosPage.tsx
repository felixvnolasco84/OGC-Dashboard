import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Search, Upload
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteDocument
} from "@/lib/appwrite";
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
import { useUploadProyectoDocumentsModal } from "@/hooks/upload-proyecto-documents-modal";

export default function ProyectoDocumentosPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Id<"documentos"> | null>(null);

  // Fetch project
  const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");
  
  // Fetch documents for this specific project
  const documentos = useQuery(api.documentos.getByProyecto, proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip");
  
  // Fetch transactions for this project (to get transaction details)
  const transacciones = useQuery(api.transacciones.getByProyecto, proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip");

  // Mutations
  const deleteDocumentMutation = useMutation(api.documentos.deleteDocument);

  // Filter documents
  const filteredDocumentos = documentos?.filter(doc => {
    const matchesSearch = doc.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.type.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  // Get transaction details for a document
  const getTransactionForDoc = (transaccionId: Id<"transacciones">) => {
    return transacciones?.find(tx => tx._id === transaccionId);
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
        return "bg-gray-100 text-gray-700 border-gray-200";
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

      // 1. Delete from Convex database
      const result = await deleteDocumentMutation({ id: documentToDelete });

      // 2. Delete from Appwrite storage
      if (result.fileId) {
        await deleteDocument(result.fileId);
      }

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

  const uploadModal = useUploadProyectoDocumentsModal();

  const handleUploadClick = () => {
    // Open modal with proyectoId from URL
    if (proyectoId) {
      uploadModal.onOpen(proyectoId as Id<"desarrollos">);
    }
  };

  if (!proyecto) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">
        <div className="flex flex-col gap-4 px-12">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Documentos</p>
              <h1 className="text-2xl text-gray-900">{proyecto.nombre}</h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUploadClick}>
                <Upload className="mr-2 h-4 w-4" />
                Subir Documentos
              </Button>
              <Badge variant="outline" className="rounded-none px-4 py-2 bg-gray-100">
                <span className="text-sm font-normal">
                  Total: {documentos?.length || 0}
                </span>
              </Badge>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-8 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar por nombre o tipo de documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 rounded-none border-gray-300 h-12"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded-none">
          <table className="w-full">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Documento
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Proveedor
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Tipo
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Transacción
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!documentos ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Cargando documentos...
                  </td>
                </tr>
              ) : filteredDocumentos && filteredDocumentos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron documentos en este proyecto
                  </td>
                </tr>
              ) : (
                filteredDocumentos?.map((doc) => {
                  const transaction = getTransactionForDoc(doc.transaccion_id);
                  return (
                    <tr
                      key={doc._id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 border-r border-gray-200">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-gray-400" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {doc.nombre}
                            </div>
                            <div className="text-xs text-gray-400">
                              Subido el {formatUploadDate(doc._creationTime)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                        {transaction?.banco || "-"}
                      </td>
                      <td className="px-6 py-4 border-r border-gray-200">
                        <Badge
                          variant="outline"
                          className={`${getTipoBadgeColor(
                            doc.type
                          )} px-3 py-1 text-xs font-normal capitalize rounded-none`}
                        >
                          {doc.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                        {transaction?.factura || transaction?.codigo_referencia || "-"}
                      </td>
                      <td className="px-6 py-4 border-r border-gray-200">
                        {/* Action buttons can be added here */}
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
