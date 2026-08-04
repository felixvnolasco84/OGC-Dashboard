import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  LockKeyhole,
  Paperclip,
  Send,
  Save,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatApplicationRole,
  IMPACT_OPTIONS,
  RFI_RESPONSIBLE_ROLES,
} from "./rfiUi";
import { useRfiUserDirectory } from "./useRfiUserDirectory";
import { RfiAssigneePicker } from "./RfiAssigneePicker";
import { RfiDatePicker } from "./RfiDatePicker";

type ImpactValue = "yes" | "unknown" | "no" | "na";
const EMPTY_SELECT_VALUE = "__none__";

function emptyForm() {
  return {
    subject: "",
    background: "",
    question: "",
    receivedFromId: "",
    responsibleUserId: "",
    assigneeIds: new Set<string>(),
    requiredAssigneeIds: new Set<string>(),
    distributionUserIds: new Set<string>(),
    dueDate: "",
    location: "",
    drawingNumber: "",
    specSection: "",
    partidaId: "",
    familia: "",
    subPartida: "",
    projectStage: "",
    costImpact: "unknown" as ImpactValue,
    costImpactAmount: "",
    scheduleImpact: "unknown" as ImpactValue,
    scheduleImpactDays: "",
    isPrivate: false,
  };
}

type RfiEditorProps = {
  embedded?: boolean;
  projectIdOverride?: Id<"desarrollos">;
  rfiIdOverride?: Id<"rfis">;
  onCancel?: () => void;
  onSaved?: (id: Id<"rfis">) => void;
};

