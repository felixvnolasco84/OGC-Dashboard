import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleMinus,
  FileText,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatRfiCompactDate,
  formatRfiDueDistance,
  formatRfiRequestedDate,
  RFI_STATUS,
  type RfiDisplayStatus,
} from "./rfiUi";
import { useRfiUserDirectory } from "./useRfiUserDirectory";
import { RfiAssigneePicker } from "./RfiAssigneePicker";
import { RfiDatePicker } from "./RfiDatePicker";
import RFIDetailPage from "./RFIDetailPage";
import RFINewPage from "./RFINewPage";

type RfiTab = "all" | "open" | "mine" | "overdue" | "drafts" | "closed";

const TAB_LABELS: Array<{ id: RfiTab; label: string }> = [
  { id: "all", label: "Total" },
  { id: "open", label: "Abiertas" },
  { id: "mine", label: "Mi responsabilidad" },
  { id: "overdue", label: "Vencidas" },
  { id: "drafts", label: "Borradores" },
  { id: "closed", label: "Cerradas" },
];

const RFI_TABLE_GRID =
  "grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.45fr)_minmax(175px,1.15fr)_minmax(170px,1.15fr)_minmax(180px,1fr)_minmax(125px,0.76fr)_minmax(140px,0.78fr)_32px]";
const RFI_MAIN_CELL = "min-w-0 md:col-span-2 xl:col-span-1";
const RFI_FIELD_CELL = "min-w-0";
const RFI_ACTION_CELL =
  "flex min-w-0 justify-end md:col-span-2 xl:col-span-1";
const RFI_MOBILE_LABEL =
  "mb-1 block text-xs font-medium text-[#A5A5A0] xl:hidden";

