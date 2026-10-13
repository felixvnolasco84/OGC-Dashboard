import { describe, expect, it } from "vitest";
import { submitForReview, openRfi, markResponseOfficial, closeRfi, reopenRfi, updateDraft, addAttachment, getDetail, markAsRead } from "./rfis";
import { rfiReviewSnapshot } from "./rfiReviewSnapshot";

// Actual handlers, in-memory data only. No deployment, files or notifications.
function fixture(status = "draft", role = "admin") {
  let tables = {
    users: [
      { _id: "actor", clerkId: "session", role, name: "Actor", email: "actor@example.test", organization_id: "org", allowed_desarrollos: ["project"] },
      { _id: "manager", clerkId: "manager", role: "user", name: "Responsable", email: "manager@example.test", allowed_desarrollos: ["project"] },
    ],
    desarrollos: [{ _id: "project", organization_id: "org", nombre: "Proyecto" }],
    rfis: [{ _id: "rfi", proyecto: "project", prefix: "RFI", number: 1, revision_number: 0, creator_id: "actor", subject: "Pregunta", question: "¿Cuál es la especificación?", status, rfi_manager_id: "manager", assignee_ids: ["manager"], required_assignee_ids: [], distribution_user_ids: [], is_private: false, due_date: "2026-10-15", cost_impact: "unknown", schedule_impact: "unknown", created_at: 1, updated_at: 1, ...(status === "closed" ? { closed_at: 2, opened_at: 1 } : {}) }],
    rfi_responses: [], rfi_attachments: [], rfi_history: [], rfi_read_status: [], partidas: [],
  };
  let sequence = 0;
  const list = (table) => tables[table] ||= [];
  const get = (id) => Object.values(tables).flat().find((row) => row._id === id);
  const writes = [], scheduled = [];
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "session" }) },
    storage: { getUrl: async () => "https://example.test/file", delete: async (id) => writes.push(["storageDelete", id]) },
    scheduler: { runAfter: async (...args) => scheduled.push(args) },
    db: {
      get: async (id) => structuredClone(get(id) || null),
      query(table) {
        const predicates = [];
        const builder = { eq(key, value) { predicates.push((row) => row[key] === value); return builder; } };
        const query = {
          withIndex(_index, fn) { fn(builder); return query; },
          filter(fn) { predicates.push(fn({ field: (key) => (row) => row[key], eq: (field, value) => (row) => field(row) === value })); return query; },
          collect: async () => structuredClone(list(table).filter((row) => predicates.every((fn) => fn(row)))),
          first: async () => (await query.collect())[0] || null,
          unique: async () => (await query.collect())[0] || null,
        };
        return query;
      },
      insert: async (table, fields) => { const id = `${table}-${++sequence}`; writes.push(["insert", table]); list(table).push({ _id: id, _creationTime: sequence, ...structuredClone(fields) }); return id; },
      patch: async (id, fields) => { writes.push(["patch", id]); for (const [key, value] of Object.entries(fields)) { if (value === undefined) delete get(id)[key]; else get(id)[key] = structuredClone(value); } },
      delete: async (id) => { writes.push(["delete", id]); for (const table of Object.keys(tables)) tables[table] = list(table).filter((row) => row._id !== id); },
    },
  };
  const call = async (fn, args) => { const before = structuredClone(tables), writeCount = writes.length; try { return await fn._handler(ctx, args); } catch (error) { tables = before; writes.splice(writeCount); throw error; } };
  const snapshot = () => rfiReviewSnapshot(get("rfi"), list("rfi_responses"), list("rfi_attachments"));
  const args = () => ({ id: "rfi", expected_review: snapshot() });
  const response = (id, official = false) => { list("rfi_responses").push({ _id: id, rfi_id: "rfi", proyecto: "project", author_id: "manager", author_name: "Responsable", body: `Respuesta ${id}`, is_official: official, created_at: 2, updated_at: 2 }); };
  return { ctx, get, list, writes, scheduled, call, snapshot, args, response };
}

