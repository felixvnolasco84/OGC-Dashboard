import { useProgramaObraExcelImport as useRealImport } from "../../src/pages/Programa Obra/useProgramaObraExcelImport";

// Busy states without selecting, sending, parsing or applying any file.
export function useProgramaObraExcelImport(...args: Parameters<typeof useRealImport>) {
  const original = useRealImport(...args);
  const busy = new URLSearchParams(location.search).get("busy");
  return { ...original, parsing: busy === "parsing", uploading: busy === "uploading" };
}
