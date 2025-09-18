import { useState } from 'react';
import { useEdgeStore } from '@/lib/edgestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, FileText, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
    label: string;
    value?: string;
    onChange: (url: string) => void;
    accept?: string;
    maxSize?: number;
    className?: string;
    placeholder?: string;
}

export function FileUpload({
    label,
    value,
    onChange,
    accept = "image/*,application/pdf,.txt,.doc,.docx",
    maxSize = 10 * 1024 * 1024, // 10MB
    className,
    placeholder = "Seleccionar archivo..."
}: FileUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const { edgestore } = useEdgeStore();

    const handleFileUpload = async (file: File) => {
        if (!file) return;

        if (file.size > maxSize) {
            alert(`El archivo es demasiado grande. Tamaño máximo: ${maxSize / (1024 * 1024)}MB`);
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const res = await edgestore.publicFiles.upload({
                file,
                onProgressChange: (progress) => {
                    setUploadProgress(progress);
                },
            });

            onChange(res.url);
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Error al subir el archivo. Por favor, intenta de nuevo.');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            handleFileUpload(file);
        }
    };

    const handleRemoveFile = () => {
        onChange('');
    };

    const getFileName = (url: string) => {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            return pathname.split('/').pop() || 'archivo';
        } catch {
            return 'archivo';
        }
    };

    const openFile = () => {
        if (value) {
            window.open(value, '_blank');
        }
    };

    return (
        <div className={cn("space-y-2", className)}>
            <Label>{label}</Label>

            {value ? (
                <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-md bg-gray-50">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="flex-1 text-sm text-gray-700 truncate">
                        {getFileName(value)}
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={openFile}
                        className="h-8 w-8 p-0"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFile}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <div className="relative">
                    <Input
                        type="file"
                        accept={accept}
                        onChange={handleFileSelect}
                        disabled={isUploading}
                        className="hidden"
                        id={`file-upload-${label}`}
                    />
                    <Label
                        htmlFor={`file-upload-${label}`}
                        className={cn(
                            "flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-md cursor-pointer hover:border-gray-400 transition-colors",
                            isUploading && "pointer-events-none opacity-50"
                        )}
                    >
                        <Upload className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-600">
                            {isUploading ? `Subiendo... ${uploadProgress}%` : placeholder}
                        </span>
                    </Label>

                    {isUploading && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 rounded-b-md overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
