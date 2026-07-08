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
import { useUploadSalesDocumentsModal } from "@/hooks/upload-sales-documents-modal";

export default function SalesDocumentosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Id<"documentos"> | null>(null);
  const [selectedProyecto, setSelectedProyecto] = useState<Id<"sales_projects"> | "">("");

  // Queries
  const proyectos = useQuery(api.sales_projects.getAll);
  const documentos = useQuery(api.sales_documentos.getAll);
  const transacciones = useQuery(api.sales_transacciones_queries.getAllWithDetails);

  // Mutations
  const deleteDocumentMutation = useMutation(api.sales_documentos.deleteDocument);

  // Filter documents
  const filteredDocumentos = documentos?.filter(doc => {
    const matchesSearch = doc.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.type.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesProyecto = !selectedProyecto || doc.sales_proyecto === selectedProyecto;

    return matchesSearch && matchesProyecto;
  });

  // Get transaction details for a document
  const getTransactionForDoc = (transaccionId: Id<"sales_transacciones"> | undefined) => {
    if (!transaccionId) return undefined;
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

  // const openDeleteDialog = (documentId: Id<"documentos">) => {
  //   setDocumentToDelete(documentId);
  //   setDeleteDialogOpen(true);
  // };

  const uploadModal = useUploadSalesDocumentsModal();

  const handleUploadClick = () => {
    // Open modal and let user select sales project and sales transaction
    uploadModal.onOpen();
  };


  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">
        <div className="flex flex-col gap-4 px-4 sm:px-6 lg:px-12">
          <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-normal text-gray-900 mb-2">Documentos de Ventas</h1>
              <p className="text-sm text-gray-500">
                Gestiona los documentos asociados a las transacciones de ventas
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={handleUploadClick} className="w-full sm:w-auto">
                <Upload className="mr-2 h-4 w-4" />
                Subir Documentos
              </Button>
              <Button
                onClick={() => toast.info("Funcionalidad de agregar documento próximamente")}
                variant="outline"
                size="lg"
                className="flex w-full items-center justify-center gap-2 rounded-none py-6 text-gray-500 sm:w-auto"
              >
                Agregar Documento
                <Plus className="h-6 w-6 rounded-full shadow-none" />
              </Button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="mb-6 grid grid-cols-1 gap-4 lg:mb-8 md:grid-cols-2">
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
                  setSelectedProyecto(value as Id<"sales_projects">);
                }
              }}
            >
              <SelectTrigger className="rounded-none h-12">
                <SelectValue placeholder="Todos los proyectos de ventas" />
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
        <div className="mx-4 overflow-hidden border border-gray-200 rounded-none sm:mx-6 lg:mx-12">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[24%]" />
              <col className="w-[16%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className="hidden border-b border-gray-200 md:table-header-group">
              <tr>
                <th className="border-r border-gray-200 px-4 py-4 text-left text-sm font-normal text-gray-600 lg:px-6">
                  Documento
                </th>
                <th className="border-r border-gray-200 px-4 py-4 text-left text-sm font-normal text-gray-600 lg:px-6">
                  Cliente
                </th>
                <th className="border-r border-gray-200 px-4 py-4 text-left text-sm font-normal text-gray-600 lg:px-6">
                  Tipo
                </th>
                <th className="px-4 py-4 text-left text-sm font-normal text-gray-600 lg:px-6">
                  Transacción
                </th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-gray-200 md:table-row-group">
              {!documentos ? (
                <tr className="block md:table-row">
                  <td colSpan={4} className="block px-6 py-12 text-center text-gray-500 md:table-cell">
                    Cargando documentos...
                  </td>
                </tr>
              ) : filteredDocumentos && filteredDocumentos.length === 0 ? (
                <tr className="block md:table-row">
                  <td colSpan={4} className="block px-6 py-12 text-center text-gray-500 md:table-cell">
                    No se encontraron documentos
                  </td>
                </tr>
              ) : (
                filteredDocumentos?.map((doc) => {
                  const transaction = getTransactionForDoc(doc.sales_transaccion_id);
                  return (
                    <tr
                      key={doc._id}
                      className="block p-4 transition-colors hover:bg-gray-50 md:table-row md:p-0"
                    >
                      <td className="block pb-4 md:table-cell md:border-r md:border-gray-200 md:px-4 md:py-4 lg:px-6">
                        <div className="flex min-w-0 items-start gap-3">
                          <FileText className="mt-0.5 h-5 w-5 flex-none text-gray-400" />
                          <div className="min-w-0">
                            <div className="break-words text-sm font-medium text-gray-900">
                              {doc.nombre}
                            </div>
                            <div className="text-xs text-gray-400">
                              Subido el {formatUploadDate(doc._creationTime)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="flex items-start justify-between gap-4 py-2 text-sm text-gray-900 md:table-cell md:border-r md:border-gray-200 md:px-4 md:py-4 lg:px-6">
                        <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 md:hidden">
                          Cliente
                        </span>
                        <span className="min-w-0 break-words text-right md:text-left">
                          {transaction?.nombre_cliente || "-"}
                        </span>
                      </td>
                      <td className="flex items-start justify-between gap-4 py-2 md:table-cell md:border-r md:border-gray-200 md:px-4 md:py-4 lg:px-6">
                        <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 md:hidden">
                          Tipo
                        </span>
                        <Badge
                          variant="outline"
                          className={`${getTipoBadgeColor(
                            doc.type
                          )} max-w-full break-words px-3 py-1 text-xs font-normal capitalize rounded-none whitespace-normal`}
                        >
                          {doc.type}
                        </Badge>
                      </td>
                      <td className="flex items-start justify-between gap-4 pt-2 text-sm text-gray-900 md:table-cell md:px-4 md:py-4 lg:px-6">
                        <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 md:hidden">
                          Transacción
                        </span>
                        <span className="min-w-0 break-words text-right md:text-left">
                          {transaction?.factura || transaction?.codigo_referencia || "-"}
                        </span>
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
