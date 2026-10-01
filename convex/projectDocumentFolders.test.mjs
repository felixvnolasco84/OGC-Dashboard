import { describe, expect, it } from "vitest";
import { assertProjectFolder, ensureProjectDocumentRoot, resolveProjectDocumentFolder } from "./projectDocumentFolders";
import { startProjectDocumentMigration, stepProjectDocumentMigration } from "./projectDocumentMigration";
import { createWithStorage, create, createFolder, moveDocument, moveFolder, update, listFileManagerDocuments } from "./documentos";
import { createLogEntry, updateLogEntry, uploadBitacoraPhoto } from "./bitacora";
import { applyOfflineOperation } from "./bitacoraOffline";
import { startDirectInvoiceIntake } from "./invoiceAnalysis";
import { projectDocumentFolders, projectDocumentCounts } from "../src/lib/project-document-folders";

// Small indexed database double. Cursors use stable creation IDs, including across moves/deletes.
function database() {
  const tables = new Map();
  let sequence = 0;
  const records = table => tables.get(table) || [];
  const db = {
    normalizeId(table, id) { return id.startsWith(`${table}:`) ? id : null; },
    async insert(table, value) {
      const doc = { ...value, _id: `${table}:${++sequence}`, _creationTime: sequence };
      tables.set(table, [...records(table), doc]);
      return doc._id;
    },
    async get(id) { return [...tables.values()].flat().find(doc => doc._id === id) || null; },
    async patch(id, patch) {
      const doc = await db.get(id);
      if (!doc) throw new Error("missing document");
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete doc[key]; else doc[key] = value;
      }
    },
    async delete(id) {
      for (const [table, docs] of tables) tables.set(table, docs.filter(doc => doc._id !== id));
    },
    query(table) {
      let predicates = [], direction = "asc";
      const result = () => records(table).filter(doc => predicates.every(predicate => predicate(doc)))
        .sort((a, b) => (a._creationTime - b._creationTime) * (direction === "asc" ? 1 : -1));
      const query = {
        withIndex(_name, callback) {
          const q = { eq(key, value) { predicates.push(doc => doc[key] === value); return q; } };
          callback?.(q); return query;
        },
        order(value) { direction = value; return query; },
        async collect() { return result(); },
        async first() { return result()[0] || null; },
        async unique() { const rows = result(); if (rows.length > 1) throw new Error("not unique"); return rows[0] || null; },
        async paginate({ cursor, numItems }) {
          const rows = result().filter(doc => !cursor || doc._creationTime > Number(cursor));
          const page = rows.slice(0, numItems);
          return { page, isDone: rows.length <= numItems, continueCursor: String(page.at(-1)?._creationTime || cursor || 0) };
        },
      };
      return query;
    },
  };
  db.system = { get: db.get };
  return { db, auth: { getUserIdentity: async () => ({ subject: "test-user" }) },
    storage: { getUrl: async id => `https://files.test/${id}` }, scheduler: { runAfter: async () => "scheduled" } };
}

async function fixture() {
  const ctx = database();
  const proyecto = await ctx.db.insert("desarrollos", { nombre: "Larena - Torre I" });
  await ctx.db.insert("users", { clerkId: "test-user", email: "test@example.com", role: "admin", allowed_desarrollos: [] });
  return { ctx, proyecto };
}

async function migrate(ctx, dryRun = false) {
  const id = await startProjectDocumentMigration._handler(ctx, { dryRun });
  let result;
  const changes = [], issues = [];
  for (let i = 0; i < 1000; i++) {
    result = await stepProjectDocumentMigration._handler(ctx, { runId: id });
    changes.push(...result.changes); issues.push(...result.issues);
    if (result.isDone) return { ...result, changes, issues };
  }
  throw new Error("migration did not finish");
}

