import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, BarChart3 } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

interface APIResponse {
  success: boolean;
  fileName: string;
  sheetName: string;
  summary: {
    totalFlujos: number;
    totalPeriods: number;
    grandTotal: number;
    startDate: string;
    endDate: string;
    dateRange: string[];
  };
  weekHeaders: Array<{
    columnIndex: number;
    columnLetter: string;
    weekDate: string;
    weekDateRaw: number;
    position: number;
  }>;
  flujos: Array<{
    rowIndex: number;
    label: string;
    declaredTotal: number;
    calculatedTotal: number;
    total: number;
    weeklyAmounts: Array<{
      week: string;
      columnLetter: string;
      amount: number;
      position: number;
    }>;
    periodCount: number;
  }>;
}

export default function AdminSalesFlujoPage() {
  const [selectedProyectoId, setSelectedProyectoId] = useState<Id<"sales_projects"> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiResponse, setApiResponse] = useState<APIResponse | null>(null);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Fetch all sales projects
  const salesProyectos = useQuery(api.sales_projects.getAll);
  
  // Get selected project name
  const selectedProyecto = salesProyectos?.find(p => p._id === selectedProyectoId);

  // Convex mutation
  const uploadProjections = useMutation(api.sales_projected_transactions.uploadSalesProjections);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedProyectoId) {
      setUploadResult({ success: false, message: "Por favor selecciona un proyecto primero" });
      return;
    }

    setIsProcessing(true);
    setUploadResult(null);
    setApiResponse(null);

    try {
      // Create FormData and send to API
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('https://ogc-excel-reader.vercel.app/upload/flujo', {
        method: 'POST',
        body: formData,
      });
      
      console.log(response);

      if (!response.ok) {
        throw new Error('Error processing file');
      }

      const data: APIResponse = await response.json();
      console.log('API Response:', data);
      console.log('Week Headers:', data.weekHeaders);
      console.log('First Flujo:', data.flujos[0]);
      setApiResponse(data);

      // Transform API response to match Convex mutation format
      const projections = data.flujos
        .map((flujo) => {
          console.log('Processing flujo:', flujo.label);
          
          const validWeeklyProjections = flujo.weeklyAmounts
            .map((weekly) => {
              // Find the corresponding week header to get the raw date
              const weekHeader = data.weekHeaders.find(h => h.weekDate === weekly.week);
              const weekDate = weekHeader?.weekDateRaw;
              
              // Log if we can't find a matching week header
              if (!weekHeader) {
                console.warn('No week header found for:', weekly.week, 'in flujo:', flujo.label);
              }
              
              // Validate that we have a valid numeric week date
              if (typeof weekDate !== 'number' || isNaN(weekDate)) {
                console.error('Invalid week date:', weekDate, 'for week:', weekly.week);
                return null; // Will be filtered out
              }
              
              return {
                week: weekDate,
                columnLetter: weekly.columnLetter,
                amount: weekly.amount,
                position: weekly.position,
              };
            })
            .filter((projection): projection is NonNullable<typeof projection> => projection !== null); // Remove invalid entries
          
          return {
            partida: flujo.label,
            total: flujo.total,
            calculatedTotal: flujo.calculatedTotal,
            rowIndex: flujo.rowIndex,
            projectionCount: flujo.periodCount,
            weeklyProjections: validWeeklyProjections,
          };
        })
        .filter(flujo => flujo.weeklyProjections.length > 0); // Only include flujos with valid projections
      
      console.log('Transformed projections:', projections);
      console.log('Total valid flujos:', projections.length);

      // Check if any flujos were filtered out
      const filteredCount = data.flujos.length - projections.length;
      if (filteredCount > 0) {
        console.warn(`${filteredCount} flujo(s) were filtered out due to invalid week dates`);
      }

      // Upload to Convex
      const result = await uploadProjections({
        sales_proyecto: selectedProyectoId,
        fileName: data.fileName,
        sheetName: data.sheetName,
        projections,
      });

      let successMessage = result.message;
      if (filteredCount > 0) {
        successMessage += ` (${filteredCount} flujo(s) con datos inválidos fueron omitidos)`;
      }

      setUploadResult({
        success: true,
        message: successMessage,
      });
    } catch (error) {
      setUploadResult({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsProcessing(false);
      // Reset file input
      event.target.value = '';
    }
  };

  return (
    <div className="bg-card px-12 py-6 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <h1 className="text-2xl text-foreground mb-2">Flujo de Caja Proyectado - Ventas</h1>
          <p className="text-sm text-subtle-foreground">
            Carga un archivo Excel con las proyecciones de flujo de caja semanal para proyectos de ventas
          </p>
        </div>

        {/* Project Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Seleccionar Proyecto de Ventas</CardTitle>
            <CardDescription>Elige el proyecto de ventas para el cual deseas cargar las proyecciones</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedProyectoId || undefined}
              onValueChange={(value) => setSelectedProyectoId(value as Id<"sales_projects">)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un proyecto de ventas" />
              </SelectTrigger>
              <SelectContent>
                {salesProyectos?.map((proyecto) => (
                  <SelectItem key={proyecto._id} value={proyecto._id}>
                    {proyecto.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedProyecto && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Proyecto seleccionado:</strong> {selectedProyecto.nombre}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Cargar Archivo Excel
            </CardTitle>
            <CardDescription>
              El archivo debe contener las proyecciones semanales de flujo de caja de ventas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-border-strong rounded-lg p-8 text-center hover:border-border-strong transition-colors">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={!selectedProyectoId || isProcessing}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer ${(!selectedProyectoId || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-disabled-foreground" />
                <p className="text-sm text-muted-foreground mb-1">
                  {isProcessing ? 'Procesando...' : 'Haz clic para seleccionar un archivo'}
                </p>
                <p className="text-xs text-subtle-foreground">
                  Archivos Excel (.xlsx, .xls)
                </p>
              </label>
            </div>

            {!selectedProyectoId && (
              <Alert>
                <AlertDescription className="text-sm">
                  Por favor selecciona un proyecto de ventas antes de cargar el archivo
                </AlertDescription>
              </Alert>
            )}

            {isProcessing && (
              <div className="flex items-center justify-center gap-2 text-blue-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Procesando archivo...</span>
              </div>
            )}

            {uploadResult && (
              <Alert variant={uploadResult.success ? "default" : "destructive"}>
                {uploadResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>{uploadResult.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* API Response Summary */}
        {apiResponse && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Resumen de Datos Cargados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-background p-4 rounded-lg">
                  <p className="text-xs text-subtle-foreground mb-1">Archivo</p>
                  <p className="text-sm font-medium truncate" title={apiResponse.fileName}>
                    {apiResponse.fileName}
                  </p>
                </div>
                <div className="bg-background p-4 rounded-lg">
                  <p className="text-xs text-subtle-foreground mb-1">Total Flujos</p>
                  <p className="text-2xl font-semibold">{apiResponse.summary.totalFlujos}</p>
                </div>
                <div className="bg-background p-4 rounded-lg">
                  <p className="text-xs text-subtle-foreground mb-1">Períodos</p>
                  <p className="text-2xl font-semibold">{apiResponse.summary.totalPeriods}</p>
                </div>
                <div className="bg-background p-4 rounded-lg">
                  <p className="text-xs text-subtle-foreground mb-1">Total Proyectado</p>
                  <p className="text-lg font-semibold">
                    ${new Intl.NumberFormat('es-MX').format(Math.round(apiResponse.summary.grandTotal))}
                  </p>
                </div>
              </div>

              {/* Date Range */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Rango de fechas:</strong> {apiResponse.summary.startDate} - {apiResponse.summary.endDate}
                </p>
              </div>

              {/* Flujos List */}
              <div>
                <p className="text-sm font-medium mb-2">Flujos identificados:</p>
                <div className="space-y-2">
                  {apiResponse.flujos.map((flujo, idx) => (
                    <div key={idx} className="bg-background p-3 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">{flujo.label}</p>
                        <p className="text-xs text-subtle-foreground">{flujo.periodCount} períodos</p>
                      </div>
                      <p className="text-sm font-semibold">
                        ${new Intl.NumberFormat('es-MX').format(Math.round(flujo.total))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <CardContent className="pt-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-900 mb-2">
                <strong>Instrucciones:</strong>
              </p>
              <ul className="text-xs text-yellow-800 space-y-1 list-disc list-inside">
                <li>Selecciona el proyecto de ventas al cual pertenecen las proyecciones</li>
                <li>Carga un archivo Excel con las proyecciones semanales de cobros</li>
                <li>El sistema procesará automáticamente el archivo y guardará los datos</li>
                <li>Las proyecciones anteriores del mismo proyecto serán reemplazadas</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
