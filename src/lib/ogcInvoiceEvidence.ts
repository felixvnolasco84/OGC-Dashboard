import type { Id } from "../../convex/_generated/dataModel";

export const MAX_OGC_INVOICE_FILE_SIZE = 20 * 1024 * 1024;
export const OGC_INVOICE_FILE_ACCEPT = "application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.bmp,.tif,.tiff";
const acceptedName = /\.(pdf|jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;
const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif",
  bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
};

export type OgcInvoiceProof = {
  storage_id: Id<"_storage">;
  nombre: string;
  type: string;
  size: number;
  uploaded_at: number;
};

export function validateOgcInvoiceFile(file: File): string | null {
  if (!acceptedName.test(file.name)) {
    return "Selecciona un PDF o una imagen.";
  }
  const contentType = file.type.toLowerCase();
  const genericType = !contentType || contentType === "application/octet-stream";
  const pdf = file.name.toLowerCase().endsWith(".pdf");
  if (!genericType && !(pdf
    ? contentType === "application/pdf" || contentType === "application/x-pdf"
    : contentType.startsWith("image/"))) {
    return "El tipo del archivo no coincide con su extensión.";
  }
  if (file.size <= 0 || file.size > MAX_OGC_INVOICE_FILE_SIZE) {
    return "El archivo debe pesar entre 1 byte y 20 MB.";
  }
  return null;
}

export async function uploadOgcInvoiceProof(
  file: File,
  generateUploadUrl: () => Promise<string>
): Promise<OgcInvoiceProof> {
  const validationError = validateOgcInvoiceFile(file);
  if (validationError) throw new Error(validationError);
  const uploadUrl = await generateUploadUrl();
  const extension = file.name.toLowerCase().split(".").pop() || "";
  const type = !file.type || file.type === "application/octet-stream" || file.type === "application/x-pdf"
    ? mimeByExtension[extension]
    : file.type;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": type },
    body: file,
  });
  if (!response.ok) throw new Error(`No se pudo subir ${file.name}.`);
  const body = await response.json();
  if (!body.storageId) throw new Error(`La carga de ${file.name} no devolvió un identificador.`);
  return {
    storage_id: body.storageId as Id<"_storage">,
    nombre: file.name,
    type,
    size: file.size,
    uploaded_at: Date.now(),
  };
}