describe("project document organization", () => {
  it("keeps same-name projects isolated and reuses types despite case, whitespace and rename", async () => {
    const { ctx, proyecto } = await fixture();
    const other = await ctx.db.insert("desarrollos", { nombre: "Larena - Torre I" });
    const first = await resolveProjectDocumentFolder(ctx, proyecto, "Factura");
    expect(await resolveProjectDocumentFolder(ctx, proyecto, "  FACTURA  ")).toEqual(first);
    await ctx.db.patch(first.folder_id, { nombre: "Facturas aprobadas" });
    expect(await resolveProjectDocumentFolder(ctx, proyecto, "factura")).toEqual(first);
    const archive = await createFolder._handler(ctx, { proyecto, nombre: "Archivo" });
    await moveFolder._handler(ctx, { id: first.folder_id, parent_folder_id: archive });
    expect(await resolveProjectDocumentFolder(ctx, proyecto, "factura")).toEqual(first);
    expect((await resolveProjectDocumentFolder(ctx, other, "Factura")).folder_id).not.toBe(first.folder_id);
    await ctx.db.patch(proyecto, { nombre: "Larena nuevo nombre" });
    const root = await ensureProjectDocumentRoot(ctx, proyecto);
    expect((await ctx.db.get(root)).nombre).toBe("Larena nuevo nombre");
  });

  it("classifies normal and legacy loads; honors manual destinations and type updates", async () => {
    const { ctx, proyecto } = await fixture();
    const transaction = await ctx.db.insert("transacciones", { proyecto });
    const input = { proyecto, nombre: "a.pdf", descripcion: "", type: "Factura", storage_id: "storage:1", size: 1 };
    const automatic = await createWithStorage._handler(ctx, input);
    const custom = await createFolder._handler(ctx, { proyecto, nombre: "Contratos especiales" });
    const manual = await createWithStorage._handler(ctx, { ...input, folder_id: custom });
    await update._handler(ctx, { id: automatic, type: "Contrato" });
    await update._handler(ctx, { id: manual, type: "Contrato" });
    expect((await ctx.db.get(manual)).folder_id).toBe(custom);
    expect((await ctx.db.get(manual)).folder_assignment).toBe("manual");
    expect((await ctx.db.get((await ctx.db.get(automatic)).folder_id)).nombre).toBe("Contrato");
    const legacy = await create._handler(ctx, { proyecto, transaccion_id: transaction, nombre: "old.pdf", descripcion: "", image: "https://old.test/file", type: "Factura" });
    expect((await ctx.db.get(legacy)).folder_assignment).toBe("automatic");
    await moveDocument._handler(ctx, { id: automatic, folder_id: custom });
    await update._handler(ctx, { id: automatic, type: "Otro" });
    expect((await ctx.db.get(automatic)).folder_id).toBe(custom);
  });

  it("routes minutes to Minutas and preserves explicit uploads there", async () => {
    const { ctx, proyecto } = await fixture();
    const minute = await resolveProjectDocumentFolder(ctx, proyecto, "Minuta");
    expect(await resolveProjectDocumentFolder(ctx, proyecto, "MINUTAS")).toEqual(minute);
    expect((await ctx.db.get(minute.folder_id)).nombre).toBe("Minutas");
    expect(await resolveProjectDocumentFolder(ctx, proyecto, "Otro", minute.folder_id))
      .toEqual({ folder_id: minute.folder_id, folder_assignment: "manual" });
  });

  it("organizes Bitácora creation, editing and additional photos while retaining their report links", async () => {
    const { ctx, proyecto } = await fixture();
    const partida = await ctx.db.insert("partidas", { proyecto, nombre: "Estructura", nivel: 1 });
    const photo = await ctx.db.insert("_storage", { contentType: "image/png", size: 10 });
    const document = await ctx.db.insert("_storage", { contentType: "application/pdf", size: 10 });
    const logId = await createLogEntry._handler(ctx, {
      proyecto, partida_id: partida, categoria: "Estructura", familias_tags: [], responsable: "Test", fecha: "30/09/2026",
      avance_dia: "Trabajo", imagenes: [photo], documentos: [document], documentosNombres: ["a.pdf"],
    });
    await updateLogEntry._handler(ctx, { logId, imagenes: [photo], documentos: [document] });
    await uploadBitacoraPhoto._handler(ctx, { bitacora_id: logId, storage_id: photo });
    const attachments = await ctx.db.query("documentos").collect();
    expect(attachments).toHaveLength(5);
    for (const attachment of attachments) {
      expect(attachment.bitacora_id).toBe(logId);
      expect(attachment.folder_assignment).toBe("automatic");
      expect((await ctx.db.get(attachment.folder_id)).nombre).toBe(attachment.type);
    }
    expect((await ctx.db.query("document_folders").collect()).filter(folder => folder.system_kind === "document_type")).toHaveLength(2);
  });

  it("organizes offline attachments and preserves operation retry deduplication", async () => {
    const { ctx, proyecto } = await fixture();
    const partida = await ctx.db.insert("partidas", { proyecto, nombre: "Estructura", nivel: 1 });
    const photo = await ctx.db.insert("_storage", { contentType: "image/png", size: 10 });
    const document = await ctx.db.insert("_storage", { contentType: "application/pdf", size: 10 });
    const addedAttachments = [
      { clientId: "photo-1", storageId: photo, kind: "photo", name: "a.png" },
      { clientId: "document-1", storageId: document, kind: "document", name: "a.pdf" },
    ];
    for (const attachment of addedAttachments) await ctx.db.insert("bitacora_upload_reservations", {
      proyecto, operation_id: "offline-op", attachment_id: attachment.clientId, storage_id: attachment.storageId,
    });
    const args = {
      proyecto, operationId: "offline-op", clientId: "offline-log", operation: "create", baseRevision: 0,
      payload: { partida_id: partida, categoria: "Estructura", familias_tags: [], responsable: "Test", fecha: "30/09/2026", avance_dia: "Trabajo" },
      addedAttachments, updatedAttachments: [], removedAttachmentClientIds: [],
    };
    const result = await applyOfflineOperation._handler(ctx, args);
    expect(result.status).toBe("applied");
    expect(await applyOfflineOperation._handler(ctx, args)).toEqual(result);
    const attachments = await ctx.db.query("documentos").collect();
    expect(attachments).toHaveLength(2);
    for (const attachment of attachments) {
      expect(attachment.bitacora_id).toBe(result.logId);
      expect(attachment.folder_assignment).toBe("automatic");
      expect((await ctx.db.get(attachment.folder_id)).nombre).toBe(attachment.type);
    }
  });

  it("organizes direct invoice intake while preserving invoice links and request deduplication", async () => {
    const { ctx, proyecto } = await fixture();
    const args = {
      project_id: proyecto, client_request_id: "invoice-1",
      documents: [{ storage_id: "storage:xml", name: "factura.xml", type: "factura", size: 10, mime_type: "application/xml" }],
    };
    const result = await startDirectInvoiceIntake._handler(ctx, args);
    expect(result.duplicate).toBe(false);
    const repeat = await startDirectInvoiceIntake._handler(ctx, args);
    expect(repeat.duplicate).toBe(true); expect(repeat.invoice_id).toBe(result.invoice_id);
    const documents = await ctx.db.query("documentos").collect();
    expect(documents).toHaveLength(1);
    expect(documents[0].invoice_id).toBe(result.invoice_id);
    expect(documents[0].folder_assignment).toBe("automatic");
    expect((await ctx.db.get(documents[0].folder_id)).type_key).toBe("factura");
  });

  it("rejects foreign destinations, root mutations, cycles and project-changing ancestors", async () => {
    const { ctx, proyecto } = await fixture();
    const other = await ctx.db.insert("desarrollos", { nombre: "Otro" });
    const foreign = (await resolveProjectDocumentFolder(ctx, other, "Otro")).folder_id;
    await expect(resolveProjectDocumentFolder(ctx, proyecto, "Otro", foreign)).rejects.toThrow("no pertenece");
    const root = await ensureProjectDocumentRoot(ctx, proyecto);
    await expect(moveFolder._handler(ctx, { id: root, parent_folder_id: foreign })).rejects.toThrow("raíz");
    const child = await createFolder._handler(ctx, { proyecto, nombre: "Custom" });
    await expect(moveFolder._handler(ctx, { id: child, parent_folder_id: foreign })).rejects.toThrow("no pertenece");
    const nested = await createFolder._handler(ctx, { proyecto, nombre: "Nested", parent_folder_id: child });
    await expect(moveFolder._handler(ctx, { id: child, parent_folder_id: nested })).rejects.toThrow("children");
    const conflict = await ctx.db.insert("document_folders", { proyecto, parent_folder_id: foreign, nombre: "Conflicting" });
    await expect(assertProjectFolder(ctx, conflict, proyecto)).rejects.toThrow("no pertenece");
  });

  it("keeps root and unfiled documents accessible together with correct search and paging", async () => {
    const { ctx, proyecto } = await fixture();
    const root = await ensureProjectDocumentRoot(ctx, proyecto);
    const doc = await ctx.db.insert("documentos", { proyecto, nombre: "root invoice", type: "Factura", descripcion: "", folder_id: root, size: 7 });
    await ctx.db.insert("documentos", { proyecto, nombre: "legacy invoice", type: "Factura", descripcion: "", size: 9 });
    const other = await ctx.db.insert("desarrollos", { nombre: "Other" });
    await ctx.db.insert("documentos", { proyecto: other, nombre: "foreign invoice", type: "Factura", descripcion: "" });
    const page = await listFileManagerDocuments._handler(ctx, { proyecto, page: 1, pageSize: 1, search: "invoice" });
    expect(page.total).toBe(2); expect(page.totalPages).toBe(2); expect(page.totalSize).toBe(16);
    await moveDocument._handler(ctx, { id: doc });
    expect((await ctx.db.get(doc)).folder_assignment).toBe("manual");
    expect((await ctx.db.get(doc)).folder_id).toBe(root);
  });

  it("projects one shared tree for sidebar, breadcrumbs and destination picker without changing stored folders", () => {
    const raw = [{ _id: "root", nombre: "Project" }, { _id: "type", parent_folder_id: "root" }, { _id: "nested", parent_folder_id: "type" }];
    expect(projectDocumentFolders(raw, "root")).toEqual([{ _id: "type", parent_folder_id: undefined }, { _id: "nested", parent_folder_id: "type" }]);
    expect(raw[1].parent_folder_id).toBe("root");
    expect(projectDocumentCounts({ root: 2, rootId: 3, type: 4 }, "rootId")).toEqual({ root: 5, type: 4 });
  });

  it("diagnoses without changing files and migrates twice without losing files or moving custom content", async () => {
    const { ctx, proyecto } = await fixture();
    const root = await ctx.db.insert("document_folders", { nombre: "Larena - Torre I" });
    const custom = await ctx.db.insert("document_folders", { nombre: "Personalizado", parent_folder_id: root });
    const minute1 = await ctx.db.insert("document_folders", { nombre: "MINUTAS LARENA" });
    const minute2 = await ctx.db.insert("document_folders", { nombre: "Minutas", parent_folder_id: root });
    const legacyType = await ctx.db.insert("document_folders", { nombre: "FACTURA", parent_folder_id: root });
    const original = [];
    for (const folder_id of [custom, minute1, minute2, undefined]) {
      original.push(await ctx.db.insert("documentos", { proyecto, nombre: "a.pdf", type: "Otro", folder_id, storage_id: "storage:safe" }));
    }
    original.push(await ctx.db.insert("documentos", { proyecto, nombre: "invoice.pdf", type: "Factura", folder_id: legacyType, storage_id: "storage:safe" }));
    const before = JSON.stringify(await ctx.db.query("document_folders").collect());
    const documentsBefore = JSON.stringify(await ctx.db.query("documentos").collect());
    const dry = await migrate(ctx, true);
    expect(dry.changed).toBeGreaterThan(0);
    expect(JSON.stringify(await ctx.db.query("document_folders").collect())).toBe(before);
    expect(JSON.stringify(await ctx.db.query("documentos").collect())).toBe(documentsBefore);
    const first = await migrate(ctx);
    expect(first.changed).toBeGreaterThan(0);
    expect((await ctx.db.get(custom)).parent_folder_id).toBe(root);
    expect((await ctx.db.get(original[0])).folder_id).toBe(custom);
    const minutes = (await ctx.db.query("document_folders").collect()).filter(folder => folder.nombre === "Minutas");
    expect(minutes).toHaveLength(1); expect(minutes[0].parent_folder_id).toBe(root);
    for (const id of original) expect((await ctx.db.get(id)).storage_id).toBe("storage:safe");
    const second = await migrate(ctx);
    expect(second.changed).toBe(0);
    expect((await ctx.db.query("documentos").collect()).map(doc => doc._id)).toEqual(original);
    await ctx.db.patch(legacyType, { nombre: "Facturas aprobadas" });
    expect((await resolveProjectDocumentFolder(ctx, proyecto, "Factura")).folder_id).toBe(legacyType);
  });

  it("reports shared or unidentified minutes and leaves their contents unchanged", async () => {
    const { ctx, proyecto } = await fixture();
    const other = await ctx.db.insert("desarrollos", { nombre: "Other" });
    const shared = await ctx.db.insert("document_folders", { nombre: "MINUTAS COMPARTIDAS" });
    const unknown = await ctx.db.insert("document_folders", { nombre: "MINUTAS VACÍAS" });
    for (const project of [proyecto, other]) await ctx.db.insert("documentos", { proyecto: project, nombre: "a.pdf", type: "Otro", folder_id: shared });
    const result = await migrate(ctx);
    expect(result.issues.some(issue => issue.includes(shared))).toBe(true);
    expect(result.issues.some(issue => issue.includes(unknown))).toBe(true);
    expect((await ctx.db.get(shared)).parent_folder_id).toBeUndefined();
    expect((await ctx.db.query("documentos").collect()).every(doc => doc.folder_id === shared)).toBe(true);
  });

  it("resumes bounded minute consolidation with more than one document and child-folder batch", async () => {
    const { ctx, proyecto } = await fixture();
    const root = await ensureProjectDocumentRoot(ctx, proyecto);
    const target = (await resolveProjectDocumentFolder(ctx, proyecto, "Minuta")).folder_id;
    const source = await ctx.db.insert("document_folders", { nombre: "MINUTAS LARENA", proyecto });
    for (let i = 0; i < 125; i++) {
      await ctx.db.insert("documentos", { proyecto, folder_id: source, nombre: `${i}.pdf`, type: "Otro" });
      await ctx.db.insert("document_folders", { nombre: `Semana ${i}`, parent_folder_id: source, proyecto });
    }
    const result = await migrate(ctx);
    expect(result.isDone).toBe(true);
    expect(await ctx.db.get(source)).toBeNull();
    expect((await ctx.db.get(target)).parent_folder_id).toBe(root);
    expect((await ctx.db.query("documentos").collect()).filter(doc => doc.folder_id === target)).toHaveLength(125);
    expect((await ctx.db.query("document_folders").collect()).filter(folder => folder.parent_folder_id === target)).toHaveLength(125);
    expect((await migrate(ctx)).changed).toBe(0);
  });

});
