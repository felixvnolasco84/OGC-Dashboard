import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getActiveMention, rebaseMentionRanges } from "@/lib/mentionRanges";
import { Loader2, Send, X } from "lucide-react";
import type { AssistantReference } from "../../../convex/assistantTypes";

type ReferenceSuggestion = {
  type: AssistantReference["type"];
  id: string;
  project_id: string;
  label: string;
  subtitle: string;
  url: string;
};

const TYPE_LABELS: Record<AssistantReference["type"], string> = {
  project: "Proyectos",
  person: "Personas",
  metric: "Indicadores",
  task: "Tareas",
  requisition: "Requisiciones",
  rfi: "RFIs",
};

export default function AssistantComposer({
  value,
  references,
  routeProjectId,
  submitting,
  onChange,
  onSubmit,
}: {
  value: string;
  references: AssistantReference[];
  routeProjectId?: Id<"desarrollos">;
  submitting: boolean;
  onChange: (value: string, references: AssistantReference[]) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeMention = getActiveMention(value, caret);
  const explicitProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const reference of references) {
      ids.add(reference.type === "project" ? reference.id : reference.project_id);
    }
    return [...ids];
  }, [references]);
  const contextProjectIds = useMemo(() => {
    const ids = new Set(explicitProjectIds);
    if (!ids.size && routeProjectId) ids.add(routeProjectId);
    return [...ids].slice(0, 3) as Id<"desarrollos">[];
  }, [explicitProjectIds, routeProjectId]);
  const suggestions = useQuery(
    api.assistant.searchReferences,
    activeMention && references.length < 10
      ? { query: activeMention.query, project_ids: contextProjectIds }
      : "skip",
  ) as ReferenceSuggestion[] | undefined;

  const visibleSuggestions = useMemo(() => {
    if (!activeMention) return [];
    const identities = new Set(references.map((reference) => `${reference.type}:${reference.id}:${reference.project_id || ""}`));
    return (suggestions || []).filter((suggestion) => !identities.has(`${suggestion.type}:${suggestion.id}:${suggestion.project_id || ""}`));
  }, [activeMention, references, suggestions]);

  const setCaretFromTextarea = () => {
    setCaret(textareaRef.current?.selectionStart ?? value.length);
    setSelectedIndex(0);
  };

  const handleValueChange = (nextValue: string, nextCaret: number) => {
    onChange(nextValue, rebaseMentionRanges(value, nextValue, references));
    setCaret(nextCaret);
    setSelectedIndex(0);
  };

  const selectSuggestion = (suggestion: ReferenceSuggestion) => {
    if (!activeMention || references.length >= 10) return;
    const nextProjects = new Set(explicitProjectIds);
    nextProjects.add(suggestion.project_id);
    if (nextProjects.size > 3) return;

    const token = `${suggestion.label} `;
    const nextValue = value.slice(0, activeMention.start) + token + value.slice(activeMention.end);
    const nextCaret = activeMention.start + token.length;
    const retained = rebaseMentionRanges(value, nextValue, references);
    onChange(nextValue, [
      ...retained,
      {
        type: suggestion.type,
        id: suggestion.id,
        project_id: suggestion.project_id,
        label: suggestion.label,
        start: activeMention.start,
        end: activeMention.start + suggestion.label.length,
      },
    ].sort((a, b) => a.start - b.start));
    setCaret(nextCaret);
    setSelectedIndex(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const removeReference = (target: AssistantReference) => {
    const replacement = target.label.startsWith("@") ? target.label.slice(1) : target.label;
    const nextValue = value.slice(0, target.start) + replacement + value.slice(target.end);
    onChange(
      nextValue,
      rebaseMentionRanges(
        value,
        nextValue,
        references.filter((reference) => reference !== target),
      ),
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (submitting) return;
    if (visibleSuggestions.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % visibleSuggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => (index - 1 + visibleSuggestions.length) % visibleSuggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectSuggestion(visibleSuggestions[selectedIndex] || visibleSuggestions[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCaret(0);
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  };

  let previousType: AssistantReference["type"] | undefined;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          disabled={submitting}
          maxLength={4000}
          rows={3}
          placeholder="Pregunta por el estatus del proyecto. Usa @ para referenciar..."
          className="min-h-[92px] resize-none rounded-xl border-gray-200 pr-12 shadow-none focus-visible:ring-gray-300"
          onChange={(event) => handleValueChange(event.target.value, event.target.selectionStart)}
          onClick={setCaretFromTextarea}
          onKeyUp={(event) => {
            if (!["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(event.key)) setCaretFromTextarea();
          }}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="button"
          size="icon"
          onClick={onSubmit}
          disabled={submitting || !value.trim()}
          aria-label="Enviar pregunta"
          className="absolute bottom-2 right-2 h-8 w-8 rounded-lg"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>

        {activeMention && (
          <div className="absolute bottom-full left-0 right-0 z-[70] mb-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
            {suggestions === undefined ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando referencias...
              </div>
            ) : visibleSuggestions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">No hay coincidencias accesibles.</p>
            ) : visibleSuggestions.map((suggestion, index) => {
              const showGroup = previousType !== suggestion.type;
              previousType = suggestion.type;
              return (
                <div key={`${suggestion.type}:${suggestion.id}:${suggestion.project_id || ""}`}>
                  {showGroup && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{TYPE_LABELS[suggestion.type]}</p>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedIndex === index}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectSuggestion(suggestion);
                    }}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left",
                      selectedIndex === index ? "bg-gray-100" : "hover:bg-gray-50",
                    )}
                  >
                    <span className="block truncate text-sm font-medium text-gray-800">{suggestion.label}</span>
                    <span className="block truncate text-xs text-gray-500">{suggestion.subtitle}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {references.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {references.map((reference) => (
            <span key={`${reference.type}:${reference.id}:${reference.start}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
              <span className="truncate">{reference.label}</span>
              <button type="button" disabled={submitting} onClick={() => removeReference(reference)} aria-label={`Quitar ${reference.label}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>{references.length}/10 referencias · hasta 3 proyectos</span>
        <span>{value.length}/4000</span>
      </div>
    </div>
  );
}
