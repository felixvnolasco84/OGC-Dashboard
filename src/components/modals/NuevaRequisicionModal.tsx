import { X, Plus, Trash2, Upload, Loader2, Check } from "lucide-react";
import { useNuevaRequisicionModal } from "../../hooks/nueva-requisicion-modal";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Id } from "../../../convex/_generated/dataModel";
import { useUser } from "@clerk/clerk-react";

export default function NuevaRequisicionModal() {
  const { user } = useUser();
  const {
    isOpen,
    onClose,
    context,
    tipo,
    items,
    proveedor_id,
    fecha_entrega,
    descripcion,
    setTipo,
    setProveedorId,
    setFechaEntrega,
    setDescripcion,
    addItem,
    removeItem,
    updateItem,
  } = useNuevaRequisicionModal();

  const createRequisicion = useMutation(api.requisiciones.create);
  const currentUser = useQuery(api.users.getCurrentUser);
  
  // Fetch partidas (nivel 1) for the project
  const partidas = useQuery(
    api.partida.getByNivel,
    context?.projectId ? { proyecto: context.projectId, nivel: 1 } : "skip"
  );
  
  // Fetch all partidas for cascading selects
  const allPartidas = useQuery(
    api.partida.getByProject,
    context?.projectId ? { projectId: context.projectId } : "skip"
  );
  
  // Fetch proveedores
  const proveedores = useQuery(api.proveedores.getAll);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get unique familias for a given partida
  const getFamiliasForPartida = (partidaNombre: string) => {
    if (!allPartidas) return [];
    return allPartidas
      .filter(p => p.nivel === 2 && p.partida_nombre === partidaNombre)
      .map(p => p.familia)
      .filter((v, i, a) => a.indexOf(v) === i);
  };

  // Get sub-partidas for a given partida + familia
  const getSubPartidasForFamilia = (partidaNombre: string, familia: string) => {
    if (!allPartidas) return [];
    return allPartidas.filter(
      p => p.nivel === 3 && p.partida_nombre === partidaNombre && p.familia === familia
    );
  };

  // Get budget info for selection
  const getBudgetInfo = (partidaNombre: string, familia?: string, subPartida?: string) => {
    if (!allPartidas) return null;
    
    let match;
    if (subPartida) {
      match = allPartidas.find(
        p => p.nivel === 3 && p.partida_nombre === partidaNombre && 
             p.familia === familia && p.sub_partida === subPartida
      );
    } else if (familia) {
      match = allPartidas.find(
        p => p.nivel === 2 && p.partida_nombre === partidaNombre && p.familia === familia
      );
    } else {
      match = allPartidas.find(
        p => p.nivel === 1 && p.nombre === partidaNombre
      );
    }
    
    if (!match) return null;
    return {
      presupuesto_aprobado: match.presupuesto_aprobado,
      pagado: match.pagado,
      por_gastar: match.por_gastar ?? (match.presupuesto_aprobado - match.pagado),
      unidad: match.unidad,
      partida_id: match._id,
    };
  };

  // Handle partida selection change
  const handlePartidaChange = (itemId: string, partidaNombre: string) => {
    const partida = partidas?.find(p => p.nombre === partidaNombre);
    updateItem(itemId, {
      partida_nombre: partidaNombre,
      partida_id: partida?._id || "",
      familia: "",
      sub_partida: "",
      unidad: partida?.unidad || "",
    });
  };

  // Handle familia selection change
  const handleFamiliaChange = (itemId: string, partidaNombre: string, familia: string) => {
    const budgetInfo = getBudgetInfo(partidaNombre, familia);
    updateItem(itemId, {
      familia,
      sub_partida: "",
      unidad: budgetInfo?.unidad || "",
      presupuesto_aprobado: budgetInfo?.presupuesto_aprobado,
      pagado: budgetInfo?.pagado,
      por_gastar: budgetInfo?.por_gastar,
    });
  };

  // Handle sub-partida selection change
  const handleSubPartidaChange = (itemId: string, partidaNombre: string, familia: string, subPartida: string) => {
    const budgetInfo = getBudgetInfo(partidaNombre, familia, subPartida);
    updateItem(itemId, {
      sub_partida: subPartida,
      partida_id: budgetInfo?.partida_id || "",
      unidad: budgetInfo?.unidad || "",
      presupuesto_aprobado: budgetInfo?.presupuesto_aprobado,
      pagado: budgetInfo?.pagado,
      por_gastar: budgetInfo?.por_gastar,
    });
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploadedFiles(prev => [...prev, ...Array.from(files)]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  // Check if form is valid
  const isFormValid = () => {
    if (items.length === 0) return false;
    return items.every(item => 
      item.partida_id && 
      item.partida_nombre && 
      item.familia && 
      item.cantidad > 0 && 
      item.unidad
    );
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!context?.projectId || !currentUser || !isFormValid()) return;

    setIsSubmitting(true);
    try {
      // Format date
      const today = new Date();
      const fechaSolicitud = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

      // Create requisicion
      await createRequisicion({
        proyecto: context.projectId,
        tipo,
        solicitante_id: currentUser._id,
        solicitante_nombre: currentUser.name,
        proveedor_id: proveedor_id || undefined,
        fecha_solicitud: fechaSolicitud,
        fecha_entrega: fecha_entrega || undefined,
        descripcion: descripcion || undefined,
        items: items.map(item => ({
          partida_id: item.partida_id as Id<"partidas">,
          familia: item.familia,
          sub_partida: item.sub_partida || undefined,
          cantidad: item.cantidad,
          unidad: item.unidad,
          monto: item.monto,
        })),
      });

      handleClose();
    } catch (error) {
      console.error("Error creating requisicion:", error);
      alert("Error al crear la requisición");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setUploadedFiles([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex flex-row">
            <div className="flex items-center justify-end gap-2 text-sm text-gray-500 mb-2">
              <span>Solicita</span>
              <span className="font-medium text-gray-900">{user?.fullName || currentUser?.name}</span>
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
                {(user?.fullName || currentUser?.name || "U").charAt(0).toUpperCase()}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Nueva Requisición</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">
            {/* Type Toggle */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setTipo("material")}
                className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all ${
                  tipo === "material"
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  tipo === "material" ? "border-green-500 bg-green-500" : "border-gray-300"
                }`}>
                  {tipo === "material" && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="font-medium">Material</span>
              </button>
              <button
                type="button"
                onClick={() => setTipo("equipo")}
                className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all ${
                  tipo === "equipo"
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  tipo === "equipo" ? "border-green-500 bg-green-500" : "border-gray-300"
                }`}>
                  {tipo === "equipo" && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="font-medium">Equipo</span>
              </button>
            </div>

            {/* Line Items */}
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="space-y-3">
                  {/* Partida Select */}
                  <Select
                    value={item.partida_nombre}
                    onValueChange={(value) => handlePartidaChange(item.id, value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona Partida" />
                    </SelectTrigger>
                    <SelectContent>
                      {partidas?.map((partida) => (
                        <SelectItem key={partida._id} value={partida.nombre}>
                          {partida.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Familia Select */}
                  {item.partida_nombre && (
                    <Select
                      value={item.familia}
                      onValueChange={(value) => handleFamiliaChange(item.id, item.partida_nombre, value)}
                    >
                      <SelectTrigger className="w-full bg-orange-50 border-orange-200">
                        <SelectValue placeholder="Selecciona Familia" />
                      </SelectTrigger>
                      <SelectContent>
                        {getFamiliasForPartida(item.partida_nombre).map((familia) => (
                          <SelectItem key={familia} value={familia}>
                            {familia}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Sub-partida and Quantity */}
                  {item.familia && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
                      {/* Sub-partida rows */}
                      {getSubPartidasForFamilia(item.partida_nombre, item.familia).length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Select
                              value={item.sub_partida}
                              onValueChange={(value) => handleSubPartidaChange(item.id, item.partida_nombre, item.familia, value)}
                            >
                              <SelectTrigger className="flex-1 bg-white">
                                <SelectValue placeholder="Selecciona Sub-partida" />
                              </SelectTrigger>
                              <SelectContent>
                                {getSubPartidasForFamilia(item.partida_nombre, item.familia).map((sp) => (
                                  <SelectItem key={sp._id} value={sp.sub_partida}>
                                    {sp.sub_partida}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={item.cantidad || ""}
                                onChange={(e) => updateItem(item.id, { cantidad: parseFloat(e.target.value) || 0 })}
                                className="w-20 bg-orange-100 border-orange-300 text-right"
                                placeholder="0"
                              />
                              <Input
                                type="text"
                                value={item.unidad}
                                onChange={(e) => updateItem(item.id, { unidad: e.target.value })}
                                className="w-16 bg-white text-center text-sm"
                                placeholder="UND"
                              />
                            </div>
                          </div>
                          
                          {/* Budget indicator */}
                          {item.por_gastar !== undefined && (
                            <div className="text-xs text-gray-600 flex justify-between">
                              <span>Disponible: {formatCurrency(item.por_gastar)}</span>
                              {item.por_gastar < 0 && (
                                <span className="text-red-500 font-medium">⚠️ Excede presupuesto</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        // Custom text input when no sub-partidas exist
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              value={item.sub_partida}
                              onChange={(e) => updateItem(item.id, { sub_partida: e.target.value })}
                              className="flex-1 bg-white"
                              placeholder="Escribe el material..."
                            />
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={item.cantidad || ""}
                                onChange={(e) => updateItem(item.id, { cantidad: parseFloat(e.target.value) || 0 })}
                                className="w-20 bg-orange-100 border-orange-300 text-right"
                                placeholder="0"
                              />
                              <Input
                                type="text"
                                value={item.unidad}
                                onChange={(e) => updateItem(item.id, { unidad: e.target.value })}
                                className="w-16 bg-white text-center text-sm"
                                placeholder="UND"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Add more items button */}
                      <button
                        type="button"
                        onClick={addItem}
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mt-2"
                      >
                        <span>Agregar Partida</span>
                        <Plus className="h-4 w-4" />
                      </button>

                      {/* Optional Monto */}
                      <div className="flex justify-end">
                        <Input
                          type="number"
                          value={item.monto || ""}
                          onChange={(e) => updateItem(item.id, { monto: parseFloat(e.target.value) || undefined })}
                          className="w-32 bg-white text-right"
                          placeholder="Monto"
                        />
                      </div>
                    </div>
                  )}

                  {/* Remove item button */}
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Proveedor and Fecha de entrega */}
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={proveedor_id || ""}
                onValueChange={(value) => setProveedorId(value as Id<"proveedores"> | "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Proveedor Sugerido" />
                </SelectTrigger>
                <SelectContent>
                  {proveedores?.map((proveedor) => (
                    <SelectItem key={proveedor._id} value={proveedor._id}>
                      {proveedor.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={fecha_entrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                className="w-full"
                placeholder="Fecha de entrega"
              />
            </div>

            {/* Descripción */}
            <div>
              <Label className="text-base font-semibold mb-2 block">Descripción</Label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Comentarios..."
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Soporte - File Upload */}
            <div>
              <Label className="text-base font-semibold mb-2 block">Soporte</Label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Agregar archivo</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
              </div>
              
              {/* Uploaded files list */}
              {uploadedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <X className="h-4 w-4 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !isFormValid()}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar solicitud
          </button>
        </div>
      </div>
    </div>
  );
}
