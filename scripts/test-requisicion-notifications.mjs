import assert from "node:assert/strict";
import { renderRequisicionEmail } from "../convex/requisicionEmailTemplates.ts";
import {
  REQUISICION_NOTIFICATION_MATRIX,
  countUnreadRequisitionNotifications,
  isValidRemissionPhoto,
  notificationForStatusTransition,
  requisitionDetailUrl,
  shouldNotifyRequisitionUser,
  validateOnsitePaymentRequest,
} from "../src/lib/requisicionNotificationMatrix.ts";

const types = new Set(REQUISICION_NOTIFICATION_MATRIX.map(item => item.type));
for (const required of ["created", "reviewed", "assigned", "onsite_payment_requested", "payment", "delivery"]) {
  assert(types.has(required), `Missing notification event: ${required}`);
}

const receives = (type, role, userId, overrides = {}) => shouldNotifyRequisitionUser({
  type, role, userId, actorId: "actor", requesterId: "requester", email: `${userId}@ogc.mx`,
  hasProjectAccess: true, ...overrides,
});

assert(receives("created", "admin", "admin"));
assert(receives("created", "finance", "finance"));
assert(!receives("created", "user", "requester"));
assert(receives("reviewed", "user", "requester"));
assert(!receives("reviewed", "finance", "finance"));
assert(receives("assigned", "finance", "finance"));
assert(receives("assigned", "user", "requester"));
assert(receives("onsite_payment_requested", "finance", "finance"));
assert(receives("onsite_payment_requested", "admin", "admin"));
assert(!receives("onsite_payment_requested", "user", "requester"));
assert(receives("payment", "user", "requester"));
assert(!receives("payment", "finance", "finance"));
assert(receives("delivery", "finance", "finance"));
assert(receives("delivery", "user", "requester"));
assert(!receives("delivery", "admin", "actor"));
assert(!receives("created", "admin", "admin", { hasProjectAccess: false }));
assert(!receives("created", "admin", "admin", { invitationStatus: "pending" }));
assert(!receives("created", "admin", "admin", { email: "" }));

const validRequest = { statusRevision: "Aprobada", status: "En proceso", amount: 2500, reason: "  Compra urgente  " };
assert.equal(validateOnsitePaymentRequest(validRequest), "Compra urgente");
assert.throws(() => validateOnsitePaymentRequest({ ...validRequest, statusRevision: "Pendiente de revisión" }));
assert.throws(() => validateOnsitePaymentRequest({ ...validRequest, status: "Pagado" }));
assert.throws(() => validateOnsitePaymentRequest({ ...validRequest, paymentState: "pendiente" }));
assert.throws(() => validateOnsitePaymentRequest({ ...validRequest, amount: 0 }));
assert.throws(() => validateOnsitePaymentRequest({ ...validRequest, amount: 12.345 }));
assert.throws(() => validateOnsitePaymentRequest({ ...validRequest, reason: " " }));
assert(isValidRemissionPhoto({ type: "image/jpeg", size: 2_000_000 }));
assert(!isValidRemissionPhoto({ type: "application/pdf", size: 2_000_000 }));
assert(!isValidRemissionPhoto({ type: "image/png", size: 11_000_000 }));
assert.deepEqual(countUnreadRequisitionNotifications([
  { requisicion_id: "req-a", channel: "in_app" },
  { requisicion_id: "req-a", channel: "in_app", read_at: 100 },
  { requisicion_id: "req-a", channel: "email" },
  { requisicion_id: "req-b", channel: "in_app" },
]), { "req-a": 1, "req-b": 1 });
assert.equal(notificationForStatusTransition("payment", "En proceso", "Pagado"), "payment");
assert.equal(notificationForStatusTransition("payment", "Pagado", "Pagado"), null);
assert.equal(notificationForStatusTransition("delivery", "Pendiente", "Parcial"), "delivery");
assert.equal(notificationForStatusTransition("delivery", "Parcial", "Completo"), "delivery");
assert.equal(notificationForStatusTransition("delivery", "Completo", "Pendiente"), null);
assert.equal(notificationForStatusTransition("review", "Pendiente de revisión", "Aprobada"), "reviewed");
assert.equal(notificationForStatusTransition("review", "Aprobada", "Aprobada"), null);
assert.equal(requisitionDetailUrl("https://ogc.mx/", "project-a", "req-a"), "https://ogc.mx/proyecto/project-a/requisiciones?requisicion=req-a");

const emailHtml = renderRequisicionEmail({
  actorName: "Ana <Compras>",
  actionLabel: "solicitó un pago en obra",
  projectName: "Proyecto Norte",
  requisicionTitle: "Acero & cemento",
  statusLabel: "Aprobada",
  message: "Se requiere el pago en sitio.",
  ctaUrl: "https://dashboard.ogc.mx/proyecto/project-a/requisiciones?requisicion=req-a",
  logoUrl: "https://dashboard.ogc.mx/OGC-LOGO.svg",
  occurredAt: Date.parse("2026-09-28T12:00:00Z"),
});
for (const color of ["#FAFAFA", "#716F6D", "#1D2436", "#E5E3E1", "#EEEDEB"]) {
  assert(emailHtml.includes(color), `Missing shared task email color ${color}`);
}
assert(emailHtml.includes("OGC-LOGO.svg"));
assert(emailHtml.includes("DETALLE"));
assert(emailHtml.includes("Ver requisición"));
assert(emailHtml.includes("Acero &amp; cemento"));
assert(emailHtml.includes("Ana &lt;Compras&gt;"));
assert(!emailHtml.includes("Ana <Compras>"));
assert(!emailHtml.includes("#0073ea"));
assert(!emailHtml.includes("#50AC66"));
assert(emailHtml.includes("?requisicion=req-a"));
console.log("Requisition notification rules passed");
