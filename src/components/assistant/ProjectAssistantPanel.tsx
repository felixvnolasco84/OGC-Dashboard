import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AssistantAnswer, AssistantReference } from "../../../convex/assistantTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArrowLeft,
  Bot,
  CircleGauge,
  ExternalLink,
  History,
  Loader2,
  MessageSquareText,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import AssistantComposer from "./AssistantComposer";

const STARTER_PROMPTS = [
  "Dame el estado ejecutivo de @Proyecto.",
  "Compara presupuesto, avance y riesgos de @Proyecto A y @Proyecto B.",
  "¿Qué pendientes tiene @Persona en @Proyecto?",
  "¿Qué tareas, requisiciones o RFIs requieren atención esta semana?",
];

const STATUS_META: Record<AssistantAnswer["overall_status"], { label: string; className: string }> = {
  on_track: { label: "En curso", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  attention: { label: "Requiere atención", className: "border-amber-200 bg-amber-50 text-amber-700" },
  critical: { label: "Crítico", className: "border-red-200 bg-red-50 text-red-700" },
  insufficient_data: { label: "Datos insuficientes", className: "border-gray-200 bg-gray-50 text-gray-600" },
};

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatConversationDate(timestamp: number) {
  return new Intl.DateTimeFormat("es-MX", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function EvidenceCitations({
  ids,
  evidence,
}: {
  ids: string[];
  evidence: Map<string, AssistantAnswer["evidence"][number]>;
}) {
  return (
    <span className="ml-1 inline-flex gap-1 align-middle">
      {ids.map((id, index) => {
        const item = evidence.get(id);
        return item ? (
          <a
            key={id}
            href={item.url}
            title={`${item.label}${item.observed_value ? `: ${item.observed_value}` : ""}`}
            className="text-[10px] font-medium text-blue-600 hover:underline"
          >
            [{index + 1}]
          </a>
        ) : null;
      })}
    </span>
  );
}

function AnswerView({ answer, onFollowUp }: { answer: AssistantAnswer; onFollowUp: (prompt: string) => void }) {
  const evidence = new Map(answer.evidence.map((item) => [item.id, item]));
  const status = STATUS_META[answer.overall_status];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn("rounded-full font-medium", status.className)}>
          <CircleGauge className="mr-1 h-3.5 w-3.5" /> {status.label}
        </Badge>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{answer.summary}</p>

      {answer.metrics.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Indicadores</h4>
          <div className="grid grid-cols-2 gap-2">
            {answer.metrics.map((metric, index) => (
              <div key={`${metric.label}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">{metric.label}<EvidenceCitations ids={metric.evidence_ids} evidence={evidence} /></p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{metric.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {answer.risks.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Riesgos y atención</h4>
          <div className="space-y-2">
            {answer.risks.map((risk, index) => (
              <div key={`${risk.title}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{risk.title}<EvidenceCitations ids={risk.evidence_ids} evidence={evidence} /></p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">{risk.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {answer.recommendations.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Próximos pasos sugeridos</h4>
          <ol className="space-y-2">
            {answer.recommendations.map((recommendation, index) => (
              <li key={`${recommendation.action}-${index}`} className="flex gap-2 text-sm leading-5 text-gray-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] text-white">{index + 1}</span>
                <span>{recommendation.action}<EvidenceCitations ids={recommendation.evidence_ids} evidence={evidence} /></span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {answer.evidence.length > 0 && (
        <details className="group rounded-xl border border-gray-100 bg-white p-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-gray-600">
            Evidencia consultada ({answer.evidence.length})
          </summary>
          <div className="mt-3 space-y-1.5">
            {answer.evidence.map((item) => (
              <a key={item.id} href={item.url} className="flex items-start justify-between gap-3 rounded-lg px-2 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="text-gray-400">{item.observed_value || item.as_of}</span>
                </span>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              </a>
            ))}
          </div>
        </details>
      )}

      {answer.limitations.length > 0 && (
        <div className="rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-500">
          {answer.limitations.map((limitation, index) => <p key={`${limitation}-${index}`}>{limitation}</p>)}
        </div>
      )}

      {answer.follow_up_prompts.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Puedes continuar con</h4>
          <div className="space-y-2">
            {answer.follow_up_prompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => onFollowUp(prompt)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-left text-xs leading-5 text-gray-600 transition hover:border-gray-300 hover:bg-gray-50">
                {prompt}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ProjectAssistantPanel({
  open,
  onOpenChange,
  routeProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeProjectId?: Id<"desarrollos">;
}) {
  const [activeConversationId, setActiveConversationId] = useState<Id<"assistant_conversations">>();
  const [showHistory, setShowHistory] = useState(false);
  const [text, setText] = useState("");
  const [references, setReferences] = useState<AssistantReference[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [localTurn, setLocalTurn] = useState<{ text: string; references: AssistantReference[]; failed?: boolean }>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversations = useQuery(api.assistant.listConversations, open ? {} : "skip");
  const messages = useQuery(
    api.assistant.getMessages,
    open && activeConversationId ? { conversation_id: activeConversationId } : "skip",
  );
  const routeProject = useQuery(
    api.desarrollos.getById,
    open && routeProjectId ? { id: routeProjectId } : "skip",
  );
  const sendMessage = useAction(api.assistant.sendMessage);
  const archiveConversation = useMutation(api.assistant.archiveConversation);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, [open, messages, localTurn]);

  const currentConversation = useMemo(
    () => conversations?.find((conversation) => conversation._id === activeConversationId),
    [activeConversationId, conversations],
  );

  const newChat = () => {
    setActiveConversationId(undefined);
    setShowHistory(false);
    setText("");
    setReferences([]);
    setLocalTurn(undefined);
  };

  const submit = async (retryTurn?: { text: string; references: AssistantReference[] }) => {
    const nextText = retryTurn?.text ?? text;
    const nextReferences = retryTurn?.references ?? references;
    if (!nextText.trim() || submitting) return;
    setSubmitting(true);
    setLocalTurn({ text: nextText, references: nextReferences });
    try {
      const result = await sendMessage({
        conversation_id: activeConversationId,
        text: nextText,
        references: nextReferences,
        route_project_id: routeProjectId,
        client_request_id: newRequestId(),
      });
      setActiveConversationId(result.conversation_id);
      setText("");
      setReferences([]);
      setLocalTurn(undefined);
    } catch (error) {
      setLocalTurn({ text: nextText, references: nextReferences, failed: true });
      toast.error(error instanceof Error ? error.message : "No fue posible obtener una respuesta");
    } finally {
      setSubmitting(false);
    }
  };

  const archiveCurrent = async () => {
    if (!activeConversationId) return;
    await archiveConversation({ conversation_id: activeConversationId, archived: true });
    toast.success("Conversación archivada");
    newChat();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]">
        <SheetHeader className="shrink-0 border-b border-gray-100 px-5 py-4 pr-12 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {showHistory && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowHistory(false)} aria-label="Volver al chat">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="truncate text-base">{showHistory ? "Historial" : currentConversation?.title || "Asistente de proyectos"}</SheetTitle>
                <SheetDescription className="truncate text-xs">
                  {showHistory ? "Tus conversaciones guardadas" : routeProject ? `Contexto actual: ${routeProject.nombre}` : "Consulta de sólo lectura"}
                </SheetDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!showHistory && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowHistory(true)} aria-label="Abrir historial">
                  <History className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={newChat} aria-label="Nuevo chat">
                <Plus className="h-4 w-4" />
              </Button>
              {activeConversationId && !showHistory && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={archiveCurrent} aria-label="Archivar conversación">
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {showHistory ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Button variant="outline" className="mb-4 w-full justify-start gap-2 rounded-xl" onClick={newChat}>
              <Plus className="h-4 w-4" /> Nuevo chat
            </Button>
            {conversations === undefined ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : conversations.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500">Todavía no tienes conversaciones.</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conversation) => (
                  <button
                    key={conversation._id}
                    type="button"
                    onClick={() => {
                      setActiveConversationId(conversation._id);
                      setShowHistory(false);
                      setLocalTurn(undefined);
                    }}
                    className="w-full rounded-xl border border-gray-100 p-3 text-left transition hover:border-gray-200 hover:bg-gray-50"
                  >
                    <p className="truncate text-sm font-medium text-gray-800">{conversation.title}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatConversationDate(conversation.updated_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {!activeConversationId && !localTurn ? (
                <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center py-6">
                  <div className="mb-6 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
                      <Bot className="h-6 w-6" />
                    </span>
                    <h3 className="text-lg font-medium text-gray-900">¿Qué quieres revisar?</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-500">Puedo sintetizar el estado, comparar hasta tres proyectos y localizar pendientes respaldados por datos.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button key={prompt} type="button" onClick={() => { setText(prompt); setReferences([]); }} className="rounded-xl border border-gray-200 p-3 text-left text-sm leading-5 text-gray-600 transition hover:border-gray-300 hover:bg-gray-50">
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-400">
                    <ShieldCheck className="h-3.5 w-3.5" /> No modifica registros ni consulta fuentes externas
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages === undefined && activeConversationId ? (
                    <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : messages?.map((message) => (
                    <div key={message._id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      {message.role === "user" ? (
                        <div className="max-w-[86%] rounded-2xl rounded-br-md bg-gray-900 px-4 py-3 text-sm leading-6 text-white">{message.content}</div>
                      ) : (
                        <div className="w-full rounded-2xl rounded-bl-md border border-gray-100 bg-white p-4 shadow-sm">
                          {message.status === "pending" ? (
                            <div className="flex items-center gap-3 py-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Consultando datos del proyecto...</div>
                          ) : message.status === "failed" ? (
                            <div className="space-y-3">
                              <p className="text-sm text-red-700">{message.error || "No fue posible generar la respuesta."}</p>
                              {message.reply_to_message_id && (() => {
                                const original = messages.find((candidate) => candidate._id === message.reply_to_message_id);
                                return original ? (
                                  <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={() => submit({ text: original.content, references: original.references as AssistantReference[] })} disabled={submitting}>
                                    <RotateCcw className="h-3.5 w-3.5" /> Reintentar
                                  </Button>
                                ) : null;
                              })()}
                            </div>
                          ) : message.answer ? (
                            <AnswerView answer={message.answer as AssistantAnswer} onFollowUp={(prompt) => { setText(prompt); setReferences([]); }} />
                          ) : (
                            <p className="text-sm text-gray-700">{message.content}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {localTurn && (!activeConversationId || localTurn.failed) && (
                    <>
                      <div className="flex justify-end">
                        <div className="max-w-[86%] rounded-2xl rounded-br-md bg-gray-900 px-4 py-3 text-sm leading-6 text-white">{localTurn.text}</div>
                      </div>
                      <div className="rounded-2xl rounded-bl-md border border-gray-100 bg-white p-4 shadow-sm">
                        {localTurn.failed ? (
                          <div className="space-y-3">
                            <p className="text-sm text-red-700">La respuesta falló. El mensaje quedó guardado si el servidor alcanzó a iniciar la conversación.</p>
                            <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={() => submit(localTurn)} disabled={submitting}>
                              <RotateCcw className="h-3.5 w-3.5" /> Reintentar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 py-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Consultando datos del proyecto...</div>
                        )}
                      </div>
                    </>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-100 bg-white p-4">
              <AssistantComposer
                value={text}
                references={references}
                routeProjectId={routeProjectId}
                submitting={submitting}
                onChange={(nextText, nextReferences) => {
                  setText(nextText);
                  setReferences(nextReferences);
                }}
                onSubmit={() => submit()}
              />
              {!routeProjectId && references.every((reference) => !reference.project_id && reference.type !== "project") && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600">
                  <MessageSquareText className="h-3 w-3" /> Usa @Proyecto para establecer el contexto.
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
