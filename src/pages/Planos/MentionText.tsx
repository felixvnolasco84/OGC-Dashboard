import type { PlanoComment } from "./planosTypes";

const COLORS = {
  surface: "#FBFBFB",
  border: "#E6E6E6",
  text: "#3D3D3A",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function MentionText({
  comment,
}: {
  comment: Pick<PlanoComment, "comentario" | "mentioned_users">;
}) {
  const users = comment.mentioned_users || [];
  if (users.length === 0) return <>{comment.comentario}</>;

  const rangedUsers = users
    .flatMap((user) => {
      if (
        typeof user.start !== "number" ||
        typeof user.end !== "number" ||
        !Number.isInteger(user.start) ||
        !Number.isInteger(user.end) ||
        !user.label ||
        user.start < 0 ||
        user.end <= user.start ||
        comment.comentario.slice(user.start, user.end) !== user.label
      ) {
        return [];
      }
      return [{ user, start: user.start, end: user.end, label: user.label }];
    })
    .sort((a, b) => a.start - b.start);
  const hasValidRanges =
    rangedUsers.length === users.length &&
    rangedUsers.every(
      (mention, index) =>
        index === 0 || mention.start >= rangedUsers[index - 1].end,
    );

  if (hasValidRanges) {
    let cursor = 0;
    return (
      <>
        {rangedUsers.flatMap((mention, index) => {
          const before = comment.comentario.slice(cursor, mention.start);
          cursor = mention.end;
          return [
            before ? <span key={`text-${index}`}>{before}</span> : null,
            <span
              key={`mention-${index}-${mention.user.user_id}`}
              className="inline rounded-sm border px-1 py-0.5 font-medium"
              style={{
                borderColor: COLORS.border,
                backgroundColor: COLORS.surface,
                color: COLORS.text,
              }}
              title={mention.user.email}
            >
              {mention.label}
            </span>,
            index === rangedUsers.length - 1 ? (
              <span key="text-tail">{comment.comentario.slice(cursor)}</span>
            ) : null,
          ];
        })}
      </>
    );
  }

  const tokenEntries = users.flatMap((user) => [
    { token: `@${user.name}`, user },
    { token: `@${user.email}`, user },
  ]);
  const tokensByValue = new Map(
    tokenEntries.map((entry) => [entry.token.toLocaleLowerCase("es"), entry]),
  );
  const expression = new RegExp(
    `(${tokenEntries
      .map((entry) => escapeRegExp(entry.token))
      .sort((a, b) => b.length - a.length)
      .join("|")})`,
    "gi",
  );

  return (
    <>
      {comment.comentario.split(expression).map((part, index) => {
        const mention = tokensByValue.get(part.toLocaleLowerCase("es"));
        if (!mention) return <span key={`${index}-${part}`}>{part}</span>;
        return (
          <span
            key={`${index}-${mention.user.user_id}`}
            className="inline rounded-sm border px-1 py-0.5 font-medium"
            style={{
              borderColor: COLORS.border,
              backgroundColor: COLORS.surface,
              color: COLORS.text,
            }}
            title={mention.user.email}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}