describe("reviewed RFI transitions", () => {
  it("submits and opens only the selected transition with accurate history", async () => {
    const f = fixture();
    await f.call(submitForReview, f.args());
    expect(f.get("rfi").status).toBe("pending_manager_review");
    await f.call(openRfi, f.args());
    expect(f.get("rfi").status).toBe("open");
    expect(f.list("rfi_history").map((h) => [h.action, h.old_value, h.new_value, h.actor_id])).toEqual([
      ["submitted_for_review", "draft", "pending_manager_review", "actor"], ["opened", "pending_manager_review", "open", "actor"],
    ]);
    expect(f.scheduled).toHaveLength(0);
  });

  it("keeps multiple official responses, closes separately and preserves them on reopen", async () => {
    const f = fixture("open"); f.response("first", true); f.response("second");
    await f.call(markResponseOfficial, { response_id: "second", expected_review: f.snapshot() });
    expect(f.get("rfi").status).toBe("open");
    expect(f.list("rfi_responses").every((r) => r.is_official)).toBe(true);
    const officialHistory = f.list("rfi_history")[0];
    expect(JSON.parse(officialHistory.new_value)).toEqual({ response_id: "second", body: "Respuesta second", author_name: "Responsable" });
    await f.call(closeRfi, f.args());
    expect(f.get("rfi").closed_at).toBeTypeOf("number");
    await f.call(reopenRfi, f.args());
    expect(f.get("rfi")).toMatchObject({ status: "open", due_date: "2026-10-15" });
    expect(f.get("rfi").closed_at).toBeUndefined();
    expect(f.list("rfi_responses").every((r) => r.is_official)).toBe(true);
    expect(f.list("rfi_history").map((h) => h.action)).toEqual(["official_response_selected", "closed", "reopened"]);
  });

  it("does not record duplicate official selections or repeated transitions", async () => {
    const f = fixture("open"); f.response("answer");
    const review = f.snapshot();
    await f.call(markResponseOfficial, { response_id: "answer", expected_review: review });
    expect(await f.call(markResponseOfficial, { response_id: "answer", expected_review: review })).toEqual({ changed: false });
    expect(f.list("rfi_history")).toHaveLength(1);
    const args = f.args(); await f.call(closeRfi, args);
    await expect(f.call(closeRfi, args)).rejects.toThrow();
    expect(f.list("rfi_history")).toHaveLength(2);
  });

  it.each([
    ["draft", submitForReview, (f) => { delete f.get("rfi").rfi_manager_id; }],
    ["pending_manager_review", openRfi, (f) => { f.get("rfi").assignee_ids = []; }],
    ["pending_manager_review", openRfi, (f) => { delete f.get("rfi").due_date; }],
    ["open", closeRfi, () => {}],
  ])("rejects missing preconditions without writes (%s)", async (status, operation, change) => {
    const f = fixture(status); change(f);
    await expect(f.call(operation, f.args())).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  });

  it.each(["role", "project", "manager"])("rechecks authorization when %s changes", async (kind) => {
    const f = fixture("pending_manager_review", "user"); f.get("rfi").rfi_manager_id = "actor";
    const args = f.args();
    if (kind === "role") f.get("actor").role = "viewer";
    if (kind === "project") f.get("actor").allowed_desarrollos = [];
    if (kind === "manager") f.get("rfi").rfi_manager_id = "manager";
    await expect(f.call(openRfi, args)).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  });

  it.each(["question", "response", "attachment", "status cycle"])("rejects a stale review after a change to %s", async (kind) => {
    const f = fixture("open"); f.response("official", true);
    const args = f.args();
    if (kind === "question") f.get("rfi").question = "Pregunta corregida";
    if (kind === "response") f.response("new");
    if (kind === "attachment") f.list("rfi_attachments").push({ _id: "file", rfi_id: "rfi", response_id: "official", nombre: "Evidencia.pdf" });
    if (kind === "status cycle") { await f.call(closeRfi, f.args()); await f.call(reopenRfi, f.args()); }
    const priorWrites = f.writes.length;
    await expect(f.call(closeRfi, args)).rejects.toThrow(/cambió mientras/);
    expect(f.get("rfi").status).toBe("open"); expect(f.writes).toHaveLength(priorWrites);
  });

  it("uses the same snapshot in detail and ignores reading the RFI", async () => {
    const f = fixture("open"); f.response("answer");
    const detail = await f.call(getDetail, { id: "rfi" });
    expect(detail.review_snapshot).toBe(f.snapshot());
    await f.call(markAsRead, { id: "rfi" });
    expect(f.snapshot()).toBe(detail.review_snapshot);
    await f.call(markResponseOfficial, { response_id: "answer", expected_review: detail.review_snapshot });
    expect(f.get("answer").is_official).toBe(true);
  });

  it("blocks stale save-and-submit before deleting attachments", async () => {
    const f = fixture();
    f.list("rfi_attachments").push({ _id: "file", rfi_id: "rfi", storage_id: "storage", nombre: "Plano.pdf" });
    const expected_review = f.snapshot(); f.get("rfi").subject = "Cambio ajeno";
    const { _id, ...values } = f.get("rfi");
    await expect(f.call(updateDraft, { ...values, id: _id, subject: "Cambio local", submit_for_review: true, expected_review, remove_attachment_ids: ["file"] })).rejects.toThrow(/cambió mientras/);
    expect(f.get("file")).toBeDefined(); expect(f.writes).toHaveLength(0);
  });

  it("attaches a recovered storage upload once, preserving history", async () => {
    const f = fixture("pending_manager_review");
    const args = { rfi_id: "rfi", storage_id: "storage", nombre: "Plano.pdf", type: "application/pdf", size: 10 };
    const id = await f.call(addAttachment, args);
    expect(await f.call(addAttachment, args)).toBe(id);
    expect(f.list("rfi_attachments")).toHaveLength(1);
    expect(f.list("rfi_history")).toHaveLength(1);
  });

  it("saves and submits a reviewed draft with its actual field changes", async () => {
    const f = fixture();
    const { _id, ...values } = f.get("rfi");
    await f.call(updateDraft, { ...values, id: _id, subject: "Pregunta revisada", submit_for_review: true, expected_review: f.snapshot(), remove_attachment_ids: [] });
    expect(f.get("rfi")).toMatchObject({ subject: "Pregunta revisada", status: "pending_manager_review" });
    expect(f.list("rfi_history").map((h) => [h.action, h.field_changed])).toEqual([["updated", "subject"], ["submitted_for_review", "status"]]);
  });

  it("allows the assigned manager and rejects an unrelated user", async () => {
    const f = fixture("open", "user"); f.response("answer");
    await expect(f.call(markResponseOfficial, { response_id: "answer", expected_review: f.snapshot() })).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
    f.get("rfi").rfi_manager_id = "actor";
    await f.call(markResponseOfficial, { response_id: "answer", expected_review: f.snapshot() });
    expect(f.get("answer").is_official).toBe(true);
  });
});
