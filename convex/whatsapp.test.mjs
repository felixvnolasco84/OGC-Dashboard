import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { recordWhatsappNotification } from "./whatsapp";
import { normalizeWhatsappPhone, whatsappAudience, WHATSAPP_TYPES } from "./whatsappRules";
import { formatWhatsappRequisition } from "./whatsappMessageFormat";

describe("shared WhatsApp message formatting", () => {
  const state = { reference: "LH-REQ-0142", projectName: "Larena Torre H", classification: "Albañilería — Cementantes/Agregados/Otros", requesterName: "Yaneth Cosío", requestedDate: "26/10/2026", review: "Aprobada", payment: "En proceso", delivery: "Pendiente", url: "https://dashboard.example.test/req/142" };
  it("formats the requested layout with the original requester/date and independent states", () => {
    expect(formatWhatsappRequisition(state)).toEqual(["LH-REQ-0142", "Larena Torre H", state.classification, "Yaneth Cosío · 26/10", "Aprobada", "Pendiente", "Pendiente", "Administración libera pago", state.url]);
    const deliveredUnpaid = formatWhatsappRequisition({ ...state, delivery: "Completo", receivedBy: "Ana" });
    expect(deliveredUnpaid[5]).toBe("Pendiente");
    expect(deliveredUnpaid[6]).toBe("Recibido por Ana");
    expect(deliveredUnpaid[7]).toBe("Administración libera pago");
  });
  it("shows confirmed amounts and receivers, without inventing missing historical data", () => {
    const paid = { ...state, payment: "Pagado", paidTo: "Ferretería Santana", paidAmount: 48300 };
    expect(formatWhatsappRequisition(paid)[5]).toBe("Pagado a Ferretería Santana · $48,300");
    expect(formatWhatsappRequisition({ ...paid, delivery: "Parcial", receivedBy: "Ana" }).slice(6, 8)).toEqual(["Parcial · Recibido por Ana", "Obra registra la recepción de los materiales restantes"]);
    expect(formatWhatsappRequisition({ ...paid, delivery: "Completo", receivedBy: "Ana" }).slice(6, 8)).toEqual(["Recibido por Ana", "Proceso completo"]);
    expect(formatWhatsappRequisition({ ...state, payment: "Pagado", delivery: "Completo" }).slice(5, 7)).toEqual(["Pagado", "Recibido"]);
    expect(formatWhatsappRequisition({ ...paid, paidAmount: 0 })[5]).toContain("$0");
  });
  it.each([
    [{ review: "Pendiente de revisión" }, "Administración revisa la requisición"],
    [{ review: "Rechazada" }, "Solicitante revisa los comentarios"],
    [{ review: "Parcialmente Aprobada" }, "Consulta los materiales aprobados y los comentarios"],
    [{ onsitePaymentPending: true }, "Administración atiende la solicitud de pago en obra"],
    [{ payment: "Cancelado" }, "Consulta el detalle de la cancelación"],
    [{ payment: "Desconocido" }, "Consulta el detalle de la requisición"],
  ])("uses the real next step for %j", (overrides, next) => {
    expect(formatWhatsappRequisition({ ...state, ...overrides })[7]).toBe(next);
  });
  it("normalizes single-line variables without changing the deep link", () => {
    const result = formatWhatsappRequisition({ ...state, requesterName: "Ana\n*Compras*", requestedDate: "2026-10-26" });
    expect(result[3]).toBe("Ana Compras · 26/10");
    expect(result[8]).toBe(state.url);
  });
});

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T18:00:00Z"));
  for (const [key, value] of Object.entries({ APP_URL: "https://dashboard.example.test", WHATSAPP_SENDER_ID: "sender", WHATSAPP_CALLBACK_SECRET: "test-callback-secret", MAKE_WHATSAPP_WEBHOOK_URL: "https://hook.us2.make.com/test", MAKE_WHATSAPP_API_KEY: "test-webhook-secret" })) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real transport prohibited"); }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function fixture(enabled = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Obra", descripcion: "", image: "", organization_id: "org", whatsapp_requisiciones_enabled: enabled });
    const otherProject = await ctx.db.insert("desarrollos", { nombre: "Otra", descripcion: "", image: "", organization_id: "other" });
    const users = {};
    for (const [index, role] of ["admin", "finance", "user", "almacenista", "contratista", "viewer", "outsider"].entries()) {
      users[role] = await ctx.db.insert("users", {
        clerkId: role, email: `${role}@example.test`, name: role, role: role === "outsider" ? "admin" : role,
        organization_id: role === "outsider" ? "other" : "org", allowed_desarrollos: role === "outsider" ? [otherProject] : [project], created_at: 1,
        whatsapp_phone: `+52551234567${index}`, whatsapp_enabled: true, whatsapp_consent_at: Date.now() - 10000,
      });
    }
    for (const id of Object.values(users)) await ctx.db.patch(id, { whatsapp_consent_by: users.admin });
    const common = { proyecto: project, nombre: "OBRA", familia: "", sub_partida: "", nivel: 1, unidad: "piezas", cantidad: 10, precio_unitario: 100, presupuesto_original: 1000, presupuesto_aprobado: 1000, pagado: 0, archivo_origen: "" };
    const root = await ctx.db.insert("partidas", common);
    await ctx.db.insert("partidas", { ...common, nivel: 2, partida_nombre: "OBRA", familia: "MATERIALES" });
    await ctx.db.insert("partidas", { ...common, nivel: 3, partida_nombre: "OBRA", familia: "MATERIALES", sub_partida: "CEMENTO" });
    return { project, otherProject, users, root };
  });
  const as = role => t.withIdentity({ subject: role });
  const patch = (id, fields) => t.run(ctx => ctx.db.patch(id, fields));
  const get = id => t.run(ctx => ctx.db.get(id));
  const rows = table => t.run(ctx => ctx.db.query(table).collect());
  const create = () => as("user").mutation(api.requisiciones.create, { proyecto: ids.project, tipo: "material", solicitante_id: ids.users.user, solicitante_nombre: "user", fecha_solicitud: "04/11/2026", items: [{ partida_id: ids.root, familia: "MATERIALES", sub_partida: "CEMENTO", cantidad: 10, unidad: "piezas", monto: 1000 }] });
  const deliveries = async () => (await rows("notification_deliveries")).filter(d => d.channel === "whatsapp");
  const first = async () => (await deliveries()).find(d => d.status === "pending");
  const claim = async (delivery = undefined) => {
    delivery ??= await first();
    await t.mutation(internal.whatsapp.beginDispatch, { delivery_id: delivery._id });
    return t.mutation(internal.whatsapp.claim, { delivery_id: delivery._id, attempt_token: `token-${delivery._id}` });
  };
  const event = input => t.mutation(internal.whatsapp.receiveEvent, { event: { sender_id: "sender", ...input } });
  const accepted = (payload, message = "wamid.1") => event({ kind: "accepted", delivery_id: payload.delivery_id, attempt_token: payload.attempt_token, provider_message_id: message });
  const status = (payload, value, message = "wamid.1") => event({ kind: "status", provider_message_id: message, phone: payload.phone, status: value, occurred_at: Date.now() });
  return { t, ids, as, patch, get, rows, create, deliveries, first, claim, event, accepted, status };
}

