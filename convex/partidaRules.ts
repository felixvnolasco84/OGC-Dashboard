export function cleanHierarchyText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Keep this aligned with the transaction import matcher so a name that would
// still be ambiguous during import is also considered a duplicate here.
export function normalizeHierarchyText(value: unknown) {
  return cleanHierarchyText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
