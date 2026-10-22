import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useConvex, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PROGRAM_IMPORT_MAX_BYTES, type ProgramImportResult, type ProgramImportReview } from "../../../convex/programaObraImportValidators";
import { hashFile } from "@/lib/transactionImport";
import type { ExcelPartida, ExcelRow } from "./ProgramaObraExcelPreview";

const API_BASE_URL = "https://ogc-excel-reader.vercel.app";
type Feedback = {
  created: number; updated: number; unchanged?: number; activity_effects?: number; errors: string[];
  partidas?: { created: number; updated: number; unchanged?: number; skipped: number; total: number };
  familias?: { created: number; updated: number; unchanged?: number; skipped: number; total: number };
};
type Confirmation = {
  requestId: string; rows: ExcelRow[]; fingerprint: string; review: ProgramImportReview;
  attemptId?: Id<"programa_obra_import_attempts">;
};

export function useProgramaObraExcelImport(projectId: Id<"desarrollos"> | undefined) {
  const convex = useConvex();
  const start = useMutation(api.programaObraImportHistory.startAttempt);
  const attach = useMutation(api.programaObraImportHistory.attachFile);
  const fail = useMutation(api.programaObraImportHistory.failAttempt);
  const confirm = useAction(api.programaObraImportHistory.confirmImport);
  const [parsing, setParsing] = useState(false), [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<ExcelPartida[]>([]), [previewOpen, setPreviewOpen] = useState(false);
  const [importRows, setImportRows] = useState<ExcelRow[] | null>(null);
  const [uploadResult, setUploadResult] = useState<Feedback | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const original = useRef<{ file: File; sheet?: string } | null>(null);
  const reviewRef = useRef<ProgramImportReview>({ date_resolutions: [] });
  const confirmation = useRef<Confirmation | null>(null);
  const generation = useRef(0), locked = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    generation.current++; abortRef.current?.abort(); original.current = null; confirmation.current = null;
    reviewRef.current = { date_resolutions: [] }; locked.current = false;
    setPreviewOpen(false); setPreviewData([]); setImportRows(null); setUncertain(false); setParsing(false); setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);
  useEffect(() => {
    clear(); setUploadResult(null);
    return () => { generation.current++; abortRef.current?.abort(); original.current = null; confirmation.current = null; };
  }, [projectId, clear]);

  const handleExcelParse = useCallback(async (file: File) => {
    if (!projectId || locked.current) return;
    clear(); setUploadResult(null); setParsing(true); locked.current = true;
    const token = generation.current;
    const controller = new AbortController(); abortRef.current = controller;
    try {
      if (!/\.(xlsx|xls)$/i.test(file.name) || !file.size || file.size > PROGRAM_IMPORT_MAX_BYTES) throw new Error("Selecciona un Excel .xlsx o .xls de hasta 10 MB.");
      const form = new FormData(); form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/upload/programa-obra`, { method: "POST", body: form, signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo leer el Excel.");
      if (!data.partidas?.length) throw new Error("No se encontraron partidas en el archivo.");
      if (token !== generation.current) return;
      original.current = { file, sheet: typeof data.sheetName === "string" ? data.sheetName : undefined };
      setPreviewData(data.partidas); setPreviewOpen(true);
    } catch (error) {
      if (token === generation.current) setUploadResult({ created: 0, updated: 0, errors: [error instanceof Error ? error.message : "No se pudo leer el Excel."] });
    } finally {
      if (token === generation.current) { setParsing(false); locked.current = false; if (fileInputRef.current) fileInputRef.current.value = ""; }
    }
  }, [projectId, clear]);

  const handlePreviewConfirm = useCallback((rows: ExcelRow[], review: ProgramImportReview) => {
    reviewRef.current = review; setImportRows(rows); setPreviewOpen(false);
  }, []);

  const handleImportApply = useCallback(async (rows: ExcelRow[], fingerprint: string) => {
    if (!projectId || !original.current || locked.current) return;
    locked.current = true; setUploading(true); setUploadResult(null);
    const token = generation.current;
    const current = () => token === generation.current;
    const sourceFile = original.current;
    const command = confirmation.current ?? { requestId: crypto.randomUUID(), rows, fingerprint, review: reviewRef.current };
    confirmation.current = command;
    const payload = { proyecto: projectId, rows: command.rows, expected_fingerprint: command.fingerprint, review: command.review };
    const complete = (result: ProgramImportResult) => { if (current()) { clear(); setUploadResult(result); } };
    try {
      const fileHash = await hashFile(sourceFile.file);
      if (!current()) return;
      const started = await start({ ...payload, request_id: command.requestId,
        source: { file_name: sourceFile.file.name, file_hash: fileHash, sheet_name: sourceFile.sheet },
        size: sourceFile.file.size, content_type: sourceFile.file.type || "application/octet-stream" });
      command.attemptId = started.attempt_id;
      if (!current()) return;
      if (started.result) { complete(started.result); return; }
      if (started.status !== "processing") throw new Error(started.error || "El intento ya terminó. Inicia una nueva confirmación.");
      if (started.upload_url) {
        const controller = new AbortController(); abortRef.current = controller;
        let storageId: Id<"_storage">;
        try {
          const response = await fetch(started.upload_url, { method: "POST", headers: { "Content-Type": sourceFile.file.type || "application/octet-stream" }, body: sourceFile.file, signal: controller.signal });
          if (!response.ok) throw new Error("No se pudo guardar el archivo original.");
          storageId = (await response.json()).storageId;
          if (!storageId) throw new Error("El servidor no devolvió una referencia de archivo.");
          if (!current()) return;
          await attach({ attempt_id: started.attempt_id, storage_id: storageId });
        } catch (error) {
          if (!current()) return;
          const saved = await convex.query(api.programaObraImportHistory.getAttempt, { attempt_id: started.attempt_id });
          // An attachment response can be lost after the original was committed.
          if (!saved.storage_id) {
            await fail({ attempt_id: started.attempt_id, error: error instanceof Error ? error.message : "Falló el respaldo del archivo." });
            throw error;
          }
        }
      }
      if (!current()) return;
      const result = await confirm({ ...payload, attempt_id: started.attempt_id });
      complete(result);
    } catch (error) {
      if (!current()) return;
      let terminal = false;
      if (command.attemptId) {
        try {
          const saved = await convex.query(api.programaObraImportHistory.getAttempt, { attempt_id: command.attemptId });
          if (saved.result) { complete(saved.result); return; }
          terminal = saved.status !== "processing";
        } catch { /* Keep the confirmation ID until its result can be recovered. */ }
      }
      if (current()) {
        setUncertain(!terminal);
        setUploadResult({ created: 0, updated: 0, errors: [error instanceof Error ? error.message : "No se pudo comprobar el resultado de la carga."] });
        if (terminal) { confirmation.current = null; setImportRows(null); original.current = null; setPreviewData([]); }
      }
    } finally { if (current()) { setUploading(false); locked.current = false; } }
  }, [projectId, start, attach, fail, confirm, convex, clear]);

  const handlePreviewCancel = useCallback(() => {
    const pending = confirmation.current;
    if (pending?.attemptId && !uncertain) void fail({ attempt_id: pending.attemptId, error: "Carga cancelada antes de aplicar." }).catch(() => undefined);
    clear();
  }, [clear, fail, uncertain]);
  return { parsing, uploading, previewData, previewOpen, importRows, uploadResult, setUploadResult, fileInputRef,
    handleExcelParse, handlePreviewConfirm, handleImportApply, handlePreviewCancel, uncertain };
}
