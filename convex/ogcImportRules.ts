export const OGC_IMPORT_MAX_FILE_SIZE = 20 * 1024 * 1024;
export const OGC_IMPORT_LEASE_MS = 10 * 60 * 1000;

const OGC_IMPORT_EXTENSIONS = [".xlsx", ".xls", ".xlsm"];

export const isValidOgcImportFile = (name: string, size: number, fileHash: string) => {
  return OGC_IMPORT_EXTENSIONS.some((extension) => name.trim().toLowerCase().endsWith(extension)) &&
    Number.isFinite(size) &&
    size > 0 &&
    size <= OGC_IMPORT_MAX_FILE_SIZE &&
    /^[a-f0-9]{64}$/.test(fileHash.trim().toLowerCase());
};

export const isOgcImportLeaseActive = (
  status: string,
  updatedAt: number,
  now: number
) => status === "procesando" && updatedAt > now - OGC_IMPORT_LEASE_MS;

type DuplicateSource = {
  importacionId?: string;
  filaOrigen?: number;
};

export const classifyOgcImportDuplicate = (
  duplicates: DuplicateSource[],
  importacionId: string | undefined,
  filaOrigen: number | undefined
): "already_imported" | "external_duplicate" | "create" => {
  if (!importacionId) return duplicates.length > 0 ? "external_duplicate" : "create";

  if (filaOrigen != null && duplicates.some((movement) => (
    movement.importacionId === importacionId && movement.filaOrigen === filaOrigen
  ))) {
    return "already_imported";
  }

  return duplicates.some((movement) => movement.importacionId !== importacionId)
    ? "external_duplicate"
    : "create";
};

export const getOgcImportCompletionStatus = ({
  totalRows,
  linkedMovements,
  skippedDuplicates,
  rejectedRows,
}: {
  totalRows: number;
  linkedMovements: number;
  skippedDuplicates: number;
  rejectedRows: number;
}): "completada" | "parcial" => {
  return skippedDuplicates > 0 || rejectedRows > 0 || linkedMovements < totalRows
    ? "parcial"
    : "completada";
};
