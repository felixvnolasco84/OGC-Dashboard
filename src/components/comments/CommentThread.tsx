import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { ConvexError } from "convex/values";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  COMMENT_MAX_LENGTH,
  commentDates,
  commentText,
} from "../../../convex/commentRules";
import { programDate } from "@/lib/programa-obra-rules";

export type CommentRecord = {
  id: string;
  text: string;
  author?: string;
  createdAt: number;
  revision: number;
  start?: string;
  finish?: string;
  canManage: boolean;
};
export type CommentDraft = { text: string; start: string; finish: string };
export type CommentExitGuard = MutableRefObject<
  ((action: () => void) => void) | null
>;
type Props = {
  comments: CommentRecord[] | undefined;
  destination: string;
  available: boolean | undefined;
  online: boolean;
  canCreate: boolean;
  dated?: boolean;
  dark?: boolean;
  defaultComposer?: boolean;
  programStart?: string;
  programFinish?: string;
  exitGuard?: CommentExitGuard;
  onAdd: (draft: CommentDraft, operationId: string) => Promise<unknown>;
  onEdit: (
    original: CommentRecord,
    draft: CommentDraft,
    operationId: string,
  ) => Promise<unknown>;
  onDelete: (original: CommentRecord, operationId: string) => Promise<unknown>;
};
const emptyDraft = (): CommentDraft => ({ text: "", start: "", finish: "" });
const recordDraft = (record: CommentRecord): CommentDraft => ({
  text: record.text,
  start: programDate(record.start) ?? "",
  finish: programDate(record.finish) ?? "",
});
const sameDraft = (a: CommentDraft, b: CommentDraft) =>
  a.text.trim() === b.text.trim() &&
  a.start === b.start &&
  a.finish === b.finish;
const displayDate = (value?: string) =>
  programDate(value)?.split("-").reverse().join("/") ?? value ?? "";
function errorMessage(error: unknown) {
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data &&
    "message" in error.data
  )
    return String(error.data.message);
  return "No se pudo completar la operación. Tu borrador se conserva; puedes reintentar cuando haya conexión.";
}