export default function RFIListPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const [activeTab, setActiveTab] = useState<RfiTab>("all");
  const [search, setSearch] = useState("");
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickSubject, setQuickSubject] = useState("");
  const [quickQuestion, setQuickQuestion] = useState("");
  const [quickAssigneeIds, setQuickAssigneeIds] = useState<Id<"users">[]>([]);
  const [quickDueDate, setQuickDueDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRfiId, setSelectedRfiId] = useState<Id<"rfis"> | null>(
    null,
  );
  const [sheetMode, setSheetMode] = useState<"detail" | "edit">("detail");
  const questionInputRef = useRef<HTMLInputElement>(null);

  const projectId = proyectoId as Id<"desarrollos"> | undefined;
  const project = useQuery(
    api.desarrollos.getById,
    projectId ? { id: projectId } : "skip",
  );
  const rfis = useQuery(
    api.rfis.listByProject,
    projectId ? { proyecto: projectId } : "skip",
  );
  const formOptions = useQuery(
    api.rfis.getFormOptions,
    projectId ? { proyecto: projectId } : "skip",
  );
  const createRfi = useMutation(api.rfis.create);
  const { users: projectUsers, usersById } = useRfiUserDirectory(
    formOptions?.users,
  );
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

  const counts = useMemo(() => {
    const items = rfis || [];
    return {
      all: items.length,
      open: items.filter(
        (rfi) =>
          rfi.status === "open" ||
          rfi.status === "pending_manager_review",
      ).length,
      mine: items.filter((rfi) => rfi.is_my_responsibility).length,
      overdue: items.filter((rfi) => rfi.derived_status === "overdue").length,
      drafts: items.filter((rfi) => rfi.status === "draft").length,
      closed: items.filter((rfi) => rfi.status === "closed").length,
    };
  }, [rfis]);

  const filteredRfis = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (rfis || []).filter((rfi) => {
      const matchesTab =
        activeTab === "all"
          ? true
          : activeTab === "open"
            ? rfi.status === "open" ||
              rfi.status === "pending_manager_review"
            : activeTab === "mine"
              ? rfi.is_my_responsibility
              : activeTab === "overdue"
                ? rfi.derived_status === "overdue"
                : activeTab === "drafts"
                  ? rfi.status === "draft"
                  : rfi.status === "closed";

      const managerName = rfi.manager
        ? usersById.get(rfi.manager._id)?.name ?? rfi.manager.name
        : "";
      const assigneeNames = rfi.assignees
        .map((person) => usersById.get(person._id)?.name ?? person.name)
        .join(" ");
      const partidaName = rfi.partida_id
        ? partidasById.get(String(rfi.partida_id))?.nombre || ""
        : "";
      const matchesSearch =
        !normalizedSearch ||
        rfi.code.toLowerCase().includes(normalizedSearch) ||
        rfi.subject.toLowerCase().includes(normalizedSearch) ||
        rfi.question.toLowerCase().includes(normalizedSearch) ||
        rfi.location?.toLowerCase().includes(normalizedSearch) ||
        partidaName.toLowerCase().includes(normalizedSearch) ||
        rfi.familia?.toLowerCase().includes(normalizedSearch) ||
        rfi.sub_partida?.toLowerCase().includes(normalizedSearch) ||
        managerName.toLowerCase().includes(normalizedSearch) ||
        assigneeNames.toLowerCase().includes(normalizedSearch);

      return matchesTab && matchesSearch;
    });
  }, [activeTab, partidasById, rfis, search, usersById]);

  const resetQuickCreate = () => {
    setQuickSubject("");
    setQuickQuestion("");
    setQuickAssigneeIds([]);
    setQuickDueDate("");
    setIsQuickCreateOpen(false);
  };

  const startQuickCreate = () => {
    setQuickSubject("");
    setQuickQuestion("");
    setQuickAssigneeIds([]);
    setQuickDueDate("");
    setIsQuickCreateOpen(true);
  };

  const handleQuickCreate = async () => {
    if (!projectId || isCreating) return;
    const subject = quickSubject.trim();
    const question = quickQuestion.trim();
    if (!subject) {
      toast.error("Agrega el asunto de la RFI");
      return;
    }
    if (!question) {
      toast.error("Agrega la pregunta de la RFI");
      questionInputRef.current?.focus();
      return;
    }

    setIsCreating(true);
    try {
      const rfiId = await createRfi({
        proyecto: projectId,
        subject,
        question,
        assignee_ids: quickAssigneeIds,
        required_assignee_ids: [],
        distribution_user_ids: [],
        due_date: quickDueDate || undefined,
        cost_impact: "unknown",
        schedule_impact: "unknown",
        is_private: false,
        submit_for_review: false,
      });
      toast.success("Borrador creado. Completa los detalles de la RFI.");
      resetQuickCreate();
      setSelectedRfiId(rfiId);
      setSheetMode("edit");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo crear el borrador de la RFI",
      );
    } finally {
      setIsCreating(false);
    }
  };

  if (!projectId) {
    return <RfiError message="No se identificó el proyecto." />;
  }

  if (project === undefined || rfis === undefined || formOptions === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2
          className="h-8 w-8 animate-spin text-gray-400"
          aria-label="Cargando RFIs"
        />
      </div>
    );
  }

  if (!project) {
    return <RfiError message="El proyecto no existe o no tienes acceso." />;
  }

  return (
    <main className="min-h-screen bg-white text-left">
      <header className="border-b border-gray-200 px-6 py-8 lg:px-16">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-gray-500">Proyecto</p>
            <h1 className="mt-1 text-3xl font-normal text-gray-900">
              RFIs {project.nombre}
            </h1>
          </div>
          {formOptions.can_create && (
            <Button
              type="button"
              variant="outline"
              onClick={startQuickCreate}
              disabled={isQuickCreateOpen}
              className="h-14 gap-3 rounded-sm border-[#DBDBDB] bg-white px-8 text-base font-normal text-[#898982] shadow-none hover:bg-white hover:text-[#898982]"
            >
              <Plus className="h-5 w-5 text-[#898982]" />
              Nueva RFI
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-8 px-6 py-8 lg:px-16">
        <nav
          className="flex overflow-x-auto border-b border-[#E6E6E6]"
          aria-label="Vistas del registro RFI"
        >
          {TAB_LABELS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex min-w-36 items-center gap-4 whitespace-nowrap px-1 py-4 text-sm text-gray-600",
                activeTab === tab.id &&
                  "border-b-2 border-gray-900 text-gray-900",
              )}
            >
              <span>{tab.label}</span>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-sm bg-[#FBFBFB] px-2 text-xs text-gray-600">
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </nav>

        <div className="rounded-sm border border-[#E6E6E6] bg-white p-4">
          <label className="relative block">
            <span className="sr-only">Buscar RFI</span>
            <Search
              className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9AA3AF]"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por número, asunto, pregunta o responsable"
              className="h-9 rounded-sm border-[#E6E6E6] bg-white pl-14 text-base font-normal text-gray-900 shadow-none placeholder:text-[#6B7280] focus-visible:ring-[#D1D5DB]"
            />
          </label>
        </div>

        <section aria-label="Tabla de RFIs" className="bg-white">
          <div className="px-4 pb-2 sm:px-8">
            <div
              className={cn(
                "grid items-center gap-5 text-base text-[#7A7979]",
                RFI_TABLE_GRID,
              )}
            >
              <span className="hidden xl:block">RFI</span>
              <span className="hidden xl:block">Solicita</span>
              <span className="hidden xl:block">Responsable</span>
              <span className="hidden xl:block">Adjunto</span>
              <span className="hidden xl:block">Vencimiento</span>
              <span className="hidden xl:block">Status</span>
              <span className="hidden xl:block" />
            </div>
          </div>

          {isQuickCreateOpen && (
            <div className="px-4 py-1 sm:px-8">
              <div
                className={cn(
                  "grid min-h-[112px] items-center gap-5 rounded-[4px] border border-[#707070] bg-white px-4 py-4 xl:px-8",
                  RFI_TABLE_GRID,
                )}
              >
                <div className={RFI_MAIN_CELL}>
                  <span className={RFI_MOBILE_LABEL}>RFI</span>
                  <Input
                    autoFocus
                    value={quickSubject}
                    disabled={isCreating}
                    onChange={(event) => setQuickSubject(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        questionInputRef.current?.focus();
                      }
                      if (event.key === "Escape") resetQuickCreate();
                    }}
                    placeholder="Asunto de la RFI"
                    className="h-7 border-transparent bg-transparent px-1 text-sm font-medium text-gray-900 shadow-none hover:border-[#E6E6E6] focus-visible:border-[#E6E6E6] focus-visible:ring-0"
                  />
                  <Input
                    ref={questionInputRef}
                    value={quickQuestion}
                    disabled={isCreating}
                    onChange={(event) => setQuickQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleQuickCreate();
                      }
                      if (event.key === "Escape") resetQuickCreate();
                    }}
                    placeholder="¿Qué información necesitas?"
                    className="mt-1 h-7 border-transparent bg-transparent px-1 text-xs text-[#7A7979] shadow-none hover:border-[#D5D5D1] focus-visible:border-[#D5D5D1] focus-visible:ring-0"
                  />
                </div>
                <div className={RFI_FIELD_CELL}>
                  <span className={RFI_MOBILE_LABEL}>Solicita</span>
                  <p className="text-sm text-[#282822]">
                    {formOptions.current_user.name}
                  </p>
                  <p className="mt-1 text-xs text-[#7A7979]">Nueva solicitud</p>
                </div>
                <div className={RFI_FIELD_CELL}>
                  <span className={RFI_MOBILE_LABEL}>Responsable</span>
                  <RfiAssigneePicker
                    users={projectUsers}
                    value={quickAssigneeIds}
                    disabled={isCreating}
                    onChange={setQuickAssigneeIds}
                    className="h-8 border-transparent bg-transparent px-0 hover:bg-transparent"
                  />
                </div>
                <div className={RFI_FIELD_CELL}>
                  <span className={RFI_MOBILE_LABEL}>Adjunto</span>
                  <span className="text-sm text-[#7A7979]">Sin adjunto</span>
                </div>
                <div className={RFI_FIELD_CELL}>
                  <span className={RFI_MOBILE_LABEL}>Vencimiento</span>
                  <RfiDatePicker
                    value={quickDueDate}
                    disabled={isCreating}
                    onChange={setQuickDueDate}
                    className="h-8 border-transparent bg-transparent px-0 hover:bg-transparent"
                  />
                </div>
                <div className={RFI_FIELD_CELL}>
                  <span className={RFI_MOBILE_LABEL}>Status</span>
                  <RfiStatusBadge label="Borrador" color="#ADADAD" muted />
                </div>
                <div className={cn(RFI_ACTION_CELL, "items-center gap-1")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={resetQuickCreate}
                    disabled={isCreating}
                    className="h-7 w-7 text-[#A3A39E] hover:bg-[#F1F1F1] hover:text-[#898982]"
                    aria-label="Cancelar nueva RFI"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleQuickCreate()}
                    disabled={isCreating}
                    className="h-7 w-7 text-[#A3A39E] hover:bg-[#F1F1F1] hover:text-[#898982]"
                    aria-label="Crear borrador y continuar"
                  >
                    {isCreating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-0">
            {filteredRfis.map((rfi) => {
              const displayStatus = rfi.derived_status as RfiDisplayStatus;
              const status = RFI_STATUS[displayStatus] || RFI_STATUS.open;
              const managerName = rfi.manager
                ? usersById.get(rfi.manager._id)?.name ?? rfi.manager.name
                : "Sin responsable";
              const assignedNames = rfi.assignees.map(
                (person) => usersById.get(person._id)?.name ?? person.name,
              );
              const creatorName = rfi.creator
                ? usersById.get(rfi.creator._id)?.name ?? rfi.creator.name
                : "Usuario sin nombre";
              const responsibleNames = Array.from(
                new Set(
                  [managerName, ...assignedNames].filter(
                    (name) => name && name !== "Sin responsable",
                  ),
                ),
              ).slice(0, 3);
              const referencedPartida = rfi.partida_id
                ? partidasById.get(String(rfi.partida_id))
                : undefined;
              const reference = [
                referencedPartida?.nombre,
                rfi.familia,
                rfi.sub_partida,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <div key={rfi._id} className="group py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRfiId(rfi._id);
                      setSheetMode("detail");
                    }}
                    className={cn(
                      "grid min-h-[112px] w-full items-center gap-5 overflow-hidden rounded-[4px] border border-[#D9D9D5] bg-white px-4 py-4 text-left transition-colors hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#282822]/20 xl:px-8",
                      RFI_TABLE_GRID,
                    )}
                  >
                    <div className={RFI_MAIN_CELL}>
                      <span className={RFI_MOBILE_LABEL}>RFI</span>
                      <p className="truncate text-sm text-[#7A7979]">
                        {rfi.code}
                      </p>
                      <p className="mt-1 truncate text-base font-medium text-[#282822]">
                        {rfi.subject}
                      </p>
                      <p className="mt-1 truncate text-xs uppercase text-[#7A7979]">
                        {reference || project.nombre}
                      </p>
                    </div>
                    <div className={RFI_FIELD_CELL}>
                      <span className={RFI_MOBILE_LABEL}>Solicita</span>
                      <p className="truncate text-base text-[#7A7979]">
                        {creatorName}
                      </p>
                      <p className="mt-1 truncate text-xs text-[#7A7979]">
                        Solicitado el {formatRfiRequestedDate(rfi.created_at)}
                      </p>
                    </div>
                    <div className={RFI_FIELD_CELL}>
                      <span className={RFI_MOBILE_LABEL}>Responsable</span>
                      <AvatarStack names={responsibleNames} />
                    </div>
                    <div className={RFI_FIELD_CELL}>
                      <span className={RFI_MOBILE_LABEL}>Adjunto</span>
                      {rfi.first_attachment ? (
                        <div className="flex min-w-0 items-center gap-2 text-sm text-[#282822]">
                          <FileText className="h-5 w-5 shrink-0 text-[#7A7979]" />
                          <span className="truncate">{rfi.first_attachment.nombre}</span>
                          {rfi.attachment_count > 1 && (
                            <span className="shrink-0 text-xs text-[#7A7979]">
                              +{rfi.attachment_count - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[#7A7979]">Sin adjunto</span>
                      )}
                    </div>
                    <div className={RFI_FIELD_CELL}>
                      <span className={RFI_MOBILE_LABEL}>Vencimiento</span>
                      <p
                        className={cn(
                          "text-base text-[#7A7979]",
                          displayStatus === "overdue" && "text-[#E75F79]",
                        )}
                      >
                        {formatRfiCompactDate(rfi.due_date)}
                      </p>
                      <p className="mt-1 text-xs text-[#282822]">
                        {formatRfiDueDistance(rfi.due_date)}
                      </p>
                    </div>
                    <div className={RFI_FIELD_CELL}>
                      <span className={RFI_MOBILE_LABEL}>Status</span>
                      <RfiStatusBadge
                        label={status.label}
                        color={status.color}
                        muted={status.color === "#CFCFCD" || status.color === "#ADADAD"}
                      />
                    </div>
                    <div className={cn(RFI_ACTION_CELL, "items-center")}>
                      <ArrowRight className="h-5 w-5 text-[#7A7979] transition-transform group-hover:translate-x-0.5 group-hover:text-[#282822]" />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {filteredRfis.length === 0 && !isQuickCreateOpen && (
            <div className="flex min-h-32 items-center justify-center px-6 text-sm text-gray-500">
              No hay RFIs con los filtros actuales.
            </div>
          )}

          {formOptions.can_create && !isQuickCreateOpen && (
            <div className="px-4 py-2 sm:px-8">
              <button
                type="button"
                onClick={startQuickCreate}
                className="flex h-6 items-center gap-2 text-xs text-gray-500 hover:text-gray-900"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar RFI
              </button>
            </div>
          )}
        </section>
      </div>

      <Sheet
        open={Boolean(selectedRfiId)}
        onOpenChange={(open) => {
          if (!open) setSelectedRfiId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto rounded-l-[4px] border border-[#777770] bg-white p-0 text-[#282822] sm:max-w-[632px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {sheetMode === "detail" ? "Detalle de RFI" : "Editar RFI"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "detail"
                ? "Consulta la información, respuestas e historial de la RFI."
                : "Actualiza responsables, fecha, pregunta y referencias de la RFI."}
            </SheetDescription>
          </SheetHeader>
          {selectedRfiId && sheetMode === "detail" ? (
            <RFIDetailPage
              embedded
              projectIdOverride={projectId}
              rfiIdOverride={selectedRfiId}
              onEdit={() => setSheetMode("edit")}
              onDeleted={() => {
                setSelectedRfiId(null);
                setSheetMode("detail");
              }}
            />
          ) : selectedRfiId ? (
            <RFINewPage
              embedded
              projectIdOverride={projectId}
              rfiIdOverride={selectedRfiId}
              onCancel={() => setSheetMode("detail")}
              onSaved={() => setSheetMode("detail")}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function AvatarStack({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-sm text-[#7A7979]">Sin responsable</span>;
  }

  return (
    <div className="flex -space-x-2" aria-label={names.join(", ")}>
      {names.map((name, index) => (
        <span
          key={name}
          title={name}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border-2 border-white text-base text-[#7A7979]",
            index % 2 === 0 ? "bg-[#DEDEDC]" : "bg-[#F0F0EE]",
          )}
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function RfiStatusBadge({
  label,
  color,
  muted = false,
}: {
  label: string;
  color: string;
  muted?: boolean;
}) {
  const isPositive = color === "#50AC66";
  return (
    <span
      className="inline-flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-[4px] border bg-white px-4 text-sm"
      style={{ borderColor: muted ? "#D5D5D1" : color, color: muted ? "#7A7979" : color }}
    >
      {isPositive ? (
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
      ) : (
        <CircleMinus className="h-5 w-5 text-[#CFCFCD]" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

function RfiError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="max-w-md text-center">
        <CircleAlert
          className="mx-auto h-10 w-10 text-red-500"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-xl font-medium text-gray-900">
          No se pudo abrir RFIs
        </h1>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}
