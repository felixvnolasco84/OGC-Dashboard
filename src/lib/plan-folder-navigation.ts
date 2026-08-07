export function planPathSegments(path?: string) {
  return (path || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function planDirectorySegments(plan: { ruta_relativa?: string }) {
  const segments = planPathSegments(plan.ruta_relativa);
  return segments.length > 0 ? segments.slice(0, -1) : [];
}

export function planPathsMatch(left: string[], right: string[]) {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

export function planPathStartsWith(path: string[], prefix: string[]) {
  return prefix.every((segment, index) => path[index] === segment);
}