describe("WhatsApp contacts, project activation and transactional event creation", () => {
  it("persists explicitly confirmed payee, amount and receiver for the formatted claim", async () => {
    const f = await fixture(), id = await f.create();
    const req = await f.as("user").query(api.requisiciones.getById, { id });
    await f.as("finance").mutation(api.requisiciones.reviewRequisicion, { id, reviewer_id: f.ids.users.finance, reviewer_name: "finance", items: req.items.map(item => ({ item_id: item._id, status_revision: "aprobado", cantidad_aprobada: 10 })) });
    const payment = { id, status: "Pagado", changed_by_id: f.ids.users.finance, changed_by_name: "finance", pago_confirmado: { beneficiario: "  Ferretería Ejemplo  ", importe: 48300 } };
    await expect(f.as("finance").mutation(api.requisiciones.updateStatus, { ...payment, pago_confirmado: { beneficiario: "Proveedor", importe: 12.345 } })).rejects.toThrow("importe pagado válido");
    await f.as("finance").mutation(api.requisiciones.updateStatus, payment);
    await f.as("admin").mutation(api.requisiciones.updateStatusEntrega, { id, status_entrega: "Parcial", changed_by_id: f.ids.users.admin, changed_by_name: "admin", recibido_por_nombre: "  Persona receptora  " });
    expect((await f.get(id)).pago_confirmado).toEqual({ beneficiario: "Ferretería Ejemplo", importe: 48300 });
    expect((await f.get(id)).recibido_por_nombre).toBe("Persona receptora");
    const payload = await f.claim();
    expect(payload.formatted_parameters.slice(5, 8)).toEqual(["Pagado a Ferretería Ejemplo · $48,300", "Parcial · Recibido por Persona receptora", "Obra registra la recepción de los materiales restantes"]);
    expect(payload.formatted_parameters[3]).toBe("user · 04/11");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("is disabled by default and leaves app/email intact", async () => {
    const f = await fixture(false); await f.create();
    expect(await f.deliveries()).toHaveLength(0);
    expect(await f.rows("notification_events")).toHaveLength(1);
    await f.as("admin").mutation(api.whatsapp.setProjectEnabled, { proyecto: f.ids.project, enabled: true });
    expect(await f.deliveries()).toHaveLength(0);
    await f.create(); expect(await f.deliveries()).toHaveLength(2);
  });
  it("covers all five real requisition transitions with the existing audiences", async () => {
    const f = await fixture(), id = await f.create();
    const req = await f.as("user").query(api.requisiciones.getById, { id });
    await f.as("finance").mutation(api.requisiciones.reviewRequisicion, { id, reviewer_id: f.ids.users.finance, reviewer_name: "finance", items: req.items.map(i => ({ item_id: i._id, status_revision: "aprobado", cantidad_aprobada: 10 })) });
    await f.as("user").mutation(api.requisiciones.requestOnsitePayment, { id, importe: 1000, motivo: "Compra" });
    await f.as("finance").mutation(api.requisiciones.updateStatus, { id, status: "Pagado", changed_by_id: f.ids.users.finance, changed_by_name: "finance" });
    await f.as("admin").mutation(api.requisiciones.updateStatusEntrega, { id, status_entrega: "Completo", changed_by_id: f.ids.users.admin, changed_by_name: "admin" });
    const events = (await f.rows("notification_events")).filter(e => e.channel === "whatsapp");
    expect(events.map(e => e.type)).toEqual([...WHATSAPP_TYPES]);
    const deliveries = await f.deliveries();
    for (const [type, audience] of Object.entries({ created: ["admin", "finance"], reviewed: ["user"], onsite_payment_requested: ["admin", "finance"], payment: ["admin", "user", "almacenista"], delivery: ["finance", "user"] })) {
      const event = events.find(e => e.type === type);
      expect(deliveries.filter(d => d.notification_event_id === event._id).map(d => d.recipient_name).sort()).toEqual(audience.sort());
      expect(event.source_history_id).toBeTruthy();
    }
    expect(events.find(e => e.type === "reviewed").whatsapp_result).toBe("Aprobada");
    expect(events.find(e => e.type === "delivery").whatsapp_result).toBe("Completo");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("records missing contact/consent as skipped without blocking creation", async () => {
    const f = await fixture();
    await f.patch(f.ids.users.admin, { whatsapp_phone: undefined });
    await f.patch(f.ids.users.finance, { whatsapp_consent_at: undefined });
    await f.create();
    expect((await f.deliveries()).map(d => d.status)).toEqual(["skipped", "skipped"]);
    expect((await f.rows("notification_events")).find(e => e.channel === "whatsapp").status).toBe("no_recipients");
    expect((await f.rows("notification_deliveries")).filter(d => d.channel === "email")).toHaveLength(2);
  });
  it("deduplicates phones and recording the same history event", async () => {
    const f = await fixture();
    await f.patch(f.ids.users.finance, { whatsapp_phone: (await f.get(f.ids.users.admin)).whatsapp_phone });
    const id = await f.create();
    expect((await f.deliveries()).filter(d => d.status === "pending")).toHaveLength(1);
    await f.t.run(async ctx => {
      const req = await ctx.db.get(id), history = await ctx.db.query("requisicion_history").first();
      await recordWhatsappNotification(ctx, { requisicion: req, project: await ctx.db.get(f.ids.project), users: await ctx.db.query("users").collect(), actor: await ctx.db.get(f.ids.users.user), historyId: history._id, type: "created" });
    });
    expect(await f.deliveries()).toHaveLength(2);
  });
  it("does not send to another account sharing the actor's phone", async () => {
    const f = await fixture(); await f.patch(f.ids.users.admin, { whatsapp_phone: (await f.get(f.ids.users.user)).whatsapp_phone });
    await f.create(); expect((await f.deliveries()).find(d => d.recipient_name === "admin").status).toBe("skipped");
  });
  it("delivers WhatsApp independently of missing email addresses", async () => {
    const f = await fixture();
    await f.patch(f.ids.users.user, { email: "" }); await f.patch(f.ids.users.admin, { email: "" });
    await f.create();
    const delivery = (await f.deliveries()).find(d => d.recipient_name === "admin");
    expect(delivery.status).toBe("pending");
    expect(await f.claim(delivery)).toMatchObject({ send: true, phone: delivery.recipient_phone });
  });
  it("normalizes contacts, requires fresh consent on number change and records who authorized", async () => {
    const f = await fixture();
    await expect(f.as("admin").mutation(api.whatsapp.saveContact, { user_id: f.ids.users.user, phone: "+52 55 9999 8888", enabled: true, confirm_consent: false })).rejects.toThrow("autorización");
    await f.as("admin").mutation(api.whatsapp.saveContact, { user_id: f.ids.users.user, phone: "+52 55 9999 8888", enabled: true, confirm_consent: true });
    expect(await f.get(f.ids.users.user)).toMatchObject({ whatsapp_phone: "+525599998888", whatsapp_consent_by: f.ids.users.admin, whatsapp_consent_at: Date.now() });
    await f.as("admin").mutation(api.whatsapp.saveContact, { user_id: f.ids.users.user, phone: "+525511112222", enabled: false, confirm_consent: false });
    expect((await f.get(f.ids.users.user)).whatsapp_consent_at).toBeUndefined();
  });
  it("restricts contacts and activation by organization and role", async () => {
    const f = await fixture();
    await expect(f.as("finance").mutation(api.whatsapp.saveContact, { user_id: f.ids.users.user, phone: "", enabled: false, confirm_consent: false })).rejects.toThrow();
    await expect(f.as("admin").mutation(api.whatsapp.saveContact, { user_id: f.ids.users.outsider, phone: "", enabled: false, confirm_consent: false })).rejects.toThrow("organización");
    await expect(f.as("admin").mutation(api.whatsapp.setProjectEnabled, { proyecto: f.ids.otherProject, enabled: true })).rejects.toThrow();
    await expect(f.as("user").query(api.whatsapp.projectSettings, { proyecto: f.ids.project })).rejects.toThrow();
    vi.stubEnv("WHATSAPP_SENDER_ID", "");
    await expect(f.as("admin").mutation(api.whatsapp.setProjectEnabled, { proyecto: f.ids.project, enabled: true })).rejects.toThrow("Configura");
  });
});

describe("Claims, callbacks, safe retries and receipts", () => {
  it("sends only the delivery ID to an authenticated Make webhook and does not mark it sent", async () => {
    const f = await fixture(); await f.create(); const delivery = await f.first();
    fetch.mockResolvedValue(new Response("Accepted"));
    await f.t.action(internal.whatsapp.dispatch, { delivery_id: delivery._id });
    expect(fetch).toHaveBeenCalledWith("https://hook.us2.make.com/test", expect.objectContaining({ body: JSON.stringify({ delivery_id: delivery._id }), headers: expect.objectContaining({ "x-make-apikey": "test-webhook-secret" }) }));
    expect((await f.get(delivery._id)).status).toBe("queued");
  });
  it("claims once and supplies the approved template and authenticated dashboard link", async () => {
    const f = await fixture(); await f.create(); const payload = await f.claim();
    expect(payload).toMatchObject({ send: true, template: "ogc_requisicion_creada_v1", language: "es_MX", sender_id: "sender" });
    expect(payload.url).toContain("https://dashboard.example.test/proyecto/");
    expect(payload.url).toContain("?requisicion=");
    expect(payload.formatted_template).toBe("ogc_requisicion_estado_v2");
    expect(payload.formatted_parameters).toHaveLength(9);
    expect(payload.formatted_parameters.slice(2, 8)).toEqual(["OBRA — MATERIALES", "user · 04/11", "Pendiente", "Pendiente", "Pendiente", "Administración revisa la requisición"]);
    expect(payload.formatted_parameters[8]).toBe(payload.url);
    expect(await f.t.mutation(internal.whatsapp.claim, { delivery_id: payload.delivery_id, attempt_token: "duplicate" })).toEqual({ send: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["access", "contact", "project", "invitation", "phone", "actor_phone"])("revalidates %s immediately before sending", async change => {
    const f = await fixture(); await f.create(); const delivery = await f.first();
    if (change === "access") await f.patch(delivery.recipient_user_id, { role: "finance", allowed_desarrollos: [] });
    if (change === "contact") await f.patch(delivery.recipient_user_id, { whatsapp_enabled: false });
    if (change === "project") await f.patch(f.ids.project, { whatsapp_requisiciones_enabled: false });
    if (change === "invitation") await f.patch(delivery.recipient_user_id, { invitation_status: "pending" });
    if (change === "phone") await f.patch(delivery.recipient_user_id, { whatsapp_phone: "+525500000000" });
    if (change === "actor_phone") await f.patch(f.ids.users.user, { whatsapp_phone: delivery.recipient_phone });
    expect(await f.claim(delivery)).toEqual({ send: false });
    expect((await f.get(delivery._id)).status).toBe("skipped");
  });
  it("replays early receipts, keeps progress monotonic and does not confuse app reads", async () => {
    const f = await fixture(); await f.create(); const payload = await f.claim();
    await f.status(payload, "read"); await f.status(payload, "sent"); await f.status(payload, "delivered");
    await f.accepted(payload); await f.accepted(payload);
    expect(await f.get(payload.delivery_id)).toMatchObject({ status: "read", delivered_at: Date.now(), provider_read_at: Date.now() });
    await f.status(payload, "sent"); await f.status(payload, "failed");
    expect((await f.get(payload.delivery_id)).status).toBe("read");
    expect((await f.get(payload.delivery_id)).read_at).toBeUndefined();
    expect(await f.rows("whatsapp_receipts")).toHaveLength(0);
  });
  it("rejects another sender, recipient, delivery token and reuse of a message ID", async () => {
    const f = await fixture(); await f.create(); const payload = await f.claim();
    await expect(f.event({ kind: "accepted", sender_id: "other", delivery_id: payload.delivery_id, attempt_token: payload.attempt_token, provider_message_id: "wamid.1" })).rejects.toThrow("Emisor");
    await expect(f.accepted({ ...payload, attempt_token: "wrong" })).rejects.toThrow("Intento");
    await f.accepted(payload);
    await expect(f.status({ ...payload, phone: "+525500000000" }, "read")).rejects.toThrow("destinatario");
    const next = await f.claim(); await expect(f.accepted(next)).rejects.toThrow("ya utilizado");
    expect((await f.get(next.delivery_id)).status).toBe("sending");
  });
  it("retries only unclaimed transport failures at 1, 5 and 15 minutes", async () => {
    const f = await fixture(); await f.create(); const delivery = await f.first();
    for (const [index, delay] of [60000, 300000, 900000, undefined].entries()) {
      expect(await f.t.mutation(internal.whatsapp.beginDispatch, { delivery_id: delivery._id })).toBe(true);
      await f.t.mutation(internal.whatsapp.transportResult, { delivery_id: delivery._id, error: "HTTP 503", retryable: true });
      const row = await f.get(delivery._id);
      expect(row.attempt_count).toBe(index + 1);
      if (delay === undefined) expect(row.status).toBe("failed");
      else {
        expect(row.next_attempt_at).toBe(Date.now() + delay);
        expect(await f.t.mutation(internal.whatsapp.beginDispatch, { delivery_id: delivery._id })).toBe(false);
        vi.setSystemTime(Date.now() + delay);
      }
    }
  });
  it("does not retry an ambiguous claimed timeout; permits a late acceptance", async () => {
    const f = await fixture(); await f.create(); const payload = await f.claim();
    await f.t.mutation(internal.whatsapp.transportResult, { delivery_id: payload.delivery_id, error: "timeout", retryable: true });
    expect((await f.get(payload.delivery_id)).status).toBe("sending");
    await f.t.mutation(internal.whatsapp.watchdog, { delivery_id: payload.delivery_id, attempt_count: 1 });
    expect((await f.get(payload.delivery_id)).status).toBe("unknown");
    await f.event({ kind: "error", delivery_id: payload.delivery_id, attempt_token: payload.attempt_token, outcome: "rejected", retryable: true, error: "late" });
    expect((await f.get(payload.delivery_id)).status).toBe("unknown");
    await f.accepted(payload); expect((await f.get(payload.delivery_id)).status).toBe("accepted");
  });
  it("retries explicit temporary rejection once despite duplicated callbacks", async () => {
    const f = await fixture(); await f.create(); const payload = await f.claim();
    const error = { kind: "error", delivery_id: payload.delivery_id, attempt_token: payload.attempt_token, outcome: "rejected", retryable: true, error: "rate limit" };
    await f.event(error); const next = (await f.get(payload.delivery_id)).next_attempt_at;
    await f.event(error); expect((await f.get(payload.delivery_id)).next_attempt_at).toBe(next);
  });
  it("processes BAJA, skips queued messages and ignores old BAJA after renewed consent", async () => {
    const f = await fixture(); await f.create(); const delivery = await f.first();
    const stop = { kind: "inbound", phone: delivery.recipient_phone, text: " baja ", occurred_at: Date.now() };
    await f.event(stop); await f.event(stop);
    expect((await f.get(delivery.recipient_user_id)).whatsapp_enabled).toBe(false);
    expect(await f.claim(delivery)).toEqual({ send: false });
    vi.setSystemTime(Date.now() + 1000);
    await expect(f.as("admin").mutation(api.whatsapp.saveContact, { user_id: delivery.recipient_user_id, phone: delivery.recipient_phone, enabled: true, confirm_consent: false })).rejects.toThrow();
    await f.as("admin").mutation(api.whatsapp.saveContact, { user_id: delivery.recipient_user_id, phone: delivery.recipient_phone, enabled: true, confirm_consent: true });
    await f.event(stop); expect((await f.get(delivery.recipient_user_id)).whatsapp_enabled).toBe(true);
  });
  it("matches Mexican legacy wa_ids to stored contacts for receipts and BAJA", async () => {
    const f = await fixture(); await f.create(); const payload = await f.claim();
    await f.accepted(payload);
    const phone = payload.phone.replace("+52", "+521");
    await f.status({ ...payload, phone }, "delivered");
    expect((await f.get(payload.delivery_id)).status).toBe("delivered");
    await f.event({ kind: "inbound", phone, text: "BAJA", occurred_at: Date.now() });
    expect((await f.get((await f.get(payload.delivery_id)).recipient_user_id)).whatsapp_enabled).toBe(false);
  });
  it("reading the project in OGC never marks WhatsApp as read", async () => {
    const f = await fixture(); await f.create(); const payload = await f.claim();
    await f.accepted(payload); await f.status(payload, "sent");
    const delivery = await f.get(payload.delivery_id);
    await f.as(delivery.recipient_name).mutation(api.requisicion_history.markAsRead, { user_id: delivery.recipient_user_id, proyecto: f.ids.project });
    expect(await f.get(delivery._id)).toMatchObject({ status: "sent" });
    expect((await f.get(delivery._id)).read_at).toBeUndefined();
    expect((await f.get(delivery._id)).provider_read_at).toBeUndefined();
  });
  it("authenticates and validates both HTTP endpoints without invoking real transport", async () => {
    const f = await fixture(); await f.create(); const delivery = await f.first();
    for (const path of ["claim", "events"]) {
      expect((await f.t.fetch(`/integrations/whatsapp/${path}`, { method: "POST", body: "{}" })).status).toBe(401);
      expect((await f.t.fetch(`/integrations/whatsapp/${path}`, { method: "POST", headers: { Authorization: "Bearer wrong" }, body: "{}" })).status).toBe(401);
    }
    await f.t.mutation(internal.whatsapp.beginDispatch, { delivery_id: delivery._id });
    const response = await f.t.fetch("/integrations/whatsapp/claim", { method: "POST", headers: { Authorization: "Bearer test-callback-secret" }, body: JSON.stringify({ delivery_id: delivery._id }) });
    expect(response.status).toBe(200); const payload = await response.json(); expect(payload.send).toBe(true);
    const accepted = await f.t.fetch("/integrations/whatsapp/events", { method: "POST", headers: { Authorization: "Bearer test-callback-secret" }, body: JSON.stringify({ kind: "accepted", sender_id: "sender", delivery_id: payload.delivery_id, attempt_token: payload.attempt_token, provider_message_id: "wamid.http" }) });
    expect(accepted.status).toBe(200);
    expect((await f.t.fetch("/integrations/whatsapp/events", { method: "POST", headers: { Authorization: "Bearer test-callback-secret" }, body: JSON.stringify({ bad: true }) })).status).toBe(400);
    expect((await f.t.fetch("/integrations/whatsapp/claim", { method: "POST", headers: { Authorization: "Bearer test-callback-secret" }, body: JSON.stringify({ delivery_id: "x".repeat(17000) }) })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("expires unmatched receipts", async () => {
    const f = await fixture(); await f.create(); const payload = await f.claim(); await f.status(payload, "sent");
    vi.setSystemTime(Date.now() + 8 * 86400000);
    await f.t.mutation(internal.whatsapp.cleanupReceipts, {}); expect(await f.rows("whatsapp_receipts")).toHaveLength(0);
  });
});

describe("Phone and audience rules", () => {
  it.each(["5551234567", "+0123456789", "+52abcd123456", "+1234567890123456", "+52", ""])("rejects invalid number %s", phone => expect(() => normalizeWhatsappPhone(phone)).toThrow());
  it("accepts an explicitly international number", () => expect(normalizeWhatsappPhone(" +52 (55) 1234-5678 ")).toBe("+525512345678"));
  it("canonicalizes legacy Mexican WhatsApp IDs without changing the telephone identity", () => expect(normalizeWhatsappPhone("+5215512345678")).toBe("+525512345678"));
  it("does not require an email address for the WhatsApp audience", () => expect(whatsappAudience({ type: "created", userId: "a", actorId: "b", requesterId: "b", role: "admin", hasProjectAccess: true })).toBe(true));
});
