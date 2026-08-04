import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, X } from "lucide-react";
import type { CommentMentionDraft, MentionableUser } from "./planosTypes";

const COLORS = {
  surface: "#FBFBFB",
  border: "#E6E6E6",
  text: "#3D3D3A",
  textSoft: "#898982",
  muted: "#A3A39E",
};
const MAX_MENTIONS = 20;

type ActiveMention = { start: number; end: number; query: string };

function getActiveMention(value: string, caret: number): ActiveMention | undefined {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|[\s(])@([^\s@]*)$/);
  if (!match) return undefined;
  const query = match[2] || "";
  return { start: caret - query.length - 1, end: caret, query };
}

function mentionToken(user: MentionableUser) {
  return `@${user.name.trim() || user.email.trim()}`;
}

function displayUserName(user: MentionableUser) {
  const name = user.name.trim();
  if (name) return name;
  return user.email.split("@")[0]?.trim() || "Usuario sin perfil";
}

function userInitials(user: MentionableUser) {
  return displayUserName(user)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("es");
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "Administrador",
    user: "Usuario",
    viewer: "Lector",
    contratista: "Contratista",
    finance: "Finanzas",
  };
  return labels[role] || role;
}

function rebaseMentions(
  previousValue: string,
  nextValue: string,
  mentions: CommentMentionDraft[],
) {
  if (previousValue === nextValue) return mentions;
  let changeStart = 0;
  while (
    changeStart < previousValue.length &&
    changeStart < nextValue.length &&
    previousValue[changeStart] === nextValue[changeStart]
  ) {
    changeStart += 1;
  }
  let previousEnd = previousValue.length;
  let nextEnd = nextValue.length;
  while (
    previousEnd > changeStart &&
    nextEnd > changeStart &&
    previousValue[previousEnd - 1] === nextValue[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  const delta = nextEnd - previousEnd;
  return mentions.flatMap((mention) => {
    if (previousEnd <= mention.start) {
      const shifted = {
        ...mention,
        start: mention.start + delta,
        end: mention.end + delta,
      };
      return nextValue.slice(shifted.start, shifted.end) === shifted.label
        ? [shifted]
        : [];
    }
    if (changeStart >= mention.end) {
      return nextValue.slice(mention.start, mention.end) === mention.label
        ? [mention]
        : [];
    }
    return [];
  });
}

export default function MentionCommentComposer({
  value,
  mentions,
  mentionableUsers,
  submitting,
  onChange,
  onSubmit,
  placeholder = "Escribe un comentario. Usa @ para etiquetar",
  rows = 3,
  maxLength = 3000,
  hideSubmit = false,
  id,
  autoFocus,
}: {
  value: string;
  mentions: CommentMentionDraft[];
  mentionableUsers: MentionableUser[];
  submitting: boolean;
  onChange: (value: string, mentions: CommentMentionDraft[]) => void;
  onSubmit: () => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  hideSubmit?: boolean;
  id?: string;
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const activeMention = getActiveMention(value, caret);
  const mentionedIds = useMemo(
    () => new Set(mentions.map((mention) => mention.user_id)),
    [mentions],
  );
  const mentionableUsersById = useMemo(
    () => new Map(mentionableUsers.map((user) => [user._id, user])),
    [mentionableUsers],
  );
  const suggestions = useMemo(() => {
    if (!activeMention || mentions.length >= MAX_MENTIONS) return [];
    const query = activeMention.query.toLocaleLowerCase("es");
    return mentionableUsers
      .filter((user) => {
        if (mentionedIds.has(user._id)) return false;
        return (
          !query ||
          user.name.toLocaleLowerCase("es").includes(query) ||
          user.email.toLocaleLowerCase("es").includes(query)
        );
      })
      .slice(0, 6);
  }, [activeMention, mentionableUsers, mentionedIds, mentions.length]);

  const setCaretFromTextarea = () => {
    setCaret(textareaRef.current?.selectionStart ?? value.length);
    setSelectedSuggestion(0);
  };

  const handleValueChange = (nextValue: string, nextCaret: number) => {
    onChange(nextValue, rebaseMentions(value, nextValue, mentions));
    setCaret(nextCaret);
    setSelectedSuggestion(0);
  };

  const selectSuggestion = (user: MentionableUser) => {
    if (!activeMention || mentions.length >= MAX_MENTIONS) return;
    const label = mentionToken(user);
    const token = `${label} `;
    const nextValue =
      value.slice(0, activeMention.start) + token + value.slice(activeMention.end);
    const nextCaret = activeMention.start + token.length;
    const retainedMentions = rebaseMentions(value, nextValue, mentions);
    onChange(
      nextValue,
      [
        ...retainedMentions,
        {
          user_id: user._id,
          start: activeMention.start,
          end: activeMention.start + label.length,
          label,
        },
      ].sort((a, b) => a.start - b.start),
    );
    setCaret(nextCaret);
    setSelectedSuggestion(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const removeMention = (userId: Id<"users">) => {
    const mention = mentions.find((item) => item.user_id === userId);
    if (!mention) return;
    const replacement = mention.label.startsWith("@")
      ? mention.label.slice(1)
      : mention.label;
    const nextValue =
      value.slice(0, mention.start) + replacement + value.slice(mention.end);
    onChange(
      nextValue,
      rebaseMentions(
        value,
        nextValue,
        mentions.filter((item) => item.user_id !== userId),
      ),
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (submitting) return;
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedSuggestion((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedSuggestion(
          (index) => (index - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectSuggestion(suggestions[selectedSuggestion] || suggestions[0]);
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

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          id={id}
          autoFocus={autoFocus}
          ref={textareaRef}
          value={value}
          disabled={submitting}
          onChange={(event) =>
            handleValueChange(event.target.value, event.target.selectionStart)
          }
          onClick={setCaretFromTextarea}
          onKeyUp={(event) => {
            if (!["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(event.key)) {
              setCaretFromTextarea();
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className="rounded-sm shadow-none"
          style={{ borderColor: COLORS.border }}
        />

        {activeMention && suggestions.length > 0 && (
          <div
            role="listbox"
            aria-label="Integrantes disponibles"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-sm border bg-white p-1 shadow-xl"
            style={{ borderColor: COLORS.border }}
          >
            {suggestions.map((user, index) => (
              <button
                key={user._id}
                type="button"
                disabled={submitting}
                role="option"
                aria-selected={selectedSuggestion === index}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(user);
                }}
                className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left"
                style={{
                  backgroundColor:
                    selectedSuggestion === index ? COLORS.surface : "white",
                }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border text-xs font-medium"
                  style={{
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surface,
                    color: COLORS.textSoft,
                  }}
                >
                  {userInitials(user)}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-sm font-medium"
                    style={{ color: COLORS.text }}
                  >
                    {displayUserName(user)}
                  </span>
                  <span className="block truncate text-xs" style={{ color: COLORS.muted }}>
                    {user.email}
                  </span>
                </span>
                <span className="text-xs" style={{ color: COLORS.muted }}>
                  {roleLabel(user.role)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mentions.map((mention) => {
            const user = mentionableUsersById.get(mention.user_id);
            return (
              <span
                key={mention.user_id}
                className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs"
                title={user?.email}
                style={{
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.surface,
                  color: COLORS.textSoft,
                }}
              >
                {mention.label}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => removeMention(mention.user_id)}
                  className="rounded-sm"
                  aria-label={`Quitar mención de ${user?.name || mention.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs" style={{ color: COLORS.muted }}>
          {mentions.length >= MAX_MENTIONS
            ? `Máximo de ${MAX_MENTIONS} menciones alcanzado`
            : "Escribe @ para etiquetar · Ctrl/⌘ + Enter para enviar"}
        </span>
        {!hideSubmit && (
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !value.trim()}
            className="h-9 gap-2 rounded-sm"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar
          </Button>
        )}
      </div>
    </div>
  );
}
