import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Search,
  //  Trash2, Download,
  Plus, Upload
} from "lucide-react";
import { toast } from "sonner";
import {
  // getFileUrl,
  deleteDocument
} from "@/lib/appwrite";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useUploadDocumentsModal } from "@/hooks/upload-documents-modal";

export default function DocumentosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Id<"documentos"> | null>(null);
  const [selectedProyecto, setSelectedProyecto] = useState<Id<"desarrollos"> | "">("");

  // Queries
  const proyectos = useQuery(api.desarrollos.getAll);
  const documentos = useQuery(api.documentos.getAll);
  const transacciones = useQuery(api.transacciones.getAllWithDetails);

  // Mutations
  const deleteDocumentMutation = useMutation(api.documentos.deleteDocument);

  // Filter documents
  const filteredDocumentos = documentos?.filter(doc => {
    const matchesSearch = doc.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.type.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesProyecto = !selectedProyecto || doc.proyecto === selectedProyecto;

    return matchesSearch && matchesProyecto;
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

  // const openDeleteDialog = (documentId: Id<"documentos">) => {
  //   setDocumentToDelete(documentId);
  //   setDeleteDialogOpen(true);
  // };

  const uploadModal = useUploadDocumentsModal();

  const handleUploadClick = () => {
    // Open modal and let user select project and transaction
    uploadModal.onOpen();
  };


  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">
        <div className="flex flex-col gap-4 px-12">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-normal text-gray-900 mb-2">Documentos</h1>
              <p className="text-sm text-gray-500">
                Gestiona los documentos asociados a los pagos del proyecto
              </p>
            </div>
            <Button onClick={handleUploadClick}>
              <Upload className="mr-2 h-4 w-4" />
              Subir Documentos
            </Button>
            <Button
              onClick={() => toast.info("Funcionalidad de agregar documento próximamente")}
              variant="outline"
              size="lg"
              className="flex items-center gap-2 rounded-none text-gray-500 py-6"
            >
              Agregar Documento
              <Plus className="h-6 w-6 rounded-full shadow-none" />
            </Button>
          </div>

          {/* Search and Filter */}
          <div className="mb-8 grid grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 rounded-none border-gray-300 h-12"
              />
            </div>

            {/* Project Filter */}
            <Select
              value={selectedProyecto || undefined}
              onValueChange={(value) => {
                if (value === "clear") {
                  setSelectedProyecto("");
                } else {
                  setSelectedProyecto(value as Id<"desarrollos">);
                }
              }}
            >
              <SelectTrigger className="rounded-none h-12">
                <SelectValue placeholder="Todos los proyectos" />
              </SelectTrigger>
              <SelectContent>
                {selectedProyecto && (
                  <SelectItem value="clear">
                    <span className="text-gray-500">Limpiar filtro</span>
                  </SelectItem>
                )}
                {proyectos?.map((proyecto) => (
                  <SelectItem key={proyecto._id} value={proyecto._id}>
                    {proyecto.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    No se encontraron documentos
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
                        {/* <div className="flex items-center gap-2">
                          {
                            doc.image ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                            onClick={() => window.open(getFileUrl(doc.image), "_blank")}
                          >
                            <Download className="h-4 w-4 text-gray-400" />
                          </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openDeleteDialog(doc._id)}
                              >
                            <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-600" />
                          </Button>
                            )
                          }
                        </div> */}
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
