import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { DeletionImpact } from "../../../convex/partidaDeletion";
import { PartidaDeletionDialog } from "./PartidaDeletionDialog";

function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return error instanceof Error ? error.message.match(/Uncaught Error: ([^\n]+)/)?.[1] || error.message : "No se pudo verificar o eliminar el concepto.";
}

export function DeletePartidaDialog({ target, currency, onClose, onDeleted }: {
  target: Doc<"partidas"> | null;
  currency: string;
  onClose: () => void;
  onDeleted: (filters: { partidas: string[]; familias: string[] }) => void;
}) {
  const convex = useConvex();
  const deletePartida = useMutation(api.partida.deletePartida);
  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin = currentUser?.role === "admin";
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const requestVersion = useRef(0);
  const submitting = useRef(false);
  const invalidateRequests = useCallback(() => { requestVersion.current++; }, []);
  const id = target?._id;
  const projectId = target?.proyecto;
  const loadImpact = useCallback(async () => {
    const version = ++requestVersion.current;
    setImpact(null);
    setError(null);
    if (!id || !projectId || !isAdmin) {
      setLoading(false);
      if (id) setError("Necesitas permisos de administración en este proyecto.");
      return;
    }
    setLoading(true);
    try {
      const result = await convex.query(api.partida.getDeletionImpact, { id, projectId });
      if (version === requestVersion.current) setImpact(result);
    } catch (failure) {
      if (version === requestVersion.current) setError(errorMessage(failure));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [convex, id, projectId, isAdmin]);

  useEffect(() => {
    void loadImpact();
    return invalidateRequests;
  }, [loadImpact, invalidateRequests]);

  const confirm = async () => {
    if (submitting.current || !id || !projectId || !impact?.canDelete || !isAdmin || error || loading) return;
    submitting.current = true;
    setDeleting(true);
    const version = requestVersion.current;
    try {
      const result = await deletePartida({ id, projectId, expectedScope: impact.expectedScope });
      if (version === requestVersion.current) {
        onDeleted(result.removedFilters);
        onClose();
      }
      toast.success(result.status === "deleted" ? "Concepto y rama presupuestaria eliminados." : "El concepto ya había sido eliminado.");
    } catch (failure) {
      // Require a new preview/confirmation after every rejection; the old
      // successful preview must not leave the destructive action enabled.
      if (version === requestVersion.current) {
        setImpact(null);
        setError(errorMessage(failure));
      }
    } finally {
      submitting.current = false;
      setDeleting(false);
    }
  };

  return <PartidaDeletionDialog
    open={Boolean(target)}
    name={target ? target.nivel === 1 ? target.nombre : target.nivel === 2 ? target.familia : target.sub_partida || target.nombre : ""}
    nivel={target?.nivel || 1} currency={currency} impact={impact}
    error={error} loading={loading} deleting={deleting}
    onClose={() => { if (!submitting.current) onClose(); }}
    onRetry={() => { void loadImpact(); }} onConfirm={() => { void confirm(); }}
  />;
}
