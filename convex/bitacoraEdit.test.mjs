import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
async function fixture(role = "user", createdBy = "actor") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Obra", descripcion: "", image: "", organization_id: "org" });
    const otherProject = await ctx.db.insert("desarrollos", { nombre: "Otra", descripcion: "", image: "", organization_id: "other" });
    const user = await ctx.db.insert("users", { clerkId: "actor", email: "actor@example.test", name: "Ana", role, organization_id: "org", allowed_desarrollos: [project], created_at: 0 });
    const partida = await ctx.db.insert("partidas", { proyecto: project, nivel: 1, nombre: "Estructura", familia: "", sub_partida: "", unidad: "m", cantidad: 1, precio_unitario: 1, presupuesto_original: 1, presupuesto_aprobado: 1, pagado: 0, archivo_origen: "test" });
    const payload = { categoria: "Estructura", partida_id: partida, familias_tags: [], responsable: "Ana", fecha: "27/10/2026", avance_dia: "Avance original", comentarios: "Incidencia original", status: "Sin problemas" };
    const log = await ctx.db.insert("bitacora", { ...payload, proyecto: project, client_id: "entry", created_by: createdBy, revision: 1, sync_version: 1, uploaded_at: 0 });
    const photo = await ctx.db.insert("documentos", { proyecto: project, bitacora_id: log, client_id: "photo", nombre: "obra.jpg", descripcion: "", type: "bitacora_foto", uploaded_at: 0 });
    const document = await ctx.db.insert("documentos", { proyecto: project, bitacora_id: log, client_id: "document", nombre: "obra.pdf", descripcion: "Documento original", type: "bitacora_documento", uploaded_at: 0 });
    return { project, otherProject, user, partida, payload, log, photo, document };
  });
  const actor = t.withIdentity({ subject: "actor" });
  const args = (overrides = {}) => ({ operationId: crypto.randomUUID(), clientId: "entry", proyecto: ids.project, operation: "update", baseRevision: 1, logId: ids.log,
    payload: { ...ids.payload, avance_dia: "Avance corregido" }, addedAttachments: [], updatedAttachments: [], removedAttachmentClientIds: [], ...overrides });
  const read = id => t.run(ctx => ctx.db.get(id));
  const upload = async (operationId, kind = "photo") => {
    const storageId = await t.run(async ctx => {
      const contentType = kind === "photo" ? "image/png" : "application/pdf";
      const id = await ctx.storage.store(new Blob(["contenido"], { type: contentType }));
      // convex-test 0.0.41 omits MIME metadata on stored blobs.
      await ctx.db.patch(id, { contentType });
      return id;
    });
    await actor.mutation(api.bitacoraOffline.registerBitacoraUpload, { proyecto: ids.project, operationId, attachmentId: "new-file", storageId, kind });
    return { clientId: "new-file", storageId, kind, name: kind === "photo" ? "nueva.png" : "nuevo.pdf", description: "Evidencia nueva" };
  };
  return { t, ids, actor, args, read, upload };
}

