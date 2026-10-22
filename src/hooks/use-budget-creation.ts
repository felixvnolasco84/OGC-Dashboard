import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useAction, useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Infer } from "convex/values";
import type { budgetFormValidator } from "../../convex/budgetImportRules";
import { hashFile } from "@/lib/transactionImport";

export function budgetOriginalUrl(attemptId: Id<"budget_creation_attempts">) {
  const site = import.meta.env.VITE_CONVEX_SITE_URL || String(import.meta.env.VITE_CONVEX_URL || "").replace(/\.convex\.cloud\/?$/, ".convex.site");
  if (!site) throw new Error("Falta configurar la dirección de almacenamiento del presupuesto.");
  return `${site.replace(/\/$/, "")}/initial-budget/original?attempt_id=${encodeURIComponent(attemptId)}`;
}
export function useBudgetCreation() {
  const { getToken, userId } = useAuth();
  const convex = useConvex();
  const start = useMutation(api.budgetCreationHistory.start);
  const pause = useMutation(api.budgetCreationHistory.pause);
  const continueCreation = useAction(api.budgetCreation.continueCreation);
  const [busy, setBusy] = useState(false);
  const [attemptId, setAttemptId] = useState<Id<"budget_creation_attempts"> | null>(null);
  const running = useRef(false);
  useEffect(() => () => { running.current = false; }, []);
  const stop = useCallback(() => { running.current = false; }, []);
  const clear = useCallback(() => { running.current = false; setAttemptId(null); }, []);
  const run = async (id: Id<"budget_creation_attempts">) => {
    setAttemptId(id);
    while (running.current) {
      try {
        const result = await continueCreation({ attempt_id: id });
        if (result.completed) return result.proyecto;
      } catch (error) {
        // A committed result can outlive a failed/lost action response.
        const saved = await convex.query(api.budgetCreationHistory.get, { attempt_id: id });
        if (saved.status === "completed") return saved.proyecto;
        throw error;
      }
    }
    return undefined;
  };
  const resume = async (id: Id<"budget_creation_attempts">) => {
    if (busy) return;
    setBusy(true);
    running.current = true;
    try {
      const proyecto = await run(id);
      if (proyecto) {
        const attempt = await convex.query(api.budgetCreationHistory.get, { attempt_id: id });
        const key = `ogc:budget-creation:${userId}`;
        const pending = JSON.parse(localStorage.getItem(key) || "null");
        if (pending?.request_id === attempt.request_id) localStorage.removeItem(key);
      }
      return proyecto;
    } finally { running.current = false; setBusy(false); }
  };
  const create = async (form: Infer<typeof budgetFormValidator>, file: File) => {
    if (busy) return;
    setBusy(true);
    running.current = true;
    let id: Id<"budget_creation_attempts"> | null = null;
    const key = `ogc:budget-creation:${userId}`;
    try {
      const file_hash = await hashFile(file);
      const fingerprint = JSON.stringify({ form, file_hash, name: file.name, size: file.size });
      let pending: { fingerprint: string; request_id: string } | null = null;
      try { pending = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* no previous request */ }
      const request_id = pending?.fingerprint === fingerprint ? pending.request_id : crypto.randomUUID();
      // Persist before making the first request, including lost-start recovery.
      localStorage.setItem(key, JSON.stringify({ fingerprint, request_id }));
      id = await start({ request_id, form, file_name: file.name, file_hash, size: file.size, content_type: file.type || "application/octet-stream" });
      if (!running.current) return undefined;
      setAttemptId(id);
      const attempt = await convex.query(api.budgetCreationHistory.get, { attempt_id: id });
      if (!attempt.file_available) {
        const token = await getToken({ template: "convex" });
        if (!token) throw new Error("Inicia sesión para guardar el original.");
        const upload = await fetch(budgetOriginalUrl(id), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: file });
        if (!upload.ok) throw new Error(await upload.text() || "No se pudo guardar el Excel original.");
      }
      const proyecto = await run(id);
      if (proyecto) localStorage.removeItem(key);
      return proyecto;
    } catch (error) {
      // Query before marking a failed upload: its response may have been lost.
      if (id) {
        try {
          const saved = await convex.query(api.budgetCreationHistory.get, { attempt_id: id });
          if (saved.status === "completed") { localStorage.removeItem(key); return saved.proyecto; }
          await pause({ attempt_id: id, error: error instanceof Error ? error.message : "La creación se interrumpió." });
        } catch { /* The saved request ID still allows safe recovery. */ }
      }
      throw error;
    } finally { running.current = false; setBusy(false); }
  };
  return { create, resume, busy, attemptId, stop, clear };
}
