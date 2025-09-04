import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const ExcelUploaderSection = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Configuración de la API - ajustar según tu backend
  const API_BASE_URL = 'http://localhost:5069/api'; // Cambiar por tu URL

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
        setResult(null);
      }
    }
  }, []);

  const validateFile = (file) => {
    if (!file) return false;

    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    if (!validExtensions.includes(fileExtension)) {
      setResult({
        success: false,
        message: 'Solo se permiten archivos Excel (.xlsx, .xls).'
      });
      return false;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      setResult({
        success: false,
        message: 'El archivo excede el tamaño máximo permitido (10MB).'
      });
      return false;
    }

    return true;
  };

  const handleFileInput = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const uploadFile = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/excel/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          data: data,
          message: 'Archivo procesado exitosamente'
        });
      } else {
        setResult({
          success: false,
          message: data.message || 'Error al procesar el archivo',
          errors: data.errors || []
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Error de conexión con el servidor',
        errors: [error.message]
      });
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setResult(null);
    setUploading(false);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSuccessRate = () => {
    if (!result?.data) return 0;
    const total = result.data.totalRecords || 1;
    return Math.round((result.data.successfulRecords / total) * 100);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Subir Archivo Excel</h1>
        <p className="text-gray-600">Sube tu archivo Excel para procesarlo automáticamente</p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Seleccionar Archivo
          </CardTitle>
          <CardDescription>
            Arrastra y suelta tu archivo Excel aquí o haz clic para seleccionar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                ? 'border-blue-500 bg-blue-50'
                : file
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button onClick={uploadFile} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Subir Archivo
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={resetUpload} disabled={uploading}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <Upload className="h-12 w-12 text-gray-400" />
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-900">
                    Selecciona un archivo Excel
                  </p>
                  <p className="text-gray-500">Archivos soportados: .xlsx, .xls (máx. 10MB)</p>
                </div>
                <div>
                  <label htmlFor="file-upload">
                    <Button variant="outline" className="cursor-pointer">
                      Explorar Archivos
                    </Button>
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress Bar */}
      {uploading && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Procesando archivo...</span>
                <span>Por favor espera</span>
              </div>
              <Progress value={45} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Resultado del Procesamiento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.success ? (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>¡Éxito!</AlertTitle>
                  <AlertDescription>{result.message}</AlertDescription>
                </Alert>

                {result.data && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {result.data.successfulRecords || 0}
                      </div>
                      <div className="text-sm text-green-700">Registros exitosos</div>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">
                        {result.data.failedRecords || 0}
                      </div>
                      <div className="text-sm text-red-700">Registros fallidos</div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {result.data.totalRecords || 0}
                      </div>
                      <div className="text-sm text-blue-700">Total procesados</div>
                    </div>
                  </div>
                )}

                {result.data && result.data.totalRecords > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Tasa de éxito</span>
                      <span>{getSuccessRate()}%</span>
                    </div>
                    <Progress value={getSuccessRate()} className="h-2" />
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Badge variant="outline">
                    {result.data?.fileName || file?.name}
                  </Badge>
                  <span>•</span>
                  <span>
                    Procesado el {new Date(result.data?.processedAt || Date.now()).toLocaleString('es-ES')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{result.message}</AlertDescription>
                </Alert>

                {result.errors && result.errors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">Detalles del error:</h4>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                      {result.errors.map((error, index) => (
                        <div key={index} className="text-sm text-red-700 mb-1">
                          • {error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Separator />

            <div className="flex gap-2">
              <Button onClick={resetUpload} variant="outline">
                Subir Otro Archivo
              </Button>
              {result.success && (
                <Button variant="default">
                  Ver Registros Procesados
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Instrucciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• Asegúrate de que tu archivo Excel tenga el formato correcto</li>
            <li>• La primera fila debe contener los encabezados: PARTIDA, FAMILIA, SUBPARTIDA, etc.</li>
            <li>• El archivo no debe exceder los 10MB de tamaño</li>
            <li>• Solo se aceptan archivos con extensión .xlsx o .xls</li>
            <li>• Los registros duplicados serán ignorados automáticamente</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExcelUploaderSection;