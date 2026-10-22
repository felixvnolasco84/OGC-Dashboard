import { useRef, useState } from "react";
import { useAction, useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { IncomeImportResult } from "../../convex/incomeImportValidators";
import { hashFile } from "@/lib/transactionImport";

export function incomePendingKey(projectId: string, userId: string) { return `income-import:${userId}:${projectId}`; }
export function readIncomePending(projectId: string, userId: string): string | null {
  try { return sessionStorage.getItem(incomePendingKey(projectId, userId)); } catch { return null; }
}

// A pointer is enough: the immutable review lives on the server. No financial
// rows or File bytes are persisted in browser storage.
export function useIncomeImport(projectId: Id<"desarrollos">, userId: string, onResult: (result: IncomeImportResult) => void) {
  const convex = useConvex();
  const start = useMutation(api.incomeImportHistory.startAttempt);
  const prepare = useMutation(api.incomeImportHistory.prepareUpload);
  const attach = useMutation(api.incomeImportHistory.attachFile);
  const fail = useMutation(api.incomeImportHistory.failAttempt);
  const transferError = useMutation(api.incomeImportHistory.recordTransferError);
  const confirm = useAction(api.incomeImportHistory.confirmImport);
  const processing = useRef(false);
  const requestRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = incomePendingKey(projectId, userId);
  const savePointer = (request: string | null) => {
    requestRef.current = request;
    try { if (request) sessionStorage.setItem(key, request); else sessionStorage.removeItem(key); } catch { /* The ref still protects retries in this mounted view. */ }
  };
  const run = async ({ file, reviewJson, attemptId }: { file?: File; reviewJson?: string; attemptId?: Id<"income_import_attempts"> } = {}) => {
    if (processing.current) return;
    processing.current = true;
    setBusy(true); setError(null);
    let id = attemptId;
    let submitted = false;
    try {
      const request = requestRef.current || readIncomePending(projectId, userId);
      let attempt = id ? await convex.query(api.incomeImportHistory.getAttempt, { attempt_id: id })
        : request ? await convex.query(api.incomeImportHistory.getRequestAttempt, { proyecto: projectId, request_id: request }) : null;
      if (!attempt) {
        if (!file || !reviewJson) throw new Error("Selecciona y valida el Excel para continuar este intento.");
        const requestId = request || crypto.randomUUID();
        savePointer(requestId); // Persist before start: its response can also be lost.
        const started = await start({ proyecto: projectId, request_id: requestId, file_name: file.name, file_hash: await hashFile(file), size: file.size, content_type: file.type || "application/octet-stream", review_json: reviewJson });
        id = started.attempt_id;
        attempt = await convex.query(api.incomeImportHistory.getAttempt, { attempt_id: id });
      }
      id = attempt._id;
      savePointer(attempt.request_id);
      if (attempt.result) { savePointer(null); onResult(attempt.result); return attempt.result; }
      if (attempt.status !== "processing") { savePointer(null); throw new Error(attempt.error || "El intento terminó. Inicia una nueva carga."); }
      if (!attempt.can_resume) throw new Error("Solo quien inició la carga puede continuarla.");
      const upload = await prepare({ attempt_id: id });
      if (upload.upload_url) {
        if (!file) throw new Error("Selecciona el mismo Excel para completar su respaldo. La vista previa ya está guardada.");
        if (file.size !== attempt.size || await hashFile(file) !== attempt.file_hash) throw new Error("Selecciona el Excel original de este intento; el archivo elegido tiene otros bytes.");
        const response = await fetch(upload.upload_url, { method: "POST", body: file, headers: { "Content-Type": upload.content_type } });
        if (!response.ok) throw new Error("No fue posible guardar el Excel original. No se crearon ingresos.");
        const { storageId } = await response.json();
        if (typeof storageId !== "string") throw new Error("El almacenamiento no devolvió la referencia del Excel.");
        await attach({ attempt_id: id, storage_id: storageId as Id<"_storage"> });
      }
      submitted = true;
      const result = upload.result || await confirm({ attempt_id: id });
      savePointer(null); onResult(result); return result;
    } catch (cause) {
      let message = cause instanceof Error ? cause.message : "No se pudo completar la carga.";
      // An ambiguous transport failure never converts a committed import to a
      // failure or creates another request. Reconcile its saved result first.
      try {
        const request = requestRef.current || readIncomePending(projectId, userId);
        const attempt = id ? await convex.query(api.incomeImportHistory.getAttempt, { attempt_id: id })
          : request ? await convex.query(api.incomeImportHistory.getRequestAttempt, { proyecto: projectId, request_id: request }) : null;
        if (attempt?.result) { savePointer(null); onResult(attempt.result); return attempt.result; }
        if (attempt?.status === "processing" && !submitted) await transferError({ attempt_id: attempt._id, error: message });
        if (attempt && attempt.status !== "processing") savePointer(null);
        // A failed upload remains resumable until expiration. A financial
        // rejection is already persisted by confirmImport outside its rollback.
        if (!attempt && !submitted) savePointer(null);
      } catch { message += " Consulta el historial para recuperar el resultado."; }
      setError(message);
    } finally { processing.current = false; setBusy(false); }
  };
  const cancel = async (attemptId: Id<"income_import_attempts">) => {
    if (processing.current) return;
    const committed = await fail({ attempt_id: attemptId, error: "Carga descartada por quien la inició. No se crearon ingresos." });
    savePointer(null);
    if (committed) onResult(committed);
  };
  return { run, cancel, busy, error };
}