export default function RFINewPage({
  embedded = false,
  projectIdOverride,
  rfiIdOverride,
  onCancel,
  onSaved,
}: RfiEditorProps = {}) {
  const { proyectoId, rfiId } = useParams<{
    proyectoId: string;
    rfiId?: string;
  }>();
  const navigate = useNavigate();
  const projectId =
    projectIdOverride ?? (proyectoId as Id<"desarrollos"> | undefined);
  const editId = rfiIdOverride ?? (rfiId as Id<"rfis"> | undefined);
  const options = useQuery(
    api.rfis.getFormOptions,
    projectId ? { proyecto: projectId } : "skip",
  );
  const detail = useQuery(
    api.rfis.getDetail,
    editId ? { id: editId } : "skip",
  );
  const createRfi = useMutation(api.rfis.create);
  const updateRfi = useMutation(api.rfis.updateDraft);
  const generateUploadUrl = useMutation(api.rfis.generateUploadUrl);
  const addAttachment = useMutation(api.rfis.addAttachment);

  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState<"draft" | "review" | null>(null);
  const [initializedEditId, setInitializedEditId] = useState<string | null>(null);

  useEffect(() => {
    if (!editId || !detail || initializedEditId === editId) return;
    const rfi = detail.rfi;
    setForm({
      subject: rfi.subject,
      background: rfi.background || "",
      question: rfi.question,
      receivedFromId: rfi.received_from_id || "",
      responsibleUserId: rfi.rfi_manager_id || "",
      assigneeIds: new Set(rfi.assignee_ids),
      requiredAssigneeIds: new Set(rfi.required_assignee_ids),
      distributionUserIds: new Set(rfi.distribution_user_ids),
      dueDate: rfi.due_date || "",
      location: rfi.location || "",
      drawingNumber: rfi.drawing_number || "",
      specSection: rfi.spec_section || "",
      partidaId: rfi.partida_id || "",
      familia: rfi.familia || "",
      subPartida: rfi.sub_partida || "",
      projectStage: rfi.project_stage || "",
      costImpact: rfi.cost_impact,
      costImpactAmount: rfi.cost_impact_amount?.toString() || "",
      scheduleImpact: rfi.schedule_impact,
      scheduleImpactDays: rfi.schedule_impact_days?.toString() || "",
      isPrivate: rfi.is_private,
    });
    setFiles([]);
    setRemovedAttachmentIds(new Set());
    setInitializedEditId(editId);
  }, [detail, editId, initializedEditId]);

  const { users: resolvedProjectUsers } = useRfiUserDirectory(options?.users);
  const projectUsers = useMemo(
    () =>
      [...resolvedProjectUsers].sort((a, b) =>
        a.name.localeCompare(b.name, "es")),
    [resolvedProjectUsers],
  );
  const selectedAssignees = useMemo(
    () =>
      projectUsers.filter((user) => form.assigneeIds.has(user._id)),
    [form.assigneeIds, projectUsers],
  );
  const responsibleUsers = useMemo(
    () =>
      projectUsers.filter((user) =>
        RFI_RESPONSIBLE_ROLES.has(user.role)),
    [projectUsers],
  );
  const partidaOptions = useMemo(
    () => {
      const partidas = options?.partidas || [];
      const includesHierarchy = partidas.some(
        (partida) => typeof partida.nivel === "number",
      );
      return includesHierarchy
        ? partidas.filter((partida) => partida.nivel === 1)
        : partidas;
    },
    [options?.partidas],
  );
  const selectedPartidaName = useMemo(
    () =>
      partidaOptions.find((partida) => partida._id === form.partidaId)?.nombre ||
      "",
    [form.partidaId, partidaOptions],
  );
  const familiaOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (options?.partidas || [])
            .filter(
              (partida) =>
                partida.nivel === 2 &&
                partida.partida_nombre === selectedPartidaName &&
                partida.familia.trim(),
            )
            .map((partida) => partida.familia),
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [options?.partidas, selectedPartidaName],
  );
  const subPartidaOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (options?.partidas || [])
            .filter(
              (partida) =>
                partida.nivel === 3 &&
                partida.partida_nombre === selectedPartidaName &&
                partida.familia === form.familia,
            )
            .map((partida) => partida.sub_partida || partida.nombre)
            .filter((name) => name.trim()),
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [form.familia, options?.partidas, selectedPartidaName],
  );
  const existingAttachments = useMemo(
    () =>
      (editId && detail ? detail.attachments : []).filter(
        (attachment) => !removedAttachmentIds.has(String(attachment._id)),
      ),
    [detail, editId, removedAttachmentIds],
  );

  const toggleUser = (
    field: "assigneeIds" | "requiredAssigneeIds" | "distributionUserIds",
    userId: string,
    checked: boolean,
  ) => {
    setForm((current) => {
      const next = new Set(current[field]);
      if (checked) next.add(userId);
      else next.delete(userId);

      if (field === "assigneeIds" && !checked) {
        const nextRequired = new Set(current.requiredAssigneeIds);
        nextRequired.delete(userId);
        return { ...current, assigneeIds: next, requiredAssigneeIds: nextRequired };
      }
      return { ...current, [field]: next };
    });
  };

  const uploadFiles = async (rfiId: Id<"rfis">) => {
    for (const file of files) {
      const uploadUrl = await generateUploadUrl({ rfi_id: rfiId });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`No se pudo subir ${file.name}`);
      }
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      await addAttachment({
        rfi_id: rfiId,
        storage_id: storageId,
        nombre: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
      });
    }
  };

  const handleSubmit = async (mode: "draft" | "review") => {
    if (!projectId) return;
    if (!form.subject.trim() || !form.question.trim()) {
      toast.error("Completa el asunto y la pregunta");
      return;
    }
    if (mode === "review" && !form.responsibleUserId) {
      toast.error("Selecciona al responsable de la RFI antes de enviarla a revisión");
      return;
    }

    setSubmitting(mode);
    try {
      const values = {
        subject: form.subject,
        background: form.background || undefined,
        question: form.question,
        received_from_id: form.receivedFromId
          ? form.receivedFromId as Id<"users">
          : undefined,
        rfi_manager_id: form.responsibleUserId
          ? form.responsibleUserId as Id<"users">
          : undefined,
        assignee_ids: Array.from(form.assigneeIds) as Id<"users">[],
        required_assignee_ids: Array.from(
          form.requiredAssigneeIds,
        ) as Id<"users">[],
        distribution_user_ids: Array.from(
          form.distributionUserIds,
        ) as Id<"users">[],
        due_date: form.dueDate || undefined,
        location: form.location || undefined,
        drawing_number: form.drawingNumber || undefined,
        spec_section: form.specSection || undefined,
        partida_id: form.partidaId
          ? form.partidaId as Id<"partidas">
          : undefined,
        familia: form.familia || undefined,
        sub_partida: form.subPartida || undefined,
        project_stage: form.projectStage || undefined,
        cost_impact: form.costImpact,
        cost_impact_amount:
          form.costImpact === "yes" && form.costImpactAmount
            ? Number(form.costImpactAmount)
            : undefined,
        schedule_impact: form.scheduleImpact,
        schedule_impact_days:
          form.scheduleImpact === "yes" && form.scheduleImpactDays
            ? Number(form.scheduleImpactDays)
            : undefined,
        is_private: form.isPrivate,
        submit_for_review: mode === "review",
      };
      const savedRfiId = editId
        ? await updateRfi({
            id: editId,
            ...values,
            remove_attachment_ids: Array.from(
              removedAttachmentIds,
            ) as Id<"rfi_attachments">[],
          })
        : await createRfi({ proyecto: projectId, ...values });

      if (files.length > 0) {
        await uploadFiles(savedRfiId);
      }
      toast.success(
        editId
          ? "Cambios guardados"
          : mode === "review"
            ? "RFI enviada a revisión"
            : "Borrador de RFI guardado",
      );
      if (embedded) {
        onSaved?.(savedRfiId);
      } else {
        navigate(`/proyecto/${projectId}/rfis/${savedRfiId}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la RFI");
    } finally {
      setSubmitting(null);
    }
  };

  if (!projectId) {
    return <CenteredMessage message="No se identificó el proyecto." />;
  }

  if (options === undefined || (editId && detail === undefined)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-label="Cargando formulario" />
      </div>
    );
  }

  if (editId && detail && !detail.permissions.can_edit) {
    return (
      <CenteredMessage message="Esta RFI ya no puede editarse en su estado actual." />
    );
  }

  if (!editId && !options.can_create) {
    return (
      <CenteredMessage message="Tu rol puede consultar RFIs, pero no crear nuevas solicitudes." />
    );
  }

  return (
    <div
      className={cn(
        "bg-white",
        embedded
          ? "px-6 pb-8 pt-8"
          : "min-h-screen px-4 py-6 sm:px-6 lg:px-8",
      )}
      data-rfi-entry-form="true"
    >
      <div className={cn("space-y-5", !embedded && "mx-auto max-w-5xl")}>
        <header className="border-b border-[#C9C9C5] pb-6">
          {!embedded && (
            <Button asChild variant="ghost" className="-ml-3 mb-3 rounded-sm">
              <Link to={`/proyecto/${projectId}/rfis`}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Volver al registro
              </Link>
            </Button>
          )}
          <div>
              <p className="text-sm text-[#7A7979]">
                {editId && detail ? detail.rfi.code : "Registro de información"}
              </p>
              <h1 className="mt-1 text-2xl font-normal tracking-tight text-[#282822]">
                {editId && detail ? `Editar ${detail.rfi.code}` : "Nueva RFI"}
              </h1>
              <p className="mt-2 text-sm text-[#7A7979]">
                {options.project.nombre} ·{" "}
                {editId
                  ? "Actualiza la pregunta, el flujo o sus referencias."
                  : "Completa la pregunta, el flujo y sus referencias."}
              </p>
          </div>
        </header>

        <FormSection
          number="1"
          title="Pregunta"
          description="Define con precisión qué información falta y por qué es necesaria."
        >
          <Field className="md:col-span-2" label="Asunto" htmlFor="subject" required>
            <Input
              id="subject"
              value={form.subject}
              onChange={(event) =>
                setForm((current) => ({ ...current, subject: event.target.value }))
              }
              placeholder="Ej. Confirmar especificación de impermeabilización"
              className="rounded-sm"
            />
          </Field>
          <Field className="md:col-span-2" label="Antecedentes" htmlFor="background">
            <Textarea
              id="background"
              value={form.background}
              onChange={(event) =>
                setForm((current) => ({ ...current, background: event.target.value }))
              }
              placeholder="Contexto del hallazgo, decisiones previas o información disponible"
              className="min-h-28 rounded-sm"
            />
          </Field>
          <Field className="md:col-span-2" label="Pregunta" htmlFor="question" required>
            <Textarea
              id="question"
              value={form.question}
              onChange={(event) =>
                setForm((current) => ({ ...current, question: event.target.value }))
              }
              placeholder="Formula una pregunta concreta que pueda responderse oficialmente"
              className="min-h-36 rounded-sm"
            />
          </Field>
        </FormSection>

        <FormSection
          number="2"
          title="Flujo"
          description="Asigna responsabilidad, audiencia y fecha límite."
          icon={Users}
        >
          <RfiSelectField
            id="rfi-responsible"
            label="Responsable de la RFI"
            value={form.responsibleUserId}
            onChange={(value) =>
              setForm((current) => ({ ...current, responsibleUserId: value }))
            }
            options={responsibleUsers.map((user) => ({
              value: user._id,
              label: `${user.name} · ${formatApplicationRole(user.role)}`,
            }))}
            placeholder="Seleccionar responsable"
            hint="No es un rol adicional: esta responsabilidad puede asignarse a miembros con rol Administrador o Usuario."
          />
          <RfiSelectField
            id="received-from"
            label="Recibida de"
            value={form.receivedFromId}
            onChange={(value) =>
              setForm((current) => ({ ...current, receivedFromId: value }))
            }
            options={projectUsers.map((user) => ({
              value: user._id,
              label: `${user.name} · ${user.email}`,
            }))}
            placeholder="Sin especificar"
          />
          <Field label="Fecha límite" htmlFor="due-date">
            <RfiDatePicker
              id="due-date"
              value={form.dueDate}
              onChange={(value) =>
                setForm((current) => ({ ...current, dueDate: value }))
              }
            />
          </Field>
          <div className="md:col-span-2">
            <Label className="text-sm font-medium text-gray-900">
              Personas asignadas
            </Label>
            <p className="mt-1 text-xs text-gray-500">
              Marca quién puede responder y cuáles respuestas son obligatorias.
            </p>
            <RfiAssigneePicker
              users={projectUsers}
              value={Array.from(form.assigneeIds) as Id<"users">[]}
              className="mt-3"
              onChange={(assigneeIds) =>
                setForm((current) => {
                  const nextIds = new Set(assigneeIds);
                  return {
                    ...current,
                    assigneeIds: nextIds,
                    requiredAssigneeIds: new Set(
                      Array.from(current.requiredAssigneeIds).filter((userId) =>
                        nextIds.has(userId as Id<"users">),
                      ),
                    ),
                  };
                })
              }
            />
            {selectedAssignees.length > 0 && (
              <div className="mt-3 rounded-sm border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">
                  Respuestas obligatorias
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {selectedAssignees.map((user) => (
                    <label
                      key={user._id}
                      className="flex cursor-pointer items-center gap-2 text-xs text-gray-600"
                    >
                      <Checkbox
                        checked={form.requiredAssigneeIds.has(user._id)}
                        onCheckedChange={(checked) =>
                          toggleUser(
                            "requiredAssigneeIds",
                            user._id,
                            checked === true,
                          )
                        }
                      />
                      <span className="truncate">{user.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {selectedAssignees.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Puedes guardar el borrador sin asignados; deberán definirse antes de abrirlo.
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <Label className="text-sm font-medium text-gray-900">
              Lista de distribución
            </Label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {projectUsers.map((user) => (
                <label
                  key={user._id}
                  className="flex cursor-pointer items-center gap-3 rounded-sm border border-gray-200 p-3"
                >
                  <Checkbox
                    checked={form.distributionUserIds.has(user._id)}
                    onCheckedChange={(checked) =>
                      toggleUser(
                        "distributionUserIds",
                        user._id,
                        checked === true,
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-800">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {user.email}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </FormSection>

        <FormSection
          number="3"
          title="Referencias"
          description="La RFI queda vinculada al proyecto actual; selecciona su partida, familia y subpartida."
        >
          <Field className="md:col-span-2" label="Proyecto" htmlFor="project-reference">
            <Input
              id="project-reference"
              value={options.project.nombre}
              readOnly
              className="rounded-[4px] bg-[#F5F5F3] text-[#7A7979]"
            />
          </Field>
          <RfiSelectField
            id="partida"
            label="Partida"
            value={form.partidaId}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                partidaId: value,
                familia: "",
                subPartida: "",
              }))
            }
            options={partidaOptions.map((partida) => ({
              value: partida._id,
              label: partida.nombre,
            }))}
            placeholder="Sin partida vinculada"
          />
          <RfiSelectField
            id="familia"
            label="Familia"
            value={form.familia}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                familia: value,
                subPartida: "",
              }))
            }
            options={familiaOptions.map((familia) => ({
              value: familia,
              label: familia,
            }))}
            placeholder={
              form.partidaId && familiaOptions.length === 0
                ? "Sin familias disponibles"
                : "Seleccionar familia"
            }
            disabled={!form.partidaId || familiaOptions.length === 0}
          />
          <RfiSelectField
            id="sub-partida"
            label="Subpartida"
            value={form.subPartida}
            onChange={(value) =>
              setForm((current) => ({ ...current, subPartida: value }))
            }
            options={subPartidaOptions.map((subPartida) => ({
              value: subPartida,
              label: subPartida,
            }))}
            placeholder={
              form.familia && subPartidaOptions.length === 0
                ? "Sin subpartidas disponibles"
                : "Seleccionar subpartida"
            }
            disabled={!form.familia || subPartidaOptions.length === 0}
          />
          <Field label="Plano (opcional)" htmlFor="drawing">
            <Input
              id="drawing"
              value={form.drawingNumber}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  drawingNumber: event.target.value,
                }))
              }
              placeholder="Ej. ARQ-203"
              className="rounded-[4px]"
            />
          </Field>
        </FormSection>

        <FormSection
          number="4"
          title="Impacto y evidencia"
          description="Registra la evaluación inicial; puede permanecer por determinar."
        >
          <ImpactField
            id="cost-impact"
            label="Impacto en costo"
            value={form.costImpact}
            amount={form.costImpactAmount}
            amountLabel="Monto estimado"
            amountType="number"
            onValueChange={(value) =>
              setForm((current) => ({ ...current, costImpact: value }))
            }
            onAmountChange={(value) =>
              setForm((current) => ({ ...current, costImpactAmount: value }))
            }
          />
          <ImpactField
            id="schedule-impact"
            label="Impacto en programa"
            value={form.scheduleImpact}
            amount={form.scheduleImpactDays}
            amountLabel="Días estimados"
            amountType="number"
            onValueChange={(value) =>
              setForm((current) => ({ ...current, scheduleImpact: value }))
            }
            onAmountChange={(value) =>
              setForm((current) => ({ ...current, scheduleImpactDays: value }))
            }
          />
          <div className="relative md:col-span-2">
            <Label htmlFor="rfi-files" className="text-sm font-medium text-[#282822]">
              Imágenes y adjuntos
            </Label>
            <p className="mt-1 text-xs leading-5 text-[#7A7979]">
              Puedes agregar una o más imágenes, además de documentos de soporte.
            </p>
            <label
              htmlFor="rfi-files"
              className="mt-3 flex cursor-pointer items-center justify-center gap-3 rounded-[4px] border border-dashed border-[#B9B9B4] bg-[#FAFAF8] px-4 py-8 text-sm text-[#7A7979] hover:border-[#777770]"
            >
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              {files.length > 0
                ? "Agregar más imágenes o archivos"
                : "Agregar imágenes o archivos"}
            </label>
            <input
              id="rfi-files"
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="sr-only"
              onChange={(event) => {
                const selectedFiles = Array.from(event.target.files || []);
                setFiles((current) => [...current, ...selectedFiles]);
                event.target.value = "";
              }}
            />
            {editId && detail && detail.attachments.length > 0 && (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[#282822]">
                    Archivos actuales
                  </p>
                  {removedAttachmentIds.size > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 rounded-[4px] px-2 text-xs text-[#7A7979]"
                      onClick={() => setRemovedAttachmentIds(new Set())}
                    >
                      Deshacer eliminaciones
                    </Button>
                  )}
                </div>
                {existingAttachments.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {existingAttachments.map((attachment) => (
                      <ExistingAttachmentPreview
                        key={attachment._id}
                        attachment={attachment}
                        onRemove={() =>
                          setRemovedAttachmentIds((current) => {
                            const next = new Set(current);
                            next.add(String(attachment._id));
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-[4px] border border-dashed border-[#D9D9D5] px-4 py-3 text-xs text-[#7A7979]">
                    Los archivos marcados se eliminarán al guardar los cambios.
                  </p>
                )}
              </div>
            )}
            {files.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {files.map((file, index) => (
                  <SelectedFilePreview
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    file={file}
                    onRemove={() =>
                      setFiles((current) =>
                        current.filter((_, fileIndex) => fileIndex !== index),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
          <label className="md:col-span-2 flex cursor-pointer items-start gap-3 rounded-sm border border-gray-200 bg-gray-50 p-4">
            <Checkbox
              checked={form.isPrivate}
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  isPrivate: checked === true,
                }))
              }
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                RFI privada
              </span>
              <span className="mt-1 block text-xs leading-5 text-gray-500">
                Solo creador, responsable, asignados, distribución y
                administradores podrán verla.
              </span>
            </span>
          </label>
        </FormSection>

        <div className="sticky bottom-4 flex flex-col-reverse gap-3 rounded-[4px] border border-[#D9D9D5] bg-white/95 p-4 backdrop-blur sm:flex-row sm:justify-end">
          {embedded ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 min-w-[108px] rounded-[4px] border-[#D2D2CE] font-normal text-[#7A7979] shadow-none"
              onClick={onCancel}
            >
              Cancelar
            </Button>
          ) : (
            <Button asChild variant="outline" className="h-11 min-w-[108px] rounded-[4px] border-[#D2D2CE] font-normal text-[#7A7979] shadow-none">
              <Link to={`/proyecto/${projectId}/rfis`}>Cancelar</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-[4px] border-[#D2D2CE] px-5 font-normal text-[#282822] shadow-none"
            disabled={submitting !== null}
            onClick={() => handleSubmit("draft")}
          >
            {submitting === "draft" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {editId ? "Guardar cambios" : "Guardar borrador"}
          </Button>
          {(!editId || detail?.rfi.status === "draft") && (
            <Button
              type="button"
              className="h-11 rounded-[4px] bg-[#282822] px-5 font-normal text-white shadow-none hover:bg-[#282822]/90"
              disabled={submitting !== null}
              onClick={() => handleSubmit("review")}
            >
              {submitting === "review" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {editId ? "Guardar y enviar a revisión" : "Enviar a revisión"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function FormSection({
  number,
  title,
  description,
  icon: Icon,
  children,
}: {
  number: string;
  title: string;
  description: string;
  icon?: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[4px] border border-[#D9D9D5] bg-white p-5">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D9D9D5] bg-[#F0F0EE] text-sm font-medium text-[#7A7979]">
          {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : number}
        </div>
        <div>
          <h2 className="text-base font-medium text-[#282822]">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#7A7979]">{description}</p>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-[#282822]">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </Label>
      {children}
    </div>
  );
}

function SelectedFilePreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file, isImage]);

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[4px] border border-[#D9D9D5] bg-white p-2">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={`Vista previa de ${file.name}`}
          className="h-16 w-16 shrink-0 rounded-[4px] object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[4px] bg-[#F0F0EE] text-[#7A7979]">
          <Paperclip className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[#282822]">{file.name}</p>
        <p className="mt-1 text-xs text-[#7A7979]">
          {(file.size / 1024 / 1024).toFixed(1)} MB
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-8 w-8 shrink-0 rounded-[4px] text-[#7A7979] hover:bg-[#F0F0EE] hover:text-[#282822]"
        aria-label={`Quitar ${file.name}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function ExistingAttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: {
    _id: Id<"rfi_attachments">;
    nombre: string;
    type: string;
    size: number;
    url: string | null;
  };
  onRemove: () => void;
}) {
  const isImage = attachment.type.startsWith("image/") && attachment.url;

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[4px] border border-[#D9D9D5] bg-white p-2">
      {isImage ? (
        <img
          src={attachment.url || undefined}
          alt={`Vista previa de ${attachment.nombre}`}
          className="h-16 w-16 shrink-0 rounded-[4px] object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[4px] bg-[#F0F0EE] text-[#7A7979]">
          <Paperclip className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[#282822]">{attachment.nombre}</p>
        <p className="mt-1 text-xs text-[#7A7979]">
          {(attachment.size / 1024 / 1024).toFixed(1)} MB
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-8 w-8 shrink-0 rounded-[4px] text-[#7A7979] hover:bg-red-50 hover:text-red-700"
        aria-label={`Quitar ${attachment.nombre}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function RfiSelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select
        value={value || EMPTY_SELECT_VALUE}
        onValueChange={(nextValue) =>
          onChange(nextValue === EMPTY_SELECT_VALUE ? "" : nextValue)
        }
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="h-11 rounded-[4px] border-[#B9B9B4] bg-white text-[#282822] shadow-none focus:ring-[#777770]/20"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-[4px] border-[#D9D9D5] bg-white text-[#282822]">
          <SelectItem value={EMPTY_SELECT_VALUE}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="mt-2 text-xs leading-5 text-[#7A7979]">{hint}</p>}
    </Field>
  );
}

function ImpactField({
  id,
  label,
  value,
  amount,
  amountLabel,
  amountType,
  onValueChange,
  onAmountChange,
}: {
  id: string;
  label: string;
  value: ImpactValue;
  amount: string;
  amountLabel: string;
  amountType: "number";
  onValueChange: (value: ImpactValue) => void;
  onAmountChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <RfiSelectField
        id={id}
        label={label}
        value={value}
        onChange={(next) => onValueChange(next as ImpactValue)}
        options={IMPACT_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        placeholder="Seleccionar"
      />
      {value === "yes" && (
        <Field label={amountLabel} htmlFor={`${id}-amount`}>
          <Input
            id={`${id}-amount`}
            type={amountType}
            min="0"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            className="rounded-sm"
          />
        </Field>
      )}
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
