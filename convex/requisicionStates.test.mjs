import { describe, expect, it } from "vitest";
import { updateStatus, updateStatusEntrega, reviewRequisicion, reviewSingleItem } from "./requisiciones";
import { getRequisicionStateChange } from "./requisicionStateRules";

// In-memory contexts only: no deployment, network, notifications or real requisitions.
function fixture(role = "admin", overrides = {}, access = true) {
    const tables = {
        users: [{ _id: "actor", clerkId: "session", role, email: "actor@example.test", name: "Actor", organization_id: "org", allowed_desarrollos: access ? ["project"] : [] }],
        desarrollos: [{ _id: "project", organization_id: access ? "org" : "other-org" }],
        requisiciones: [{ _id: "req", proyecto: "project", solicitante_id: "actor", solicitante_nombre: "Actor", tipo: "material", status_revision: "Aprobada", status: "En proceso", status_entrega: "Pendiente", ...overrides }],
        requisicion_items: [
            { _id: "item-1", requisicion_id: "req", cantidad: 10, familia: "Materiales", unidad: "piezas", status_revision: "pendiente" },
            { _id: "item-2", requisicion_id: "req", cantidad: 5, familia: "Materiales", unidad: "piezas", status_revision: "pendiente" },
        ],
    };
    const writes = [];
    const scheduled = [];
    const find = id => Object.values(tables).flat().find(row => row._id === id);
    const ctx = {
        auth: { getUserIdentity: async () => ({ subject: "session" }) },
        scheduler: { runAfter: async (...args) => scheduled.push(args) },
        storage: { getMetadata: async () => ({ contentType: "image/png", size: 10 }) },
        db: {
            get: async id => structuredClone(find(id) || null),
            patch: async (id, fields) => { writes.push(["patch", id, fields]); Object.assign(find(id), fields); },
            insert: async (table, fields) => { const id = `${table}-${writes.length}`; writes.push(["insert", table, fields]); (tables[table] ||= []).push({ _id: id, ...fields }); return id; },
            query(table) {
                const filters = [];
                const builder = { eq(key, value) { filters.push([key, value]); return builder; } };
                const query = {
                    withIndex(_index, fn) { fn(builder); return query; },
                    collect: async () => structuredClone((tables[table] || []).filter(row => filters.every(([key, value]) => row[key] === value))),
                    first: async () => (await query.collect())[0] || null,
                };
                return query;
            },
        },
    };
    return { ctx, tables, writes, scheduled, req: find("req") };
}
const actor = { changed_by_id: "actor", changed_by_name: "Actor" };
const pay = (f, status = "Pagado", extra = {}) => updateStatus._handler(f.ctx, { id: "req", status, ...actor, ...extra });
const deliver = (f, status = "Completo", extra = {}) => updateStatusEntrega._handler(f.ctx, { id: "req", status_entrega: status, ...actor, ...extra });
const reviewArgs = { id: "req", reviewer_id: "actor", reviewer_name: "Actor", items: [{ item_id: "item-1", status_revision: "aprobado", cantidad_aprobada: 10 }, { item_id: "item-2", status_revision: "aprobado", cantidad_aprobada: 5 }] };

