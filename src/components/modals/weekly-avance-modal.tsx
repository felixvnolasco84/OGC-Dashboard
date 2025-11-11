import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useWeeklyAvanceModal, WeeklyAvanceData } from "@/hooks/weekly-avance-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function WeeklyAvanceModal() {
  const { isOpen, onClose, context } = useWeeklyAvanceModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [weeklyData, setWeeklyData] = useState<WeeklyAvanceData[]>([]);

  // Query projected weeks for this project
  const projectedWeeks = useQuery(
    api.weekly_projected_totals.getByProject,
    context?.proyectoId ? { proyecto: context.proyectoId } : "skip"
  );

  // Query existing avance real data
  const existingAvanceData = useQuery(
    api.weekly_avance_real.getByProyecto,
    context?.proyectoId ? { proyecto: context.proyectoId } : "skip"
  );

  // Save mutation
  const saveMultipleWeeklyAvance = useMutation(
    api.weekly_avance_real.saveMultipleWeeklyAvance
  );

  // Helper: Convert Excel serial date to formatted date string
  const excelDateToString = (serial: number): string => {
    const date = new Date((serial - 25569) * 86400 * 1000);
    const day = date.getDate();
    const monthNames = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];
    const monthName = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${String(day).padStart(2, "0")} ${monthName} ${year}`;
  };

  // Initialize weekly data when modal opens
  useEffect(() => {
    if (projectedWeeks && existingAvanceData && isOpen) {
      // Create a map of existing avance data
      const existingMap = new Map(
        existingAvanceData.map((item: { week_date: number; avance_real: number }) => [item.week_date, item.avance_real])
      );

      // Create weekly data with existing values or 0
      const initialData: WeeklyAvanceData[] = projectedWeeks.map((week: { week_date: number; week_date_formatted: string }) => ({
        week_date: week.week_date,
        week_date_formatted: week.week_date_formatted || excelDateToString(week.week_date),
        avance_real: existingMap.get(week.week_date) || 0,
      }));

      // Sort by week_date
      initialData.sort((a, b) => a.week_date - b.week_date);

      setWeeklyData(initialData);
    }
  }, [projectedWeeks, existingAvanceData, isOpen]);

  const handleClose = () => {
    setWeeklyData([]);
    setIsSubmitting(false);
    onClose();
  };

  const handleAvanceChange = (weekDate: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    // Clamp between 0 and 100
    const clampedValue = Math.max(0, Math.min(100, numValue));

    setWeeklyData((prev) =>
      prev.map((week) =>
        week.week_date === weekDate
          ? { ...week, avance_real: clampedValue }
          : week
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context?.proyectoId) return;

    setIsSubmitting(true);

    try {
      // Only save weeks with non-zero avance values
      const dataToSave = weeklyData.filter((week) => week.avance_real > 0);

      if (dataToSave.length === 0) {
        toast.error("Agrega al menos un valor de avance");
        setIsSubmitting(false);
        return;
      }

      await saveMultipleWeeklyAvance({
        proyecto: context.proyectoId,
        avanceData: dataToSave,
      });

      toast.success(`Avance semanal guardado (${dataToSave.length} semanas)`);
      handleClose();
    } catch (error) {
      console.error("Error saving weekly avance:", error);
      toast.error("Error al guardar el avance semanal");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate average avance
  const averageAvance = weeklyData.length > 0
    ? weeklyData.reduce((sum, week) => sum + week.avance_real, 0) / weeklyData.length
    : 0;

  // Count weeks with data
  const weeksWithData = weeklyData.filter((week) => week.avance_real > 0).length;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Configurar Avance Real Semanal
          </DialogTitle>
          <DialogDescription>
            Define el porcentaje de avance real para cada semana del proyecto:{" "}
            <span className="font-medium">{context?.proyectoNombre}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-medium">Total Semanas</div>
            <div className="text-2xl font-bold text-blue-700">
              {weeklyData.length}
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600 font-medium">
              Con Datos
            </div>
            <div className="text-2xl font-bold text-green-700">
              {weeksWithData}
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="text-xs text-purple-600 font-medium">
              Promedio
            </div>
            <div className="text-2xl font-bold text-purple-700">
              {averageAvance.toFixed(1)}%
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Weekly Data Grid */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-4 py-2 grid grid-cols-2 gap-4 font-medium text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                Semana
              </div>
              <div>Avance Real (%)</div>
            </div>

            <div className="divide-y max-h-[400px] overflow-y-auto">
              {weeklyData.map((week, index) => (
                <div
                  key={week.week_date}
                  className={`px-4 py-3 grid grid-cols-2 gap-4 items-center hover:bg-gray-50 ${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                  }`}
                >
                  <div className="text-sm font-medium text-gray-700">
                    {week.week_date_formatted}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={week.avance_real || ""}
                      onChange={(e) =>
                        handleAvanceChange(week.week_date, e.target.value)
                      }
                      placeholder="0"
                      className="w-24"
                    />
                    <span className="text-sm text-gray-500">%</span>
                    {week.avance_real > 0 && (
                      <div className="flex-1 ml-2">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${week.avance_real}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {weeklyData.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">
                No hay semanas proyectadas para este proyecto
              </p>
              <p className="text-xs mt-1">
                Carga primero los datos de proyección semanal desde Admin
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || weeklyData.length === 0}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Avance
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
