import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Download, Trash2, Search, Plus, File, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { uploadDocument, getFileUrl, getFileDownloadUrl, deleteDocument } from "@/lib/appwrite";
import { Doc, Id } from "../../../convex/_generated/dataModel";

export default function DocumentosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [transaccionSearchTerm, setTransaccionSearchTerm] = useState("");
  const [selectedProyecto, setSelectedProyecto] = useState<Id<"desarrollos"> | "">("")
  const [selectedTransaccion, setSelectedTransaccion] = useState<Id<"transacciones"> | "">("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);  
  const [isUploading, setIsUploading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Doc<"documentos"> | null>(null);
  const [isReplacingFile, setIsReplacingFile] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    type: "",
    file: null as File | null,
  });

  // Queries
  const proyectos = useQuery(api.desarrollos.getAll);

  // Get transactions for selected proyecto
  const transacciones = useQuery(
    api.transacciones.getByProyecto,
    selectedProyecto ? { proyecto_id: selectedProyecto } : "skip"
  );

  // Filter and search transactions
  const filteredTransacciones = useMemo(() => {
    if (!transacciones) return [];
    
    if (transaccionSearchTerm.trim() === "") return transacciones;
    
    const searchLower = transaccionSearchTerm.toLowerCase();
    return transacciones.filter((tx) => 
      tx.fecha.toLowerCase().includes(searchLower) ||
      tx.tipo_pago.toLowerCase().includes(searchLower) ||
      tx.status.toLowerCase().includes(searchLower) ||
      tx.monto_total.toString().includes(searchLower)
    );
  }, [transacciones, transaccionSearchTerm]);

  const documentos = useQuery(
    api.documentos.getAll
  );

  // Mutations
  const createDocument = useMutation(api.documentos.create);
  const updateDocument = useMutation(api.documentos.update);
  const deleteDocumentMutation = useMutation(api.documentos.deleteDocument);

  // Filter documents
  const filteredDocumentos = documentos?.filter(doc =>
    doc.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Query for transaction details to display in document cards
  const getTransactionForDoc = (transaccionId: Id<"transacciones">) => {
    return transacciones?.find(tx => tx._id === transaccionId);
  };

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, file });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.file || !selectedProyecto || !selectedTransaccion || !formData.type) {
      toast.error("Faltan campos requeridos", {
        description: "Por favor completa todos los campos, selecciona una transacción y un archivo.",
      });
      return;
    }

    setIsUploading(true);

    try {
      // 1. Upload file to Appwrite
      const uploadResult = await uploadDocument(formData.file);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Error al subir el archivo");
      }

      // 2. Create document record in Convex
      await createDocument({
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        image: uploadResult.fileId!, // Store Appwrite file ID
        type: formData.type,
        proyecto: selectedProyecto,
        transaccion_id: selectedTransaccion,
      });

      toast.success("Documento subido exitosamente", {
        description: `El documento "${formData.nombre}" se ha vinculado a la transacción.`,
      });

      // Reset form
      setFormData({
        nombre: "",
        descripcion: "",
        type: "",
        file: null,
      });
      setSelectedTransaccion("");
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Error al subir el documento", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditDocument = (doc: Doc<"documentos">) => {
    setEditingDocument(doc);
    setFormData({
      nombre: doc.nombre,
      descripcion: doc.descripcion,
      type: doc.type,
      file: null,
    });
    // Set the proyecto and transaccion for the edit form
    setSelectedProyecto(doc.proyecto);
    setSelectedTransaccion(doc.transaccion_id);
    setIsReplacingFile(false);
    setIsEditDialogOpen(true);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingDocument || !selectedProyecto || !selectedTransaccion || !formData.type) {
      toast.error("Faltan campos requeridos", {
        description: "Por favor completa todos los campos y selecciona una transacción.",
      });
      return;
    }

    setIsUploading(true);

    try {
      let fileId = editingDocument.image; // Keep existing file ID by default

      // If user wants to replace the file
      if (isReplacingFile && formData.file) {
        // 1. Upload new file to Appwrite
        const uploadResult = await uploadDocument(formData.file);

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Error al subir el archivo");
        }

        fileId = uploadResult.fileId!;

        // 2. Delete old file from Appwrite
        await deleteDocument(editingDocument.image);
      }

      // 3. Update document record in Convex
      await updateDocument({
        id: editingDocument._id,
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        image: fileId,
        type: formData.type,
        proyecto: selectedProyecto,
        transaccion_id: selectedTransaccion,
      });

      toast.success("Documento actualizado exitosamente", {
        description: `El documento "${formData.nombre}" se ha actualizado correctamente.`,
      });

      // Reset form
      setFormData({
        nombre: "",
        descripcion: "",
        type: "",
        file: null,
      });
      setSelectedTransaccion("");
      setEditingDocument(null);
      setIsReplacingFile(false);
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating document:", error);
      toast.error("Error al actualizar el documento", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (doc: Doc<"documentos">) => {
    try {
      // 1. Delete from Convex database
      const result = await deleteDocumentMutation({ id: doc._id });

      // 2. Delete from Appwrite storage
      if (result.fileId) {
        await deleteDocument(result.fileId);
      }

      toast.success("Documento eliminado", {
        description: "El documento se eliminó correctamente.",
      });
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Error al eliminar", {
        description: "No se pudo eliminar el documento.",
      });
    }
  };

  const getFileTypeIcon = (type: string) => {
    if (type.includes("pdf")) return "📄";
    if (type.includes("image")) return "🖼️";
    if (type.includes("word") || type.includes("document")) return "📝";
    if (type.includes("excel") || type.includes("spreadsheet")) return "📊";
    return "📎";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Documentos</h1>
          <p className="text-gray-600">Gestiona los documentos asociados a los pagos del proyecto</p>
        </div>

        {/* Filters and Actions */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Buscar documentos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Proyecto Filter */}
            <Select value={selectedProyecto || undefined} onValueChange={(value) => {
              if (value === "clear") {
                setSelectedProyecto("");
                setSelectedTransaccion("");
              } else {
                setSelectedProyecto(value as Id<"desarrollos">);
                setSelectedTransaccion("");
              }
            }}>
              <SelectTrigger>
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

            {/* Add Document Button */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Documento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl overflow-y-scroll">
                <DialogHeader>
                  <DialogTitle>Subir Nuevo Documento</DialogTitle>
                  <DialogDescription>
                    Sube un documento y vincúlalo a un pago específico
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Proyecto */}
                  <div className="space-y-2">
                    <Label htmlFor="proyecto">Proyecto *</Label>
                    <Select
                      value={selectedProyecto || undefined}
                      onValueChange={(value) => {
                        setSelectedProyecto(value as Id<"desarrollos">);
                        setSelectedTransaccion("");
                      }}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar proyecto" />
                      </SelectTrigger>
                      <SelectContent>
                        {proyectos?.map((proyecto) => (
                          <SelectItem key={proyecto._id} value={proyecto._id}>
                            {proyecto.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Transacción */}
                  <div className="space-y-2">
                    <Label htmlFor="transaccion">Transacción *</Label>
                    {!selectedProyecto ? (
                      <p className="text-sm text-gray-500">Primero selecciona un proyecto</p>
                    ) : (
                      <>
                        {/* Search */}
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                          <Input
                            placeholder="Buscar transacciones..."
                            value={transaccionSearchTerm}
                            onChange={(e) => setTransaccionSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>

                        {/* Transactions List */}
                        <Select
                          value={selectedTransaccion || undefined}
                          onValueChange={(value) => setSelectedTransaccion(value as Id<"transacciones">)}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar transacción" />
                          </SelectTrigger>
                          <SelectContent className="max-h-80">
                            {filteredTransacciones && filteredTransacciones.length > 0 ? (
                              filteredTransacciones.map((tx) => (
                                <SelectItem key={tx._id} value={tx._id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {formatCurrency(tx.monto_total)} - {tx.fecha}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {tx.tipo_pago} • {tx.status}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="no-results" disabled>
                                No hay transacciones disponibles
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>

                  {/* Nombre */}
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre del documento *</Label>
                    <Input
                      id="nombre"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Ej: Plano arquitectónico rev. 3"
                      required
                    />
                  </div>

                  {/* Descripción */}
                  <div className="space-y-2">
                    <Label htmlFor="descripcion">Descripción</Label>
                    <Textarea
                      id="descripcion"
                      value={formData.descripcion}
                      onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                      placeholder="Descripción del documento..."
                      rows={3}
                    />
                  </div>

                  {/* Tipo */}
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipo de documento *</Label>
                    <Select
                      value={formData.type || undefined}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="factura">Factura</SelectItem>
                        <SelectItem value="comprobante">Comprobante</SelectItem>
                        <SelectItem value="presupuesto">Presupuesto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* File Upload */}
                  <div className="space-y-2">
                    <Label htmlFor="file">Archivo *</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      {formData.file ? (
                        <div className="space-y-2">
                          <File className="h-8 w-8 mx-auto text-green-600" />
                          <p className="text-sm font-medium">{formData.file.name}</p>
                          <p className="text-xs text-gray-500">
                            {(formData.file.size / 1024).toFixed(2)} KB
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFormData({ ...formData, file: null })}
                          >
                            Cambiar archivo
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="h-8 w-8 mx-auto text-gray-400" />
                          <p className="text-sm">Arrastra un archivo o haz clic para seleccionar</p>
                          <Input
                            id="file"
                            type="file"
                            onChange={handleFileChange}
                            className="max-w-xs mx-auto"
                            required
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isUploading}>
                      {isUploading ? "Subiendo..." : "Subir Documento"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Edit Document Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Documento</DialogTitle>
              <DialogDescription>
                Actualiza los detalles del documento o reemplaza el archivo
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              {/* Proyecto */}
              <div className="space-y-2">
                <Label htmlFor="edit-proyecto">Proyecto *</Label>
                <Select
                  value={selectedProyecto || undefined}
                  onValueChange={(value) => {
                    setSelectedProyecto(value as Id<"desarrollos">);
                    setSelectedTransaccion("");
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {proyectos?.map((proyecto) => (
                      <SelectItem key={proyecto._id} value={proyecto._id}>
                        {proyecto.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Transacción */}
              <div className="space-y-2">
                <Label htmlFor="edit-transaccion">Transacción *</Label>
                {!selectedProyecto ? (
                  <p className="text-sm text-gray-500">Primero selecciona un proyecto</p>
                ) : (
                  <>
                    {/* Search */}
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Buscar transacciones..."
                        value={transaccionSearchTerm}
                        onChange={(e) => setTransaccionSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    {/* Transactions List */}
                    <Select
                      value={selectedTransaccion || undefined}
                      onValueChange={(value) => setSelectedTransaccion(value as Id<"transacciones">)}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar transacción" />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        {filteredTransacciones && filteredTransacciones.length > 0 ? (
                          filteredTransacciones.map((tx) => (
                            <SelectItem key={tx._id} value={tx._id}>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {formatCurrency(tx.monto_total)} - {tx.fecha}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {tx.tipo_pago} • {tx.status}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-results" disabled>
                            No hay transacciones disponibles
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>

              {/* Nombre */}
              <div className="space-y-2">
                <Label htmlFor="edit-nombre">Nombre del documento *</Label>
                <Input
                  id="edit-nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Plano arquitectónico rev. 3"
                  required
                />
              </div>

              {/* Descripción */}
              <div className="space-y-2">
                <Label htmlFor="edit-descripcion">Descripción</Label>
                <Textarea
                  id="edit-descripcion"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Descripción del documento..."
                  rows={3}
                />
              </div>

              {/* Tipo */}
              <div className="space-y-2">
                <Label htmlFor="edit-type">Tipo de documento *</Label>
                <Select
                  value={formData.type || undefined}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="factura">Factura</SelectItem>
                    <SelectItem value="comprobante">Comprobante</SelectItem>
                    <SelectItem value="presupuesto">Presupuesto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* File Replacement Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Archivo actual</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsReplacingFile(!isReplacingFile)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {isReplacingFile ? "Cancelar reemplazo" : "Reemplazar archivo"}
                  </Button>
                </div>

                {!isReplacingFile ? (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <File className="h-8 w-8 text-blue-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Archivo existente</p>
                        <p className="text-xs text-gray-500">
                          {editingDocument?.type || "Documento"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => editingDocument && window.open(getFileUrl(editingDocument.image), "_blank")}
                      >
                        Ver archivo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    {formData.file ? (
                      <div className="space-y-2">
                        <File className="h-8 w-8 mx-auto text-green-600" />
                        <p className="text-sm font-medium">{formData.file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(formData.file.size / 1024).toFixed(2)} KB
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFormData({ ...formData, file: null })}
                        >
                          Cambiar archivo
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-8 w-8 mx-auto text-gray-400" />
                        <p className="text-sm">Selecciona un nuevo archivo</p>
                        <Input
                          id="edit-file"
                          type="file"
                          onChange={handleFileChange}
                          className="max-w-xs mx-auto"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setIsReplacingFile(false);
                    setEditingDocument(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isUploading}>
                  {isUploading ? "Actualizando..." : "Actualizar Documento"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Documents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocumentos?.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No hay documentos disponibles</p>
            </div>
          ) : (
            filteredDocumentos?.map((doc) => (
              <Card key={doc._id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getFileTypeIcon(doc.type)}</span>
                      <div>
                        <CardTitle className="text-lg">{doc.nombre}</CardTitle>
                        <CardDescription className="text-sm mt-1">
                          {doc.descripcion}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {doc.type && (
                      <Badge variant="outline">{doc.type}</Badge>
                    )}
                    
                    {/* Transaction Information */}
                    {(() => {
                      const transaction = getTransactionForDoc(doc.transaccion_id);
                      if (transaction) {
                        return (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-gray-700">
                              Transacción asociada
                            </p>
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-blue-700">Monto Total:</span>
                                  <span className="font-medium text-blue-900">{formatCurrency(transaction.monto_total)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-blue-700">Fecha:</span>
                                  <span className="font-medium text-blue-900">{transaction.fecha}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-blue-700">Tipo de pago:</span>
                                  <span className="font-medium text-blue-900 capitalize">{transaction.tipo_pago}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-blue-700">Estado:</span>
                                  <span className="font-medium text-blue-900">{transaction.status}</span>
                                </div>
                                {transaction.banco && (
                                  <div className="flex justify-between">
                                    <span className="text-blue-700">Banco:</span>
                                    <span className="font-medium text-blue-900">{transaction.banco}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => window.open(getFileUrl(doc.image), "_blank")}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Ver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => window.open(getFileDownloadUrl(doc.image), "_blank")}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Descargar
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleEditDocument(doc)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteDocument(doc)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
