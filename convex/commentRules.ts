import { ConvexError } from "convex/values";
import { programDate } from "../src/lib/programa-obra-rules";

export const COMMENT_MAX_LENGTH = 5000;
export function commentError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}
export function commentText(value: string): string {
  const text = value.trim();
  if (!text) commentError("INVALID", "Escribe un comentario antes de guardar.");
  if (text.length > COMMENT_MAX_LENGTH)
    commentError(
      "INVALID",
      `El comentario admite hasta ${COMMENT_MAX_LENGTH} caracteres.`,
    );
  return text;
}
export function commentDates(start: string, finish: string) {
  const from = programDate(start),
    to = programDate(finish);
  if (!from || !to)
    commentError("INVALID", "Escribe fechas válidas de inicio y fin.");
  if (from > to)
    commentError(
      "INVALID",
      "La fecha fin debe ser igual o posterior al inicio.",
    );
  const storage = (date: string) => date.split("-").reverse().join("/");
  return { fecha_inicio: storage(from), fecha_fin: storage(to) };
}
export function assertCommentRevision(
  current: number | undefined,
  expected: number,
) {
  if (
    !Number.isInteger(expected) ||
    expected < 1 ||
    (current ?? 1) !== expected
  ) {
    commentError(
      "CONFLICT",
      "El comentario cambió. Revisa la versión actual antes de continuar.",
    );
  }
}
export function canManagePhotoComment(
  role: string,
  userId: string,
  authorId: string,
) {
  return role !== "viewer" && (role === "admin" || userId === authorId);
}
export function canWriteProgramComments(role: string) {
  return role !== "viewer" && role !== "almacenista";
}
