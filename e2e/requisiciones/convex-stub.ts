import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const params = new URLSearchParams(location.search);
const longName = "Instalaciones hidrosanitarias y materiales para acondicionamiento del edificio";
const baseItem = { familia: "Instalaciones", unidad: "piezas", cantidad: 10, precio_unitario: 12345678.9, presupuesto_aprobado: 1000, pagado: 400, monto: 123456789.01 };
let requisiciones = [
    { _id: "pending", solicitante_id: "current", solicitante_nombre: "María Fernanda García Hernández Responsable de instalaciones", tipo: "material", status_revision: "Pendiente de revisión", status: "En proceso", fecha_solicitud: "30/09/2026", fecha_entrega: "15/10/2026", descripcion: "Nota general " + "ReferenciaExtremadamenteLargaSinEspacios".repeat(6), pago_obra: { estado: "pendiente", importe: 987654321.99 }, items: [
        { ...baseItem, _id: "item-pending", sub_partida: longName, status_revision: "pendiente" },
        { ...baseItem, _id: "item-approved", sub_partida: "Material aprobado", status_revision: "aprobado", cantidad_aprobada: 7 },
        { ...baseItem, _id: "item-rejected", sub_partida: "Material rechazado", status_revision: "rechazado" },
    ] },
    { _id: "approved", solicitante_id: "other", solicitante_nombre: "Carlos", tipo: "equipo", status_revision: "Parcialmente Aprobada", status: "En proceso", fecha_solicitud: "29/09/2026", fecha_entrega: "", descripcion: "Equipo aprobado", items: [{ ...baseItem, _id: "approved-item", sub_partida: "Equipo aprobado", status_revision: "aprobado", cantidad_aprobada: 5 }] },
    { _id: "paid", solicitante_id: "current", solicitante_nombre: "María", tipo: "material", status_revision: "Aprobada", status: "Pagado", fecha_solicitud: "28/09/2026", fecha_entrega: "", descripcion: "Requisición pagada", items: [{ ...baseItem, _id: "paid-item", sub_partida: "Material pagado", status_revision: "aprobado", cantidad_aprobada: 10 }] },
    { _id: "received", solicitante_id: "other", solicitante_nombre: "Pedro", tipo: "material", status_revision: "Aprobada", status: "Pagado", status_entrega: "Completo", fecha_solicitud: "27/09/2026", fecha_entrega: "30/09/2026", descripcion: "Recibida", items: [{ ...baseItem, _id: "received-item", sub_partida: "Material recibido", status_revision: "aprobado", cantidad_aprobada: 10 }] },
];
if (params.has("received-unpaid")) requisiciones = requisiciones.map(req => req._id === "approved" ? { ...req, status_entrega: "Completo" } : req);
if (params.has("rejected")) requisiciones = requisiciones.map(req => req._id === "pending" ? { ...req, status_revision: "Rechazada" } : req);
const provider = { _id: "provider", razon_social: "ProveedorDeMaterialesConNombreExtensoSinEspacios".repeat(3), rfc: "RFC1234567890", direccion: "Dirección de prueba " + longName, nombre_contacto: "Contacto del proveedor", telefono_contacto: "5551234567", banco: "Banco de prueba", cuenta: "12345678901234567890", clabe: "123456789012345678", created_by: "current" };
const events = [{ _id: "event", subject: "Aviso de prueba " + longName, actor_name: "Administración", sent_at: 1790784000000, status: "partial", sent_count: 10, failed_count: 1, deliveries: [{ _id: "delivery", channel: "email", status: "failed", recipient_email: "correoextensodepruebapararequisiciones@proveedordematerialesdeconstruccion.example", error: "Error simulado" }] }];
let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = () => { revision++; listeners.forEach((listener) => listener()); };
const state = window as unknown as { recordedMutations: { name: string; args: Record<string, unknown> }[]; holdReview: boolean; releaseReview?: () => void; holdStatus: boolean; releaseStatus?: () => void; failStatus: boolean };
state.recordedMutations = [];

export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: unknown) {
    useSyncExternalStore(subscribe, () => revision);
    if (args === "skip") return undefined;
    switch (getFunctionName(reference)) {
        case "desarrollos:getById": return { _id: "project", nombre: "Proyecto de construcción " + longName };
        case "requisiciones:getByProyecto": return params.has("loading") ? undefined : params.has("empty") ? [] : requisiciones;
        case "users:getCurrentUser": return { _id: "current", name: "Usuario de prueba", role: params.get("role") || "admin" };
        case "proveedores:getAll": return [provider];
        case "requisicion_history:getUnreadRequisiciones": return { pending: 12 };
        case "requisiciones:getEmailRecipients": return [{ _id: "recipient", email: "prueba@example.test" }];
        case "requisiciones:getNotificationEventsByProyecto": return events;
        default: throw new Error(`Consulta sin simular: ${getFunctionName(reference)}`);
    }
}

export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
    return async (args: Record<string, unknown>) => {
        const name = getFunctionName(reference);
        state.recordedMutations.push({ name, args });
        if (["requisiciones:updateStatus", "requisiciones:updateStatusEntrega"].includes(name)) {
            if (state.holdStatus) await new Promise<void>((resolve) => { state.releaseStatus = resolve; });
            if (state.failStatus) throw new Error("Fallo simulado al guardar el estado");
            const previous = requisiciones.find(req => req._id === args.id);
            const changed = name.endsWith("updateStatus") ? previous?.status !== args.status : previous?.status_entrega !== args.status_entrega;
            requisiciones = requisiciones.map(req => req._id !== args.id ? req : name.endsWith("updateStatus")
                ? { ...req, status: args.status as string }
                : { ...req, status_entrega: args.status_entrega as string });
            publish();
            return { success: true, changed };
        }
        if (name === "requisiciones:reviewSingleItem") {
            if (state.holdReview) await new Promise<void>((resolve) => { state.releaseReview = resolve; });
            requisiciones = requisiciones.map((req) => ({ ...req, items: req.items.map((item) => item._id === args.item_id ? { ...item, status_revision: args.status_revision as string, cantidad_aprobada: args.cantidad_aprobada as number } : item) }));
            publish();
            return { allReviewed: false };
        }
        if (name === "requisiciones:deleteRequisicion") { requisiciones = requisiciones.filter((req) => req._id !== args.id); publish(); }
        if (name.includes("UploadUrl")) return "/mock-upload";
        return {};
    };
}

export function useAction(reference: Parameters<typeof getFunctionName>[0]) {
    return async (args: Record<string, unknown>) => { state.recordedMutations.push({ name: getFunctionName(reference), args }); return { sent: 1, failed: 0 }; };
}
