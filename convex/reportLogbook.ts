import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { ReportLogbookEntry, ReportLogbookPhoto, ReportLogbookSection } from "./reportTypes";
import { isDateInRange, parseProjectDate, sanitizeReportText } from "./reportingUtils";

// Keep the existing redaction rules without truncating construction narratives.
const text = (value: unknown) => sanitizeReportText(value, Infinity);
const comparisonKey = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("es-MX");

export function reportProgressLines(value: string) {
  return value.split(/\r?\n|[•]+/).map(text).filter(Boolean);
}

export function reportPhotoNotes(
  photo: Pick<Doc<"documentos">, "descripcion" | "comment">,
  comments: Doc<"photo_comments">[],
): NonNullable<ReportLogbookPhoto["notes"]> {
  const thread = [...comments]
    .sort((a, b) => a.created_at - b.created_at || String(a._id).localeCompare(String(b._id)))
    .map((comment) => ({
      text: text(comment.comment),
      source: "comment" as const,
      author: sanitizeReportText(comment.user_name, 80),
      created_at: comment.created_at,
    }))
    .filter((note) => note.text);

  // Older uploads copied the description into the first thread comment.
  // Deduplicate those copies only within this photo, retaining thread authors.
  const seen = new Set(thread.map((note) => comparisonKey(note.text)));
  const legacy: NonNullable<ReportLogbookPhoto["notes"]> = [];
  for (const [value, source] of [[photo.descripcion, "description"], [photo.comment, "comment"]] as const) {
    const cleaned = text(value);
    const key = comparisonKey(cleaned);
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    legacy.push({ text: cleaned, source });
  }
  return [...legacy, ...thread];
}

export async function buildReportLogbook(
  ctx: { db: QueryCtx["db"]; storage?: Pick<QueryCtx["storage"], "getUrl"> },
  logs: Doc<"bitacora">[],
  documents: Doc<"documentos">[],
  periodStart: string,
  periodEnd: string,
) {
  const periodLogs = logs
    .filter((log) => !log.deleted_at && isDateInRange(parseProjectDate(log.fecha), periodStart, periodEnd))
    .sort((a, b) => (parseProjectDate(a.fecha) || "").localeCompare(parseProjectDate(b.fecha) || "")
      || a.uploaded_at - b.uploaded_at || String(a._id).localeCompare(String(b._id)));
  const photosByLog = new Map<string, Doc<"documentos">[]>();
  const logIds = new Set(periodLogs.map((log) => String(log._id)));
  for (const photo of documents) {
    if (photo.deleted_at || photo.type !== "bitacora_foto" || !photo.bitacora_id || !logIds.has(String(photo.bitacora_id))) continue;
    const key = String(photo.bitacora_id);
    const photos = photosByLog.get(key) || [];
    photos.push(photo);
    photosByLog.set(key, photos);
  }

  const byCategory = new Map<string, ReportLogbookSection>();
  for (const log of periodLogs) {
    const title = sanitizeReportText(log.categoria, 60) || "Generales";
    const date = parseProjectDate(log.fecha)!;
    const author = sanitizeReportText(log.responsable, 80) || "Equipo de obra";
    let section = byCategory.get(title);
    if (!section) {
      section = {
        id: title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general",
        title, author, period_start: date, period_end: date,
        bullets: [], photos: [], entries: [],
      };
      byCategory.set(title, section);
    }
    const records = (photosByLog.get(String(log._id)) || [])
      .sort((a, b) => (a.uploaded_at || a._creationTime) - (b.uploaded_at || b._creationTime)
        || String(a._id).localeCompare(String(b._id)));
    const photos: ReportLogbookPhoto[] = [];
    // Bound database/storage reads while keeping every photo in the period.
    for (let offset = 0; offset < records.length; offset += 8) {
      photos.push(...await Promise.all(records.slice(offset, offset + 8).map(async (photo) => {
        const comments = await ctx.db.query("photo_comments")
          .withIndex("by_photo", (q) => q.eq("photo_id", photo._id)).collect();
        return {
          id: String(photo._id),
          url: photo.storage_id && ctx.storage ? await ctx.storage.getUrl(photo.storage_id) : null,
          caption: text(photo.comment || photo.descripcion) || "Evidencia fotográfica",
          notes: reportPhotoNotes(photo, comments),
          author, date,
        };
      })));
    }
    const entry: ReportLogbookEntry = {
      id: String(log._id), date, author,
      progress: reportProgressLines(log.avance_dia),
      incident: text(log.comentarios) || undefined,
      photo_ids: photos.map((photo) => photo.id),
    };
    section.entries!.push(entry);
    section.bullets.push(...entry.progress);
    section.photos.push(...photos);
    section.period_end = date;
    section.incident ||= entry.incident;
    if (section.author !== author) section.author = "Equipo de obra";
  }
  const incidentLogs = periodLogs.filter((log) => text(log.comentarios)
    || /retras|proble/.test(String(log.status || "").toLocaleLowerCase("es-MX").replace(/sin problemas/g, "")));
  return {
    entries_in_period: periodLogs.length,
    incidents_in_period: incidentLogs.length,
    incident_summaries: incidentLogs.map((log) => text(log.comentarios || log.avance_dia)).filter(Boolean),
    sections: [...byCategory.values()],
  };
}