describe("independent requisition dimensions", () => {
    it.each(["admin", "finance"])("%s marks payment without resetting delivery or review", async role => {
        const f = fixture(role, { status_revision: "Parcialmente Aprobada", status_entrega: "Completo" });
        expect(await pay(f)).toEqual({ success: true, changed: true });
        expect(f.req).toMatchObject({ status: "Pagado", status_entrega: "Completo", status_revision: "Parcialmente Aprobada" });
        expect(f.tables.requisicion_history).toHaveLength(1);
        expect(f.tables.requisicion_history[0]).toMatchObject({ field_changed: "status", changed_by_id: "actor" });
    });
    it.each(["admin", "user", "contratista"])("%s receives without changing unpaid status", async role => {
        const f = fixture(role, { status_revision: "Parcialmente Aprobada" });
        await deliver(f, "Completo", { comentario: "Recibido en obra" });
        expect(f.req).toMatchObject({ status: "En proceso", status_entrega: "Completo", status_revision: "Parcialmente Aprobada" });
        expect(f.tables.requisicion_history).toHaveLength(1);
        expect(f.tables.requisicion_history[0]).toMatchObject({ field_changed: "status_entrega", comentario: "Recibido en obra" });
    });
    it.each(["admin", "finance"])("%s reviews materials without reverting paid/received states", async role => {
        const f = fixture(role, { status_revision: "Pendiente de revisión", status: "Pagado", status_entrega: "Completo" });
        await reviewRequisicion._handler(f.ctx, reviewArgs);
        expect(f.req).toMatchObject({ status_revision: "Aprobada", status: "Pagado", status_entrega: "Completo" });
    });
    it("repeated payment/delivery writes do not add history or evidence", async () => {
        const f = fixture("admin", { status: "Pagado", status_entrega: "Completo", status_revision: "Rechazada" });
        const documents = { documentos: [{ storage_id: "file", nombre: "Foto", type: "image/png", size: 10 }] };
        expect(await pay(f, "Pagado", documents)).toEqual({ success: true, changed: false });
        expect(await deliver(f, "Completo", documents)).toEqual({ success: true, changed: false });
        expect(f.writes).toEqual([]);
        expect(f.scheduled).toEqual([]);
    });
    it.each(["Pendiente de revisión", "Rechazada"])("requires completed approval for %s without writing", async status_revision => {
        const f = fixture("admin", { status_revision });
        await expect(pay(f)).rejects.toThrow("Primero completa la revisión");
        await expect(deliver(f)).rejects.toThrow("Primero completa la revisión");
        await expect(deliver(f, "Parcial")).rejects.toThrow("Primero completa la revisión");
        expect(f.writes).toEqual([]);
    });
    it("preserves explicit reversals even if the review is no longer approved", async () => {
        const f = fixture("admin", { status: "Pagado", status_entrega: "Completo", status_revision: "Rechazada" });
        await pay(f, "En proceso", { comentario: "Corrección del pago" });
        expect(f.req.status_entrega).toBe("Completo");
        await deliver(f, "Pendiente", { comentario: "Corrección de recepción" });
        expect(f.req).toMatchObject({ status: "En proceso", status_revision: "Rechazada", status_entrega: "Pendiente" });
        expect(f.tables.requisicion_history).toHaveLength(2);
    });
    it("rejects stale confirmation before any writes", async () => {
        const f = fixture("admin", { status: "Cancelado", status_entrega: "Parcial" });
        await expect(pay(f, "Pagado", { expected_status: "En proceso" })).rejects.toThrow("El estado cambió");
        await expect(deliver(f, "Completo", { expected_status_entrega: "Pendiente" })).rejects.toThrow("El estado cambió");
        expect(f.writes).toEqual([]);
    });
    it("keeps partial quantity approval through inline review and ignores repeated decisions", async () => {
        const f = fixture("finance", { status_revision: "Pendiente de revisión", status: "Pagado", status_entrega: "Completo" });
        const decision = { item_id: "item-1", status_revision: "aprobado", cantidad_aprobada: 6, reviewer_id: "actor", reviewer_name: "Actor" };
        expect(await reviewSingleItem._handler(f.ctx, decision)).toEqual({ allReviewed: false });
        const writes = f.writes.length;
        await reviewSingleItem._handler(f.ctx, decision);
        expect(f.writes).toHaveLength(writes);
        expect(await reviewSingleItem._handler(f.ctx, { ...decision, item_id: "item-2", cantidad_aprobada: 5 })).toMatchObject({ status_revision: "Parcialmente Aprobada" });
        expect(f.req).toMatchObject({ status: "Pagado", status_entrega: "Completo" });
    });
    it("bulk review supports mixed decisions and reduced quantities", async () => {
        for (const second of [{ status_revision: "rechazado" }, { status_revision: "aprobado", cantidad_aprobada: 2 }]) {
            const f = fixture();
            expect(await reviewRequisicion._handler(f.ctx, { ...reviewArgs, items: [reviewArgs.items[0], { item_id: "item-2", ...second }] })).toMatchObject({ status_revision: "Parcialmente Aprobada" });
        }
    });
    it("rejects empty, incomplete, duplicate or foreign material review before writing", async () => {
        for (const items of [[], [reviewArgs.items[0]], [reviewArgs.items[0], reviewArgs.items[0]], [reviewArgs.items[0], { ...reviewArgs.items[1], item_id: "foreign" }]]) {
            const f = fixture();
            await expect(reviewRequisicion._handler(f.ctx, { ...reviewArgs, items })).rejects.toThrow();
            expect(f.writes).toEqual([]);
        }
    });
    it.each(["finance", "viewer", "almacenista", "unknown"])("denies delivery to %s", async role => {
        const f = fixture(role);
        await expect(deliver(f)).rejects.toThrow("Sin permisos");
        expect(f.writes).toEqual([]);
    });
    it.each(["user", "contratista", "viewer", "almacenista", "unknown"])("denies payment and approval to %s", async role => {
        const f = fixture(role);
        await expect(pay(f)).rejects.toThrow("Sin permisos");
        await expect(reviewRequisicion._handler(f.ctx, reviewArgs)).rejects.toThrow("Sin permisos");
        expect(f.writes).toEqual([]);
    });
    it("denies delivery for a contractor's other requisition", async () => {
        const f = fixture("contratista", { solicitante_id: "other" });
        await expect(deliver(f)).rejects.toThrow("Sin permisos");
        expect(f.writes).toEqual([]);
    });
    it.each(["admin", "finance", "user", "contratista"])("enforces project scope for %s", async role => {
        const f = fixture(role, {}, false);
        for (const operation of [() => pay(f), () => deliver(f), () => reviewRequisicion._handler(f.ctx, reviewArgs)]) await expect(operation()).rejects.toThrow();
        expect(f.writes).toEqual([]);
    });
    it("rejects spoofed actors and unauthenticated callers", async () => {
        const f = fixture();
        await expect(pay(f, "Pagado", { changed_by_id: "other" })).rejects.toThrow("Sin permisos");
        f.ctx.auth.getUserIdentity = async () => null;
        await expect(deliver(f)).rejects.toThrow("Not authenticated");
        await expect(reviewRequisicion._handler(f.ctx, reviewArgs)).rejects.toThrow("Not authenticated");
        expect(f.writes).toEqual([]);
    });
    it("shows the linked onsite payment effect and conserved dimensions", async () => {
        const f = fixture("finance", { status_entrega: "Completo", pago_obra: { estado: "pendiente", importe: 100 } });
        const preview = getRequisicionStateChange(f.req, { paymentStatus: "Pagado" });
        expect(preview.rows).toContainEqual({ label: "Entrega", before: "Completo", after: "Completo" });
        expect(preview.rows).toContainEqual({ label: "Solicitud de pago en obra", before: "pendiente", after: "pagado" });
        await pay(f);
        expect(f.req.pago_obra.estado).toBe("pagado");
    });
    it("links reception evidence to the existing history and rejects invalid photos before writing", async () => {
        const f = fixture();
        const documentos = [{ storage_id: "photo", nombre: "Remisión", type: "image/png", size: 10 }];
        await deliver(f, "Completo", { documentos });
        expect(f.tables.requisicion_documentos[0]).toMatchObject({ categoria: "nota_remision", nombre: "Remisión" });
        expect(f.tables.requisicion_history[0].documento_ids).toEqual([f.tables.requisicion_documentos[0]._id]);
        const invalid = fixture();
        invalid.ctx.storage.getMetadata = async () => ({ contentType: "application/pdf", size: 10 });
        await expect(deliver(invalid, "Completo", { documentos })).rejects.toThrow("La foto de remisión");
        expect(invalid.writes).toEqual([]);
    });
    it("rejects unknown payment and delivery states before writing", async () => {
        const f = fixture();
        await expect(pay(f, "unknown")).rejects.toThrow("Estado de pago inválido");
        await expect(deliver(f, "unknown")).rejects.toThrow("Estado de entrega inválido");
        expect(f.writes).toEqual([]);
    });
    it("does not preview an onsite payment change when the payment condition is already fulfilled", () => {
        const f = fixture("admin", { status: "Pagado", pago_obra: { estado: "pendiente" } });
        const preview = getRequisicionStateChange(f.req, { paymentStatus: "Pagado" });
        expect(preview.changed).toBe(false);
        expect(preview.rows.every(row => row.before === row.after)).toBe(true);
    });
});
