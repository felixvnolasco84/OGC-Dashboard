export type MentionRange = {
  start: number;
  end: number;
  label: string;
};

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

export function getActiveMention(value: string, caret: number): ActiveMention | undefined {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|[\s(])@([^\s@]*)$/);
  if (!match) return undefined;
  const query = match[2] || "";
  return { start: caret - query.length - 1, end: caret, query };
}

export function rebaseMentionRanges<T extends MentionRange>(
  previousValue: string,
  nextValue: string,
  mentions: T[],
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