describe("edición de bitácora en el servidor", () => {
  it.each(["user", "finance", "contratista"])("permite a su autor %s corregir notas y descripciones sin exigir las históricas", async role => {
    const { actor, ids, args, read } = await fixture(role);
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args())).status).toBe("applied");
    expect(await read(ids.log)).toMatchObject({ avance_dia: "Avance corregido", created_by: "actor", updated_by: "actor", revision: 2 });
    expect(await read(ids.photo)).toMatchObject({ descripcion: "" });
    expect(await read(ids.document)).toMatchObject({ nombre: "obra.pdf" });
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ baseRevision: 2, updatedAttachments: [{ clientId: "photo", description: "Descripción corregida" }] }))).status).toBe("applied");
    expect((await read(ids.photo)).descripcion).toBe("Descripción corregida");
  });
  it.each(["viewer", "almacenista", "unknown"])("rechaza al autor cuyo rol es %s", async role => {
    const { actor, args } = await fixture(role);
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args())).status).toBe("forbidden");
  });
  it.each(["other", undefined])("no atribuye al responsable un reporte con autor %s", async owner => {
    const { actor, args, t, ids } = await fixture();
    await t.run(ctx => ctx.db.patch(ids.log, { created_by: owner }));
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args())).status).toBe("forbidden");
  });
  it.each([
    { fecha: "28/10/2026" }, { responsable: "Otro" }, { categoria: "Acabados" },
    { familias_tags: ["Otra"] }, { status: "Con retrasos" },
  ])("rechaza cambios protegidos del autor: %j", async changes => {
    const { actor, args, ids, read } = await fixture();
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ payload: { ...ids.payload, ...changes } }))).status).toBe("forbidden");
    expect((await read(ids.log)).revision).toBe(1);
  });
  it.each([
    { removedAttachmentClientIds: ["photo"] }, { removedAttachmentClientIds: ["document"] },
    { updatedAttachments: [{ clientId: "document", name: "otro.pdf" }] },
    { updatedAttachments: [{ clientId: "document", description: "Modificado" }] },
    { updatedAttachments: [{ clientId: "photo", name: "otra.jpg" }] },
    { updatedAttachments: [{ clientId: "foreign-photo", description: "Ajena" }] },
  ])("rechaza modificar archivos fuera del permiso: %j", async changes => {
    const { actor, args, read, ids } = await fixture();
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args(changes))).status).toBe("forbidden");
    expect(await read(ids.photo)).not.toBeNull();
    expect(await read(ids.document)).not.toBeNull();
    expect((await read(ids.log)).revision).toBe(1);
  });
  it("permite añadir una foto con reserva y conserva los adjuntos existentes", async () => {
    const { actor, args, upload, t, ids } = await fixture();
    const input = args(); input.addedAttachments = [await upload(input.operationId)];
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, input)).status).toBe("applied");
    const files = await t.run(ctx => ctx.db.query("documentos").withIndex("by_bitacora_id", q => q.eq("bitacora_id", ids.log)).collect());
    expect(files).toHaveLength(3);
    expect(files.find(file => file.client_id === "new-file")).toMatchObject({ descripcion: "Evidencia nueva", type: "bitacora_foto" });
  });
  it("rechaza documentos nuevos del autor y descripciones vacías modificadas", async () => {
    const { actor, args, upload } = await fixture();
    const input = args(); input.addedAttachments = [await upload(input.operationId, "document")];
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, input)).status).toBe("forbidden");
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ updatedAttachments: [{ clientId: "photo", description: "  " }] }))).status).toBe("forbidden");
  });
  it("permite corregir notas con clasificación histórica eliminada", async () => {
    const { t, ids, actor, args } = await fixture();
    await t.run(async ctx => { await ctx.db.delete(ids.partida); await ctx.db.patch(ids.log, { familias_tags: ["Familia retirada"] }); });
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ payload: { ...ids.payload, familias_tags: ["Familia retirada"], avance_dia: "Corregido" } }))).status).toBe("applied");
  });
  it("conserva edición completa y eliminación para administradores, incluso sin autor", async () => {
    const { t, ids, actor, args, read } = await fixture("admin");
    await t.run(ctx => ctx.db.patch(ids.log, { created_by: undefined }));
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ payload: { ...ids.payload, fecha: "28/10/2026", responsable: "Otro", status: "Con retrasos" }, removedAttachmentClientIds: ["photo", "document"] }))).status).toBe("applied");
    expect(await read(ids.photo)).toBeNull(); expect(await read(ids.document)).toBeNull();
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ operation: "delete", baseRevision: 2 }))).status).toBe("applied");
    expect((await read(ids.log)).deleted_at).toBeGreaterThan(0);
  });
  it("rechaza eliminar como autor, cambiar proyecto y reutilizar una revisión antigua", async () => {
    const { t, ids, actor, args, read } = await fixture();
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ operation: "delete" }))).status).toBe("forbidden");
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ proyecto: ids.otherProject }))).status).toBe("forbidden");
    await t.run(ctx => ctx.db.patch(ids.log, { revision: 2, avance_dia: "Cambio de otro usuario" }));
    expect(await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args())).toMatchObject({ status: "conflict", reason: "changed" });
    expect((await read(ids.log)).avance_dia).toBe("Cambio de otro usuario");
  });
  it("revalida el rol al sincronizar y confirma reintentos sin duplicar", async () => {
    const { actor, args, t, ids, read } = await fixture();
    const input = args();
    const first = await actor.mutation(api.bitacoraOffline.applyOfflineOperation, input);
    expect(await actor.mutation(api.bitacoraOffline.applyOfflineOperation, input)).toEqual(first);
    expect((await read(ids.log)).revision).toBe(2);
    await t.run(ctx => ctx.db.patch(ids.user, { role: "viewer" }));
    expect((await actor.mutation(api.bitacoraOffline.applyOfflineOperation, args({ baseRevision: 2 }))).status).toBe("forbidden");
  });
});
