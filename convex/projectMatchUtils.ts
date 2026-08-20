export type ProjectMatchMode = "exact" | "normalized" | "alias";
export type ProjectMatchStatus = "matched" | "unmatched" | "conflict";

export type ProjectMatchCandidate<TId = string> = {
  _id: TId;
  nombre: string;
};

const PROJECT_DESCRIPTOR_TOKENS = new Set([
  "ADMINISTRACION",
  "DESARROLLO",
  "OBRA",
  "PROYECTO",
]);

export function normalizeProjectName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return normalizeProjectName(value)
    .split(" ")
    .filter((token) => token && !PROJECT_DESCRIPTOR_TOKENS.has(token));
}

function isSafeAlias(tokens: readonly string[]) {
  if (!tokens.length) return false;
  if (tokens.length === 1) return tokens[0].length >= 5;
  return tokens.join("").length >= 5 && tokens.some((token) => token.length >= 3);
}

function containsTokenSequence(container: readonly string[], contained: readonly string[]) {
  if (contained.length > container.length) return false;
  for (let start = 0; start <= container.length - contained.length; start += 1) {
    if (contained.every((token, index) => container[start + index] === token)) return true;
  }
  return false;
}

function containsEveryToken(container: readonly string[], contained: readonly string[]) {
  const available = new Map<string, number>();
  for (const token of container) available.set(token, (available.get(token) || 0) + 1);
  for (const token of contained) {
    const count = available.get(token) || 0;
    if (!count) return false;
    available.set(token, count - 1);
  }
  return true;
}

export function projectNameMatchMode(
  inputName: string,
  catalogName: string,
): ProjectMatchMode | null {
  const inputTrimmed = inputName.trim();
  const catalogTrimmed = catalogName.trim();
  if (!inputTrimmed || !catalogTrimmed) return null;
  if (inputTrimmed === catalogTrimmed) return "exact";

  const inputNormalized = normalizeProjectName(inputTrimmed);
  const catalogNormalized = normalizeProjectName(catalogTrimmed);
  if (!inputNormalized || !catalogNormalized) return null;
  if (inputNormalized === catalogNormalized) return "normalized";

  const inputTokens = meaningfulTokens(inputNormalized);
  const catalogTokens = meaningfulTokens(catalogNormalized);
  const shorter = inputTokens.length <= catalogTokens.length ? inputTokens : catalogTokens;
  const longer = shorter === inputTokens ? catalogTokens : inputTokens;
  if (!isSafeAlias(shorter)) return null;

  if (shorter.join("") === longer.join("")) return "alias";
  if (containsTokenSequence(longer, shorter)) return "alias";
  if (containsEveryToken(longer, shorter)) return "alias";
  return null;
}

export function classifyProjectMatch<
  TProject extends ProjectMatchCandidate<unknown>,
>(inputName: string, projects: readonly TProject[]) {
  const rankedMatches = projects
    .map((project) => ({
      project,
      mode: projectNameMatchMode(inputName, project.nombre),
    }))
    .filter((match): match is { project: TProject; mode: ProjectMatchMode } => Boolean(match.mode));

  const normalizedMatches = rankedMatches.filter(
    (match) => match.mode === "exact" || match.mode === "normalized",
  );
  const bestMode: ProjectMatchMode | undefined = normalizedMatches.length
    ? normalizedMatches.length === 1 && normalizedMatches[0].mode === "exact"
      ? "exact"
      : "normalized"
    : rankedMatches.some((match) => match.mode === "alias")
      ? "alias"
      : undefined;
  const matches = normalizedMatches.length
    ? normalizedMatches.map((match) => match.project)
    : rankedMatches.filter((match) => match.mode === "alias").map((match) => match.project);
  const status: ProjectMatchStatus = matches.length === 1
    ? "matched"
    : matches.length > 1
      ? "conflict"
      : "unmatched";

  return {
    normalized: normalizeProjectName(inputName),
    status,
    mode: status === "matched" ? bestMode : undefined,
    project: status === "matched" ? matches[0] : undefined,
    matches,
  };
}