export default function CommentThread({
  comments,
  destination,
  available,
  online,
  canCreate,
  dated = false,
  dark = false,
  defaultComposer = false,
  programStart,
  programFinish,
  exitGuard,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  const id = useId();
  const [mode, setMode] = useState<"new" | "edit" | null>(
    defaultComposer ? "new" : null,
  );
  const [original, setOriginal] = useState<CommentRecord | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [deleting, setDeleting] = useState<CommentRecord | null>(null);
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const lock = useRef(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const status = useRef<HTMLDivElement>(null);
  const dirty =
    mode !== null &&
    !sameDraft(draft, original ? recordDraft(original) : emptyDraft());
  const current = original
    ? comments?.find((c) => c.id === original.id)
    : undefined;
  const currentDelete = deleting
    ? comments?.find((c) => c.id === deleting.id)
    : undefined;
  const stale = Boolean(
    original && current && current.revision !== original.revision,
  );
  const removed = Boolean(original && comments && !current);
  const deleteStale = Boolean(
    deleting && currentDelete && deleting.revision !== currentDelete.revision,
  );
  const ready = online && available === true && Boolean(comments);
  const maySave =
    ready &&
    (mode === "new" ? canCreate : Boolean(current?.canManage)) &&
    !stale &&
    !removed;
  let validation = "";
  try {
    commentText(draft.text);
    if (dated) commentDates(draft.start, draft.finish);
  } catch (error) {
    validation = errorMessage(error);
  }
  const outside =
    dated &&
    draft.start &&
    draft.finish &&
    ((programDate(programStart) && draft.start < programDate(programStart)!) ||
      (programDate(programFinish) &&
        draft.finish > programDate(programFinish)!));
  const subdued = dark ? "text-on-color/70" : "text-muted-foreground";
  const card = dark
    ? "border-on-color/20 bg-on-color/5"
    : "border-border bg-card";

  const reset = () => {
    setOriginal(null);
    setDraft(emptyDraft());
    setMode(defaultComposer ? "new" : null);
    request.current = null;
  };
  const guard = (action: () => void) => {
    if (lock.current) {
      setFeedback({
        error: false,
        text: "Hay una operación en curso. Espera su resultado antes de salir.",
      });
      return;
    }
    if (deleting || discard) return;
    if (dirty) {
      returnFocus.current = document.activeElement as HTMLElement;
      setDiscard(() => action);
    } else action();
  };
  useLayoutEffect(() => {
    if (!exitGuard) return;
    exitGuard.current = guard;
    return () => {
      exitGuard.current = null;
    };
  });
  useEffect(() => {
    if (deleting && comments && !currentDelete && !busy) {
      setDeleting(null);
      setFeedback({ error: false, text: "El comentario ya fue eliminado." });
    }
  }, [deleting, comments, currentDelete, busy]);
  useEffect(() => {
    const preventReload = (event: BeforeUnloadEvent) => {
      if (dirty || lock.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventReload);
    return () => window.removeEventListener("beforeunload", preventReload);
  }, [dirty]);
  const run = async (
    signature: string,
    apply: (operationId: string) => Promise<unknown>,
    done: () => void,
    message: string,
  ) => {
    if (lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      if (request.current?.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      await apply(request.current.id);
      request.current = null;
      done();
      setFeedback({ error: false, text: message });
    } catch (error) {
      setFeedback({ error: true, text: errorMessage(error) });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const save = () => {
    if (!maySave || validation || !dirty) return;
    const payload = { ...draft, text: draft.text.trim() };
    if (mode === "edit" && original)
      void run(
        JSON.stringify(["edit", original.id, original.revision, payload]),
        (operationId) => onEdit(original, payload, operationId),
        reset,
        "Comentario actualizado.",
      );
    else
      void run(
        JSON.stringify(["add", payload]),
        (operationId) => onAdd(payload, operationId),
        reset,
        "Comentario publicado.",
      );
  };
  const startEdit = (record: CommentRecord) =>
    guard(() => {
      setOriginal(record);
      setDraft(recordDraft(record));
      setMode("edit");
      setFeedback(null);
      request.current = null;
      requestAnimationFrame(() => textarea.current?.focus());
    });
  const startDelete = (record: CommentRecord, trigger: HTMLButtonElement) =>
    guard(() => {
      returnFocus.current = trigger;
      setDeleting(record);
      setFeedback(null);
    });
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
    else status.current?.focus();
  };

  return (
    <div
      className={`min-h-0 flex-1 space-y-4 overflow-y-auto p-4 ${dark ? "text-on-color" : "text-foreground"}`}
    >
      <p className={`break-words text-sm ${subdued}`}>
        <strong>{destination}</strong>
        <br />
        {dated
          ? "El rango sitúa el comentario en el Gantt. Los futuros PDF con avisos incluirán los comentarios del programa."
          : "Conversación de esta fotografía."}
      </p>
      <div ref={status} tabIndex={-1} className="focus:outline-none">
        {feedback && (
          <p
            role={feedback.error ? "alert" : "status"}
            className={`break-words border p-3 text-sm ${feedback.error ? "border-destructive text-destructive" : card}`}
          >
            {feedback.text}
          </p>
        )}
      </div>
      {!online && (
        <p role="status" className={`text-sm ${subdued}`}>
          Sin conexión al servidor. El borrador permanece abierto; los
          comentarios no se guardan ni se envían sin conexión.
        </p>
      )}
      {available === false && (
        <p role="alert" className="text-sm text-destructive">
          El destino ya no está disponible o perdiste el acceso. Tu borrador se
          conserva.
        </p>
      )}
      {available === undefined && (
        <p role="status" className={`text-sm ${subdued}`}>
          Verificando disponibilidad…
        </p>
      )}
      {!canCreate && available === true && (
        <p className={`text-sm ${subdued}`}>
          Consulta de comentarios. No tienes permiso para publicar.
        </p>
      )}
      {mode && (mode === "edit" || canCreate || dirty) && (
        <form
          aria-label={
            mode === "edit" ? "Editar comentario" : "Publicar comentario"
          }
          className={`space-y-3 border p-3 ${card}`}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <h3 className="font-medium">
            {mode === "edit" ? "Editar comentario" : "Nuevo comentario"}
          </h3>
          {original && (
            <div className={`space-y-2 text-sm ${subdued}`}>
              <p className="font-medium">
                Actual · {original.author || "Autor no registrado"}
              </p>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                {original.text}
              </p>
              {dated && (
                <p>
                  {displayDate(original.start)} → {displayDate(original.finish)}
                </p>
              )}
            </div>
          )}
          {removed && (
            <p role="alert" className="text-sm text-destructive">
              El comentario ya fue eliminado. Puedes conservar o copiar tu
              borrador, pero no guardarlo sobre ese comentario.
            </p>
          )}
          {stale && current && (
            <div className={`space-y-2 border p-3 text-sm ${card}`}>
              <p role="alert">El comentario cambió mientras lo editabas.</p>
              <p className="font-medium">Versión actualizada</p>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                {current.text}
              </p>
              {dated && (
                <p>
                  {displayDate(current.start)} → {displayDate(current.finish)}
                </p>
              )}
              <Button
                type="button"
                variant={dark ? "secondary" : "outline"}
                disabled={busy}
                onClick={() => {
                  setOriginal(current);
                  request.current = null;
                }}
              >
                Revisar con esta versión
              </Button>
              <p className={subdued}>
                Tu propuesta se conserva. Al guardar sustituirás esta versión.
              </p>
            </div>
          )}
          {mode === "edit" && current && !current.canManage && (
            <p role="alert" className="text-sm text-destructive">
              Ya no tienes permiso para editar este comentario.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${id}-text`}>
              {original ? "Texto propuesto" : "Comentario"}
            </Label>
            <Textarea
              ref={textarea}
              id={`${id}-text`}
              aria-describedby={`${id}-validation`}
              value={draft.text}
              disabled={busy}
              variant={dark ? "darkEdit" : "plain"}
              rows={4}
              onChange={(event) =>
                setDraft((value) => ({ ...value, text: event.target.value }))
              }
            />
            <p className={`text-xs ${subdued}`}>
              {draft.text.length} / {COMMENT_MAX_LENGTH} caracteres
            </p>
          </div>
          {dated && (
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${id}-start`}>Fecha inicio</Label>
                <Input
                  id={`${id}-start`}
                  type="date"
                  disabled={busy}
                  value={draft.start}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      start: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-finish`}>Fecha fin</Label>
                <Input
                  id={`${id}-finish`}
                  type="date"
                  disabled={busy}
                  value={draft.finish}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      finish: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          )}
          <p
            id={`${id}-validation`}
            aria-live="polite"
            className={`text-xs ${validation && dirty ? "text-destructive" : subdued}`}
          >
            {validation && dirty
              ? validation
              : original && !dirty
                ? "Sin cambios."
                : original
                  ? "Guardar sustituirá los campos modificados de este comentario."
                  : "Publicar agregará un comentario al destino indicado."}
          </p>
          {outside && (
            <p role="status" className={`text-sm ${subdued}`}>
              Este rango queda fuera de las fechas del elemento y puede ampliar
              la escala temporal del Gantt.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant={dark ? "secondary" : "outline"}
              disabled={busy}
              onClick={() => guard(reset)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={dark ? "secondary" : "default"}
              disabled={busy || !maySave || Boolean(validation) || !dirty}
            >
              {busy
                ? "Guardando…"
                : mode === "edit"
                  ? "Guardar comentario"
                  : "Publicar comentario"}
            </Button>
          </div>
        </form>
      )}
      {!mode && canCreate && (
        <Button
          type="button"
          className="w-full"
          variant={dark ? "secondary" : "outline"}
          disabled={!ready || busy}
          onClick={() => {
            setMode("new");
            setDraft(emptyDraft());
            requestAnimationFrame(() => textarea.current?.focus());
          }}
        >
          Agregar comentario
        </Button>
      )}
      <div
        className="space-y-3"
        aria-label="Comentarios publicados"
        aria-busy={comments === undefined}
      >
        {!comments ? (
          <p role="status">Cargando comentarios…</p>
        ) : !comments.length ? (
          <p className={`text-sm ${subdued}`}>Sin comentarios publicados.</p>
        ) : (
          comments.map((record) => (
            <article
              key={record.id}
              className={`space-y-2 border p-3 text-sm ${card}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">
                    {record.author || "Autor no registrado"}
                  </p>
                  <p className={`text-xs ${subdued}`}>
                    {new Date(record.createdAt).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {record.canManage && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant={dark ? "secondary" : "outline"}
                      className="min-h-11 min-w-11"
                      aria-label={`Editar comentario de ${record.author || "autor no registrado"}`}
                      disabled={!ready || busy}
                      onClick={() => startEdit(record)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="min-h-11 min-w-11"
                      aria-label={`Eliminar comentario de ${record.author || "autor no registrado"}`}
                      disabled={!ready || busy}
                      onClick={(event) =>
                        startDelete(record, event.currentTarget)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words">{record.text}</p>
              {dated && (
                <p className={`text-xs ${subdued}`}>
                  {displayDate(record.start)} → {displayDate(record.finish)}
                </p>
              )}
            </article>
          ))
        )}
      </div>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !lock.current) setDeleting(null);
        }}
      >
        <AlertDialogContent
          data-comment-confirm="true"
          overlayClassName="z-[60]"
          className="z-[70]"
          onCloseAutoFocus={restoreFocus}
          onEscapeKeyDown={(event) => {
            if (lock.current) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este comentario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará de {destination}.
              {dated
                ? " Su marcador desaparecerá del Gantt y de futuros PDF que incluyan comentarios."
                : " La fotografía, su descripción y el reporte se conservan."}{" "}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleting && (
            <div className="space-y-2 border border-border p-3 text-sm">
              <p className="break-words font-medium">
                {deleting.author || "Autor no registrado"} ·{" "}
                {new Date(deleting.createdAt).toLocaleString("es-MX")}
              </p>
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                {deleting.text}
              </p>
              {dated && (
                <p>
                  {displayDate(deleting.start)} → {displayDate(deleting.finish)}
                </p>
              )}
            </div>
          )}
          {deleteStale && (
            <p role="alert" className="text-sm text-destructive">
              El comentario cambió. Cancela y vuelve a abrir la eliminación para
              revisar la versión actual.
            </p>
          )}
          {deleting && !currentDelete?.canManage && (
            <p role="alert" className="text-sm text-destructive">
              El comentario ya no está disponible para eliminar.
            </p>
          )}
          {feedback?.error && (
            <p role="alert" className="text-sm text-destructive">
              {feedback.text}
            </p>
          )}
          {!online && (
            <p role="status" className="text-sm text-muted-foreground">
              Sin conexión al servidor. La eliminación no se enviará hasta que
              confirmes con conexión.
            </p>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={
                busy || !ready || deleteStale || !currentDelete?.canManage
              }
              onClick={() => {
                if (deleting)
                  void run(
                    JSON.stringify(["delete", deleting.id, deleting.revision]),
                    (operationId) => onDelete(deleting, operationId),
                    () => setDeleting(null),
                    "Comentario eliminado.",
                  );
              }}
            >
              {busy ? "Eliminando…" : "Eliminar comentario"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(discard)}
        onOpenChange={(open) => {
          if (!open) setDiscard(null);
        }}
      >
        <AlertDialogContent
          overlayClassName="z-[60]"
          className="z-[70]"
          onCloseAutoFocus={restoreFocus}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar el borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Hay cambios sin publicar o guardar en {destination}. Descartarlos
              perderá el texto y las fechas que estás editando.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const action = discard;
                setDiscard(null);
                reset();
                action?.();
              }}
            >
              Descartar borrador
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
