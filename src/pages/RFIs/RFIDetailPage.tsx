import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleMinus,
  FileQuestion,
  History,
  Images,
  Loader2,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatFileSize,
  formatRfiCompactDate,
  formatRfiDateTime,
  formatRfiDueDistance,
  formatRfiRequestedDate,
  RFI_STATUS,
  type RfiDisplayStatus,
} from "./rfiUi";
import { useRfiUserDirectory } from "./useRfiUserDirectory";
import { RfiHistoryTimeline } from "./RfiHistoryTimeline";

type RfiDetailProps = {
  embedded?: boolean;
  projectIdOverride?: Id<"desarrollos">;
  rfiIdOverride?: Id<"rfis">;
  onEdit?: () => void;
  onDeleted?: () => void;
};

export default function RFIDetailPage({
  embedded = false,
  projectIdOverride,
  rfiIdOverride,
  onEdit,
  onDeleted,
}: RfiDetailProps = {}) {
  const navigate = useNavigate();
  const { proyectoId, rfiId } = useParams<{
    proyectoId: string;
    rfiId: string;
  }>();
  const projectId =
    projectIdOverride ?? (proyectoId as Id<"desarrollos"> | undefined);
  const id = rfiIdOverride ?? (rfiId as Id<"rfis"> | undefined);

  const detail = useQuery(api.rfis.getDetail, id ? { id } : "skip");
  const formOptions = useQuery(
    api.rfis.getFormOptions,
    projectId ? { proyecto: projectId } : "skip",
  );
  const { usersById } = useRfiUserDirectory(formOptions?.users);
  const partidasById = useMemo(
    () =>
      new Map(
        (formOptions?.partidas || []).map((partida) => [
          String(partida._id),
          partida,
        ]),
      ),
    [formOptions?.partidas],
  );
  const markAsRead = useMutation(api.rfis.markAsRead);
  const submitForReview = useMutation(api.rfis.submitForReview);
  const openRfi = useMutation(api.rfis.openRfi);
  const addResponse = useMutation(api.rfis.addResponse);
  const markOfficial = useMutation(api.rfis.markResponseOfficial);
  const closeRfi = useMutation(api.rfis.closeRfi);
  const reopenRfi = useMutation(api.rfis.reopenRfi);
  const deleteRfi = useMutation(api.rfis.deleteRfi);
  const generateUploadUrl = useMutation(api.rfis.generateUploadUrl);
  const addAttachment = useMutation(api.rfis.addAttachment);

  const [responseBody, setResponseBody] = useState("");
  const [responseFiles, setResponseFiles] = useState<File[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const loadedRfiId = detail?.rfi._id;

  useEffect(() => {
    if (!id || !loadedRfiId) return;
    void markAsRead({ id }).catch(() => undefined);
  }, [id, loadedRfiId, markAsRead]);

  const runAction = async (
    name: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setBusyAction(name);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar la acción");
    } finally {
      setBusyAction(null);
    }
  };

  const uploadResponseFiles = async (
    targetRfiId: Id<"rfis">,
    responseId: Id<"rfi_responses">,
  ) => {
    for (const file of responseFiles) {
      const uploadUrl = await generateUploadUrl({ rfi_id: targetRfiId });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error(`No se pudo subir ${file.name}`);
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      await addAttachment({
        rfi_id: targetRfiId,
        response_id: responseId,
        storage_id: storageId,
        nombre: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
      });
    }
  };

  const handleResponse = async () => {
    if (!id || !responseBody.trim()) {
      toast.error("Escribe una respuesta");
      return;
    }
    await runAction(
      "respond",
      async () => {
        const responseId = await addResponse({
          rfi_id: id,
          body: responseBody,
        });
        if (responseFiles.length > 0) {
          await uploadResponseFiles(id, responseId);
        }
        setResponseBody("");
        setResponseFiles([]);
      },
      "Respuesta agregada",
    );
  };

  const handleDelete = async () => {
    if (!id || !detail || busyAction !== null) return;
    const targetProjectId = detail.rfi.proyecto;
    setBusyAction("delete");
    try {
      await deleteRfi({ id });
      toast.success("Borrador de RFI eliminado");
      setDeleteDialogOpen(false);
      if (embedded) {
        onDeleted?.();
      } else {
        navigate(`/proyecto/${targetProjectId}/rfis`, { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la RFI");
    } finally {
      setBusyAction(null);
    }
  };

  if (!projectId || !id) {
    return <CenteredMessage message="No se identificó la RFI." />;
  }

  if (detail === undefined || formOptions === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-label="Cargando RFI" />
      </div>
    );
  }

  const { rfi, permissions } = detail;
  const displayStatus = rfi.derived_status as RfiDisplayStatus;
  const status = RFI_STATUS[displayStatus] || RFI_STATUS.open;
  const creatorName = rfi.creator
    ? usersById.get(rfi.creator._id)?.name ?? rfi.creator.name
    : "Usuario sin nombre";
  const imageAttachments = detail.attachments.filter(
    (attachment) => attachment.url && attachment.type.startsWith("image/"),
  );
  const referencedPartida = rfi.partida_id
    ? partidasById.get(String(rfi.partida_id))
    : undefined;
  const referenceLabel = [
    referencedPartida?.nombre,
    rfi.familia,
    rfi.sub_partida,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "bg-white",
        embedded
          ? "px-6 pb-8 pt-8"
          : "min-h-screen px-4 py-6 sm:px-6 lg:px-8",
      )}
    >
      <div className={cn("space-y-0", !embedded && "mx-auto max-w-6xl")}>
        <header
          className={cn(
            "bg-white",
            embedded
              ? "pb-8"
              : "rounded-[4px] border border-[#777770] p-5 sm:p-6",
          )}
        >
          {!embedded && (
            <Button asChild variant="ghost" className="-ml-3 mb-4 rounded-sm">
              <Link to={`/proyecto/${projectId}/rfis`}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Volver al registro
              </Link>
            </Button>
          )}

          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DEDEDC] text-base text-[#7A7979]">
                {creatorName.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#282822]">
                  {creatorName}
                </p>
                <p className="mt-0.5 truncate text-xs text-[#7A7979]">
                  Solicitado el {formatRfiRequestedDate(rfi.created_at)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {permissions.can_edit && (
                embedded ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 min-w-[118px] rounded-[4px] border-[#D2D2CE] bg-white font-normal text-[#7A7979] shadow-none hover:bg-[#FAFAF8]"
                    onClick={onEdit}
                  >
                    Editar
                  </Button>
                ) : (
                  <Button asChild variant="outline" className="h-11 min-w-[118px] rounded-[4px] border-[#D2D2CE] bg-white font-normal text-[#7A7979] shadow-none">
                    <Link to={`/proyecto/${projectId}/rfis/${id}/editar`}>
                      Editar
                    </Link>
                  </Button>
                )
              )}
              {permissions.can_delete && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 min-w-[154px] rounded-[4px] border-[#E75F79] bg-white font-normal text-[#C93F5B] shadow-none hover:bg-[#FFF5F7] hover:text-[#B52F4A]"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={busyAction !== null}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Eliminar borrador
                </Button>
              )}
              {permissions.can_submit && (
                <ActionButton
                  name="submit"
                  busyAction={busyAction}
                  onClick={() =>
                    runAction(
                      "submit",
                      () => submitForReview({ id }),
                      "RFI enviada a revisión",
                    )
                  }
                  icon={Send}
                  label="Enviar a revisión"
                />
              )}
              {permissions.can_open && (
                <ActionButton
                  name="open"
                  busyAction={busyAction}
                  onClick={() =>
                    runAction("open", () => openRfi({ id }), "RFI abierta")
                  }
                  icon={CheckCircle2}
                  label="Abrir RFI"
                />
              )}
              {permissions.can_close && (
                <ActionButton
                  name="close"
                  busyAction={busyAction}
                  onClick={() =>
                    runAction("close", () => closeRfi({ id }), "RFI cerrada")
                  }
                  icon={CheckCircle2}
                  label="Cerrar"
                />
              )}
              {permissions.can_reopen && (
                <ActionButton
                  name="reopen"
                  busyAction={busyAction}
                  onClick={() =>
                    runAction("reopen", () => reopenRfi({ id }), "RFI reabierta")
                  }
                  icon={RotateCcw}
                  label="Reabrir"
                />
              )}
            </div>
          </div>
        </header>

        <Tabs defaultValue="general" className="min-w-0">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-[#C9C9C5] bg-white p-0">
              <TabsTrigger value="general" className="h-12 rounded-none px-4 font-normal text-[#7A7979] shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#282822] data-[state=active]:bg-white data-[state=active]:text-[#282822] data-[state=active]:shadow-none">
                General
              </TabsTrigger>
              <TabsTrigger value="responses" className="h-12 gap-3 rounded-none px-4 font-normal text-[#7A7979] shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#282822] data-[state=active]:bg-white data-[state=active]:text-[#282822] data-[state=active]:shadow-none">
                Respuestas
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#F0F0EE] px-1.5 text-xs text-[#7A7979]">
                  {detail.responses.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="history" className="ml-auto h-12 rounded-none px-4 font-normal text-[#7A7979] shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#282822] data-[state=active]:bg-white data-[state=active]:text-[#282822] data-[state=active]:shadow-none">
                Historial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-0 space-y-5 pt-9">
              <div className="flex flex-col gap-5 px-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-[#7A7979]">{rfi.code}</p>
                  <h1 className="mt-1 truncate text-base font-medium text-[#282822]">
                    {rfi.subject}
                  </h1>
                  <p className="mt-1 truncate text-xs uppercase text-[#7A7979]">
                    {referenceLabel || formOptions.project.nombre}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-[#7A7979]">
                      {formatRfiCompactDate(rfi.due_date)}
                    </p>
                    <p className="mt-1 text-xs text-[#282822]">
                      {formatRfiDueDistance(rfi.due_date)}
                    </p>
                  </div>
                  <DetailStatus label={status.label} color={status.color} />
                </div>
              </div>

              <ContentCard title={rfi.question}>
                <p className="whitespace-pre-wrap text-sm leading-5 text-[#7A7979]">
                  {rfi.background || "Sin antecedentes adicionales."}
                </p>
              </ContentCard>

              {detail.attachments.length > 0 && (
                <ContentCard title="Adjuntos">
                  <div
                    className={cn(
                      "grid gap-5",
                      imageAttachments.length > 0 &&
                        "sm:grid-cols-[minmax(0,1fr)_minmax(0,250px)]",
                    )}
                  >
                    <AttachmentList attachments={detail.attachments} compact />
                    {imageAttachments.length > 0 && (
                      <ImageGallery attachments={imageAttachments} />
                    )}
                  </div>
                </ContentCard>
              )}

              <div className="grid gap-8 rounded-[4px] border border-[#D9D9D5] bg-white p-5 md:grid-cols-2">
                <ContentCard title="Referencias" nested>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <DetailTerm label="Proyecto" value={formOptions.project.nombre} />
                    <DetailTerm
                      label="Partida"
                      value={referencedPartida?.nombre}
                    />
                    <DetailTerm label="Familia" value={rfi.familia} />
                    <DetailTerm label="Subpartida" value={rfi.sub_partida} />
                    <DetailTerm label="Plano" value={rfi.drawing_number} />
                    <DetailTerm
                      label="Revisión"
                      value={`Revisión ${rfi.revision_number}`}
                    />
                  </dl>
                </ContentCard>

                <ContentCard title="Impacto" nested>
                  <div className="grid gap-4">
                    <ImpactSummary
                      label="Costo"
                      value={rfi.cost_impact}
                      detail={
                        rfi.cost_impact_amount !== undefined
                          ? new Intl.NumberFormat("es-MX", {
                              style: "currency",
                              currency: "MXN",
                            }).format(rfi.cost_impact_amount)
                          : undefined
                      }
                    />
                    <ImpactSummary
                      label="Programa"
                      value={rfi.schedule_impact}
                      detail={
                        rfi.schedule_impact_days !== undefined
                          ? `${rfi.schedule_impact_days} días`
                          : undefined
                      }
                    />
                  </div>
                </ContentCard>
              </div>

            </TabsContent>

            <TabsContent value="responses" className="mt-4 space-y-4">
              {detail.responses.length === 0 ? (
                <ContentCard title="Respuestas" icon={MessageSquareText}>
                  <p className="text-sm text-gray-500">
                    Todavía no se han agregado respuestas.
                  </p>
                </ContentCard>
              ) : (
                detail.responses.map((response) => (
                  <article
                    key={response._id}
                    className={`rounded-sm border bg-white p-5 ${
                      response.is_official
                        ? "border-[#50AC66] ring-1 ring-[#50AC66]/20"
                        : "border-[#E6E6E6]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-gray-900">
                            {usersById.get(response.author_id)?.name ??
                              response.author_name}
                          </h2>
                          {response.is_official && (
                            <Badge className="rounded-sm bg-[#50AC66] text-white hover:bg-[#50AC66]">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Respuesta oficial
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatRfiDateTime(response.created_at)}
                        </p>
                      </div>
                      {permissions.can_mark_official && !response.is_official && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-sm"
                          disabled={busyAction !== null}
                          onClick={() =>
                            runAction(
                              `official-${response._id}`,
                              () =>
                                markOfficial({ response_id: response._id }),
                              "Respuesta marcada como oficial",
                            )
                          }
                        >
                          {busyAction === `official-${response._id}` ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          Marcar oficial
                        </Button>
                      )}
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {response.body}
                    </p>
                    {response.attachments.length > 0 && (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <AttachmentList attachments={response.attachments} />
                      </div>
                    )}
                  </article>
                ))
              )}

              {permissions.can_respond && (
                <ContentCard title="Agregar respuesta" icon={MessageSquareText}>
                  <label htmlFor="response-body" className="sr-only">
                    Respuesta
                  </label>
                  <Textarea
                    id="response-body"
                    value={responseBody}
                    onChange={(event) => setResponseBody(event.target.value)}
                    placeholder="Escribe una respuesta clara y verificable"
                    className="min-h-32 rounded-sm"
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                      <Paperclip className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {responseFiles.length > 0
                          ? `${responseFiles.length} archivo${responseFiles.length === 1 ? "" : "s"}`
                          : "Adjuntar archivos"}
                      </span>
                      <Input
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={(event) =>
                          setResponseFiles(Array.from(event.target.files || []))
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      onClick={handleResponse}
                      disabled={busyAction !== null || !responseBody.trim()}
                      className="rounded-sm bg-gray-900 text-white hover:bg-gray-900"
                    >
                      {busyAction === "respond" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Publicar respuesta
                    </Button>
                  </div>
                </ContentCard>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <ContentCard
                title={`Historial · ${detail.history.length} movimiento${detail.history.length === 1 ? "" : "s"}`}
                icon={History}
              >
                <RfiHistoryTimeline
                  history={detail.history}
                  usersById={usersById}
                  partidasById={partidasById}
                />
              </ContentCard>
            </TabsContent>
          </Tabs>
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (busyAction !== "delete") setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {rfi.code}</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente “{rfi.code}: {rfi.subject}”, junto con
              sus adjuntos e historial. El folio no volverá a utilizarse y esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction === "delete"}>
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              className="bg-[#C93F5B] text-white hover:bg-[#B52F4A]"
              onClick={() => void handleDelete()}
              disabled={busyAction !== null}
            >
              {busyAction === "delete" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Eliminar permanentemente
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailStatus({ label, color }: { label: string; color: string }) {
  const positive = color === "#50AC66";
  const borderColor = color === "#CFCFCD" || color === "#ADADAD" ? "#D5D5D1" : color;
  return (
    <span
      className="inline-flex h-11 min-w-[118px] items-center justify-center gap-2 rounded-[4px] border bg-white px-3 text-sm"
      style={{ borderColor, color: positive ? color : "#7A7979" }}
    >
      {positive ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <CircleMinus className="h-4 w-4 text-[#D7D7D4]" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

function ActionButton({
  name,
  busyAction,
  onClick,
  icon: Icon,
  label,
}: {
  name: string;
  busyAction: string | null;
  onClick: () => void;
  icon: typeof Send;
  label: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={busyAction !== null}
      className="h-11 min-w-[118px] rounded-[4px] bg-[#282822] px-5 font-normal text-white shadow-none hover:bg-[#282822]/90"
    >
      {busyAction === name ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Icon className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}

function ContentCard({
  title,
  icon: Icon,
  nested = false,
  children,
}: {
  title: string;
  icon?: typeof FileQuestion;
  nested?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        nested
          ? "min-w-0"
          : "rounded-[4px] border border-[#D9D9D5] bg-white p-5",
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        {Icon && <Icon className="h-5 w-5 text-[#7A7979]" aria-hidden="true" />}
        <h2 className="text-base font-medium leading-5 text-[#282822]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DetailTerm({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[#7A7979]">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-5 text-[#282822]">{value || "Sin especificar"}</dd>
    </div>
  );
}

function ImageGallery({
  attachments,
}: {
  attachments: Array<{
    _id: Id<"rfi_attachments">;
    nombre: string;
    url: string | null;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentAttachment = attachments[currentIndex] || attachments[0];

  const openAt = (index: number) => {
    setCurrentIndex(index);
    setOpen(true);
  };
  const showPrevious = useCallback(() =>
    setCurrentIndex((current) =>
      current === 0 ? attachments.length - 1 : current - 1,
    ), [attachments.length]);
  const showNext = useCallback(() =>
    setCurrentIndex((current) =>
      current === attachments.length - 1 ? 0 : current + 1,
    ), [attachments.length]);

  useEffect(() => {
    if (!open || attachments.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attachments.length, open, showNext, showPrevious]);

  if (!currentAttachment) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2" aria-label="Galería de imágenes">
        {attachments.slice(0, 4).map((attachment, index) => {
          const remaining = attachments.length - 4;
          return (
            <button
              key={attachment._id}
              type="button"
              onClick={() => openAt(index)}
              className="group relative min-w-0 overflow-hidden rounded-[4px] bg-[#F0F0EE] focus:outline-none focus:ring-2 focus:ring-[#777770] focus:ring-offset-2"
              aria-label={`Abrir imagen ${index + 1} de ${attachments.length}: ${attachment.nombre}`}
            >
              <img
                src={attachment.url || undefined}
                alt={attachment.nombre}
                className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              />
              {index === 3 && remaining > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
                  +{remaining}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-[min(94vw,1100px)] gap-0 overflow-hidden rounded-[4px] border-[#282822] bg-[#181816] p-0 text-white [&>button]:right-5 [&>button]:top-5 [&>button]:z-20 [&>button]:text-white">
          <DialogTitle className="sr-only">Galería de imágenes de la RFI</DialogTitle>
          <DialogDescription className="sr-only">
            Usa los controles anterior y siguiente o las flechas del teclado para
            recorrer las imágenes.
          </DialogDescription>

          <div className="flex min-h-14 items-center gap-3 border-b border-white/10 px-5 pr-14">
            <Images className="h-5 w-5 shrink-0 text-white/70" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-sm text-white">
              {currentAttachment.nombre}
            </p>
            <span className="text-xs text-white/60">
              {currentIndex + 1} / {attachments.length}
            </span>
          </div>

          <div className="relative flex min-h-[360px] items-center justify-center bg-black/35 px-14 py-6">
            <img
              src={currentAttachment.url || undefined}
              alt={currentAttachment.nombre}
              className="max-h-[68vh] max-w-full rounded-[4px] object-contain"
            />
            {attachments.length > 1 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={showPrevious}
                  className="absolute left-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-black/45 text-white hover:bg-black/70 hover:text-white"
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={showNext}
                  className="absolute right-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-black/45 text-white hover:bg-black/70 hover:text-white"
                  aria-label="Imagen siguiente"
                >
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </Button>
              </>
            )}
          </div>

          {attachments.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-t border-white/10 p-3">
              {attachments.map((attachment, index) => (
                <button
                  key={attachment._id}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    "shrink-0 overflow-hidden rounded-[4px] border-2",
                    index === currentIndex
                      ? "border-white"
                      : "border-transparent opacity-60 hover:opacity-100",
                  )}
                  aria-label={`Ver ${attachment.nombre}`}
                  aria-current={index === currentIndex ? "true" : undefined}
                >
                  <img
                    src={attachment.url || undefined}
                    alt=""
                    className="h-14 w-20 object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AttachmentList({
  attachments,
  compact = false,
}: {
  attachments: Array<{
    _id: Id<"rfi_attachments">;
    nombre: string;
    size: number;
    url: string | null;
  }>;
  compact?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {attachments.map((attachment) => (
        <li key={attachment._id}>
          {attachment.url ? (
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex items-center justify-between gap-3 rounded-[4px] text-sm text-[#282822] hover:bg-[#FAFAF8]",
                compact ? "px-0 py-2" : "border border-[#D9D9D5] px-3 py-2",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-[#B2B2AE]" />
                <span className="truncate">{attachment.nombre}</span>
              </span>
              <span className="shrink-0 text-xs text-gray-400">
                {formatFileSize(attachment.size)}
              </span>
            </a>
          ) : (
            <div className="rounded-sm border border-gray-200 px-3 py-2 text-sm text-gray-500">
              {attachment.nombre}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ImpactSummary({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  const labelByValue: Record<string, string> = {
    yes: "Sí",
    no: "No",
    unknown: "Por determinar",
    na: "No aplica",
  };
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">
        {labelByValue[value] || value}
      </p>
      {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

function CenteredMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="max-w-md text-center text-sm text-gray-600">{message}</p>
    </div>
  );
}
