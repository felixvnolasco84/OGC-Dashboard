import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { weeklyTotalsData, calculateTotal, getNonZeroEntries } from "@/utils/uploadWeeklyTotals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Upload, Trash2, BarChart3 } from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";

interface UploadWeeklyTotalsProps {
  proyectoId: Id<"desarrollos"> | null;
  proyectoNombre: string;
}

export function UploadWeeklyTotals({ proyectoId, proyectoNombre }: UploadWeeklyTotalsProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const uploadTotals = useMutation(api.weekly_projected_totals.uploadWeeklyTotals);
  const deleteTotals = useMutation(api.weekly_projected_totals.deleteByProject);

  const handleUpload = async () => {
    if (!proyectoId) {
      setUploadResult({ success: false, message: "Por favor selecciona un proyecto primero" });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const result = await uploadTotals({
        proyecto: proyectoId,
        weeklyData: weeklyTotalsData,
      });

      setUploadResult({
        success: true,
        message: result.message,
      });
    } catch (error) {
      setUploadResult({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!proyectoId) {
      setUploadResult({ success: false, message: "Por favor selecciona un proyecto primero" });
      return;
    }

    if (!confirm("¿Estás seguro de que quieres eliminar todos los totales semanales?")) {
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const result = await deleteTotals({
        proyecto: proyectoId,
      });

      setUploadResult({
        success: true,
        message: result.message,
      });
    } catch (error) {
      setUploadResult({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const totalAmount = calculateTotal();
  const nonZeroEntries = getNonZeroEntries();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Cargar Totales Semanales Proyectados
        </CardTitle>
        <CardDescription>
          Carga los totales semanales agregados de las proyecciones de tu Excel
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Total Semanas</p>
            <p className="text-2xl font-semibold">{weeklyTotalsData.length}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Semanas con Datos</p>
            <p className="text-2xl font-semibold">{nonZeroEntries.length}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Total Proyectado</p>
            <p className="text-lg font-semibold">
              ${new Intl.NumberFormat('es-MX').format(Math.round(totalAmount))}
            </p>
          </div>
        </div>

        {/* Project Selection Status */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Proyecto seleccionado:</strong>{' '}
            {proyectoId ? proyectoNombre : 'Ninguno'}
          </p>
          {!proyectoId && (
            <p className="text-xs text-blue-700 mt-1">
              Por favor selecciona un proyecto antes de cargar los datos.
            </p>
          )}
        </div>

        {/* Data Preview */}
        <div>
          <p className="text-sm font-medium mb-2">Vista previa de datos:</p>
          <div className="bg-gray-50 p-4 rounded-lg max-h-48 overflow-y-auto">
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between border-b pb-1 mb-2">
                <span className="font-semibold">Fecha</span>
                <span className="font-semibold">Monto</span>
              </div>
              {weeklyTotalsData.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.date}</span>
                  <span>{item.amount}</span>
                </div>
              ))}
              <p className="text-center text-gray-500 pt-2">
                ... y {weeklyTotalsData.length - 5} semanas más
              </p>
            </div>
          </div>
        </div>

        {/* Upload Result */}
        {uploadResult && (
          <Alert variant={uploadResult.success ? "default" : "destructive"}>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{uploadResult.message}</AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleUpload}
            disabled={isUploading || !proyectoId}
            className="flex-1"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isUploading ? 'Cargando...' : 'Cargar Datos'}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isUploading || !proyectoId}
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
        </div>

        {/* Instructions */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-xs text-yellow-900">
            <strong>Nota:</strong> Este proceso reemplazará todos los totales semanales existentes
            para el proyecto seleccionado. Los datos se cargarán automáticamente desde el archivo
            de configuración.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
