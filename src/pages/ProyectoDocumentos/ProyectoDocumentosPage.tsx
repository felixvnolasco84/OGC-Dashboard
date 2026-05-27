import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, FileText, Search, Upload, Download, ExternalLink, Trash2
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
import { useUploadProyectoDocumentsModal } from "@/hooks/upload-proyecto-documents-modal";

const PAGE_SIZE = 25;

export default function ProyectoDocumentosPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Id<"documentos"> | null>(null);
  const [page, setPage] = useState(1);

  // Fetch project
  const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

  const documentosPage = useQuery(
    api.documentos.getByProyectoPaginated,
    proyectoId
      ? {
          proyecto_id: proyectoId as Id<"desarrollos">,
          search: searchTerm,
          page,
          pageSize: PAGE_SIZE,
        }
      : "skip"
  );

  // Mutations
  const deleteDocumentMutation = useMutation(api.documentos.deleteDocument);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, proyectoId]);

  useEffect(() => {
    if (documentosPage && page !== documentosPage.page) {
      setPage(documentosPage.page);
    }
  }, [documentosPage, page]);

  const documentos = documentosPage?.documentos;
  const transaccionesById = useMemo(() => {
    const transacciones = (documentosPage?.transacciones || []).filter((tx) => tx !== null);
    return new Map(transacciones.map((tx) => [tx._id, tx]));
  }, [documentosPage?.transacciones]);

  // Get transaction details for a document
  const getTransactionForDoc = (transaccionId?: Id<"transacciones">) => {
    if (!transaccionId) return undefined;
    return transaccionesById.get(transaccionId);
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

  const uploadModal = useUploadProyectoDocumentsModal();

  const handleUploadClick = () => {
    // Open modal with proyectoId from URL
    if (proyectoId) {
      uploadModal.onOpen(proyectoId as Id<"desarrollos">);
    }
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      toast.loading("Descargando documento...", { id: "download" });
      
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Error al descargar");
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      
      toast.success("Documento descargado", { id: "download" });
    } catch (error) {
      console.error("Error downloading file:", error);
      toast.error("Error al descargar el documento", { id: "download" });
    }
  };

  const openDeleteDialog = (documentId: Id<"documentos">) => {
    setDocumentToDelete(documentId);
    setDeleteDialogOpen(true);
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
                  Total: {documentosPage?.total || 0}
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
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!documentosPage ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Cargando documentos...
                  </td>
                </tr>
              ) : documentos && documentos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron documentos en este proyecto
                  </td>
                </tr>
              ) : (
                documentos?.map((doc) => {
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
                        <div className="flex items-center gap-2">
                          {
                            doc.url ? (
                              <Button
                                key={doc._id}
                                onClick={() => window.open(doc.url!, '_blank')}
                                size={"sm"}
                                variant="ghost"
                                className="h-8 px-2 text-gray-600 hover:text-gray-900"
                                title={`Ver ${doc.nombre}`}
                                disabled={!doc.url}
                              >
                                <ExternalLink className="w-3 h-3 text-gray-600" />
                              </Button>
                            ) : (
                              <></>
                            )
                          }
                          {
                            doc.url ? (
                              // direct download button 
                              <Button size={"sm"}
                                variant="ghost"
                                onClick={() => handleDownload(doc.url!, doc.nombre)}
                                title="Descargar documento" disabled={!doc.url}>
                                <Download className="h-4 w-4" />
                              </Button>
                            ) : (
                              // download button 
                              <></>
                            )
                          }

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
        {documentosPage && (
          <PaginationControls
            page={documentosPage.page}
            pageSize={documentosPage.pageSize}
            total={documentosPage.total}
            totalPages={documentosPage.totalPages}
            onPageChange={setPage}
          />
        )}
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

function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const pages = getPaginationPages(page, totalPages);

  return (
    <div className="mx-12 mt-5 flex flex-col gap-3 border border-gray-200 px-4 py-3 text-sm text-gray-500 md:flex-row md:items-center md:justify-between">
      <span>
        Mostrando {firstItem}-{lastItem} de {total} documentos
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-none"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`${item}-${index}`} className="px-2 text-gray-400">
              ...
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? "default" : "ghost"}
              className="h-9 w-9 rounded-none px-0"
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          )
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-none"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function getPaginationPages(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push("ellipsis");

  for (let item = start; item <= end; item += 1) {
    pages.push(item);
  }

  if (end < totalPages - 1) pages.push("ellipsis");

  pages.push(totalPages);
  return pages;
}
