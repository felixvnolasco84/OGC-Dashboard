import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { rfiReviewSnapshot } from "../../convex/rfiReviewSnapshot";

const params = new URLSearchParams(location.search);
const users = [
  { _id: "actor", name: "María Hernández", email: "maria@example.test", role: "admin" },
  { _id: "manager", name: "Carlos Mendoza", email: "carlos@example.test", role: "user" },
  { _id: "assignee", name: "Ana López · Instalaciones", email: "ana@example.test", role: "user" },
];
let rfi = {
  _id: "rfi", _creationTime: 1791820800000, proyecto: "project", prefix: "RFI", number: 27, revision_number: 0,
  creator_id: "actor", rfi_manager_id: "manager", subject: "Confirmar especificación de impermeabilización en cubierta",
  question: "¿Se aprueba el sistema propuesto para la cubierta y los encuentros con pretiles?",
  background: "La documentación de proyecto requiere aclarar el tratamiento de juntas antes de iniciar los trabajos.",
  status: params.get("state") || "open", assignee_ids: params.has("missing") ? [] : ["assignee"], required_assignee_ids: ["assignee"],
  distribution_user_ids: ["actor"], due_date: params.get("state") === "closed" ? "2026-10-01" : "2026-10-20", is_private: true,
  cost_impact: "unknown", schedule_impact: "unknown", created_at: 1791820800000, updated_at: 1,
};
let responses = [
  { _id: "answer1", rfi_id: "rfi", proyecto: "project", author_id: "assignee", author_name: users[2].name, body: "Se aprueba el sistema bicapa indicado en el plano de cubierta.\n\nSe deben reforzar los encuentros con pretiles y verificar la continuidad en las juntas. El contratista deberá registrar la preparación de la superficie antes de la aplicación.", is_official: !params.has("no-official"), created_at: 1791820800000, updated_at: 1 },
  { _id: "answer2", rfi_id: "rfi", proyecto: "project", author_id: "manager", author_name: users[1].name, body: "Complemento de la especificación: realizar una prueba de estanqueidad de 48 horas antes de colocar el acabado final.\n\n" + "Documentar los encuentros, las juntas y los pasos de instalaciones con evidencia fotográfica y el visto bueno del supervisor. ".repeat(5), is_official: false, created_at: 1791907200000, updated_at: 1 },
];
let attachments: Array<{ _id: string; rfi_id: string; response_id?: string; storage_id: string; nombre: string; type: string; size: number; uploaded_at: number; uploaded_by_id: string }> = [];
const history: Array<Record<string, unknown>> = [];
let revision = 0, sequence = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = () => { revision++; listeners.forEach((listener) => listener()); };
export const fixtureState = { calls: [] as string[], fail: params.get("fail") || "", status: "Datos simulados; sin conexión al servidor", uploads: 0 };
const snapshot = () => rfiReviewSnapshot(rfi, responses, attachments);
const detail = () => ({
  rfi: { ...rfi, code: "RFI-027", derived_status: rfi.status, manager: users[1], creator: users[0], assignees: users.filter((u) => rfi.assignee_ids.includes(u._id)), official_response_count: responses.filter((r) => r.is_official).length, response_count: responses.length, attachment_count: attachments.length, last_activity_at: rfi.updated_at, is_unread: false, is_my_responsibility: true },
  review_snapshot: snapshot(),
  responses: responses.map((response) => ({ ...response, attachments: attachments.filter((a) => a.response_id === response._id).map((a) => ({ ...a, url: null })) })),
  attachments: attachments.filter((a) => !a.response_id).map((a) => ({ ...a, url: null })), history,
  permissions: { can_edit: ["draft", "pending_manager_review"].includes(rfi.status), can_delete: rfi.status === "draft", can_submit: rfi.status === "draft", can_open: rfi.status === "pending_manager_review", can_respond: rfi.status === "open", can_mark_official: rfi.status === "open", can_close: rfi.status === "open", can_reopen: rfi.status === "closed", can_attach: rfi.status !== "closed" },
});
export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: unknown) {
  const tick = useSyncExternalStore(subscribe, () => revision);
  const name = getFunctionName(reference);
  return useMemo(() => {
    if (args === "skip") return undefined;
    if (name === "rfis:getDetail") return detail();
    if (name === "rfis:listByProject") return [detail().rfi];
    if (name === "desarrollos:getById") return { _id: "project", nombre: "Proyecto Alameda · Datos de prueba" };
    if (name === "rfis:getFormOptions") return { project: { _id: "project", nombre: "Proyecto Alameda" }, current_user: users[0], can_create: true, users, partidas: [] };
    throw new Error(`Consulta sin simular: ${name}`);
  }, [name, tick, args === "skip"]);
}
export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(reference);
  return useMemo(() => async (args: Record<string, unknown>) => {
    if (name === "rfis:markAsRead") return;
    fixtureState.calls.push(name); publish();
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (fixtureState.fail === "action" && !name.includes("Upload")) throw new Error("No se pudo aplicar la acción. Error de prueba.");
    if (args.expected_review && args.expected_review !== snapshot()) throw new Error("La RFI cambió mientras la revisabas. Actualiza la revisión antes de continuar.");
    if (name === "rfis:generateUploadUrl") return "/rfi-mock-upload";
    if (name === "rfis:addAttachment") {
      const existing = attachments.find((a) => a.storage_id === args.storage_id);
      if (existing) return existing._id;
      attachments = [...attachments, { _id: `file-${++sequence}`, rfi_id: String(args.rfi_id), storage_id: String(args.storage_id), nombre: String(args.nombre), type: String(args.type), size: Number(args.size), uploaded_at: sequence, uploaded_by_id: "actor" }];
      rfi = { ...rfi, updated_at: ++sequence }; publish(); return attachments.at(-1)!._id;
    }
    if (name === "rfis:create" || name === "rfis:updateDraft") {
      rfi = { ...rfi, ...args, status: args.submit_for_review ? "pending_manager_review" : rfi.status, updated_at: ++sequence };
      if (name === "rfis:create") rfi.status = args.submit_for_review ? "pending_manager_review" : "draft";
      publish(); return "rfi";
    }
    const before = rfi.status;
    if (name === "rfis:submitForReview") rfi = { ...rfi, status: "pending_manager_review" };
    if (name === "rfis:openRfi" || name === "rfis:reopenRfi") rfi = { ...rfi, status: "open" };
    if (name === "rfis:closeRfi") rfi = { ...rfi, status: "closed" };
    if (name === "rfis:markResponseOfficial") responses = responses.map((response) => response._id === args.response_id ? { ...response, is_official: true } : response);
    rfi = { ...rfi, updated_at: ++sequence };
    history.push({ _id: `event-${sequence}`, action: { "rfis:submitForReview": "submitted_for_review", "rfis:openRfi": "opened", "rfis:closeRfi": "closed", "rfis:reopenRfi": "reopened", "rfis:markResponseOfficial": "official_response_selected" }[name], actor_id: "actor", actor_name: users[0].name, created_at: Date.now(), field_changed: "status", old_value: before, new_value: rfi.status });
    publish(); return { changed: true };
  }, [name]);
}
export function fixtureChange() { rfi = { ...rfi, question: "Pregunta actualizada por otra persona: verificar también los pasos de instalaciones.", updated_at: ++sequence }; fixtureState.status = "Cambio concurrente simulado"; publish(); }
export function restoreFixture() { fixtureState.fail = ""; fixtureState.status = "Error simulado desactivado"; publish(); }
export function subscribeFixture() { return useSyncExternalStore(subscribe, () => revision); }
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (input === "/rfi-mock-upload") {
    fixtureState.uploads++;
    if (fixtureState.fail === "upload") return new Response("Error de carga simulado", { status: 500 });
    return Response.json({ storageId: `storage-${fixtureState.uploads}` });
  }
  return originalFetch(input, init);
};
