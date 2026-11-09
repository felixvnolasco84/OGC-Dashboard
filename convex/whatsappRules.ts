import { getRequisicionNotificationConfig, type RequisicionNotificationType } from "../src/lib/requisicionNotificationMatrix";

export const WHATSAPP_TYPES = ["created", "reviewed", "onsite_payment_requested", "payment", "delivery"] as const;
export type WhatsappType = typeof WHATSAPP_TYPES[number];
export const WHATSAPP_RETRY_DELAYS = [60_000, 300_000, 900_000];
export const WHATSAPP_CLAIM_TIMEOUT = 10 * 60_000;
export const WHATSAPP_RECEIPT_TTL = 7 * 24 * 60 * 60_000;
export const WHATSAPP_TEMPLATE_NAMES: Record<WhatsappType, string> = {
  created: "ogc_requisicion_creada_v1",
  reviewed: "ogc_requisicion_revisada_v1",
  onsite_payment_requested: "ogc_requisicion_pago_obra_v1",
  payment: "ogc_requisicion_pagada_v1",
  delivery: "ogc_requisicion_entrega_v1",
};

export function isWhatsappType(type: string): type is WhatsappType {
  return (WHATSAPP_TYPES as readonly string[]).includes(type);
}

export function normalizeWhatsappPhone(value: string): string {
  let phone = value.trim().replace(/[\s().-]/g, "");
  // WhatsApp can report Mexican wa_ids with the legacy mobile prefix 1.
  // Keep one canonical +52 + 10-digit identity for contacts, receipts and BAJA.
  if (/^\+521\d{10}$/.test(phone)) phone = `+52${phone.slice(4)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Ingresa el teléfono internacional con + y código de país, por ejemplo +525512345678.");
  if (phone.startsWith("+52") && !/^\+52\d{10}$/.test(phone)) throw new Error("Los números de México deben incluir +52 y 10 dígitos.");
  return phone;
}

export function whatsappAudience(args: {
  type: RequisicionNotificationType; userId: string; actorId: string; requesterId: string;
  role: string; invitationStatus?: string; hasProjectAccess: boolean;
}) {
  if (args.userId === args.actorId || args.invitationStatus === "pending" || !args.hasProjectAccess) return false;
  return getRequisicionNotificationConfig(args.type).audience.some(audience =>
    audience === "requester" ? args.userId === args.requesterId :
    audience === "project_admins" ? args.role === "admin" :
    audience === "warehouse_team" ? args.role === "almacenista" : args.role === "finance",
  );
}

export function whatsappContactProblem(user: {
  whatsapp_phone?: string; whatsapp_enabled?: boolean; whatsapp_consent_at?: number;
  whatsapp_consent_by?: string; whatsapp_opted_out_at?: number;
}) {
  if (!user.whatsapp_phone) return "Sin teléfono de WhatsApp";
  try { normalizeWhatsappPhone(user.whatsapp_phone); } catch { return "Teléfono de WhatsApp inválido"; }
  if (!user.whatsapp_enabled) return "WhatsApp deshabilitado";
  if (!user.whatsapp_consent_at || !user.whatsapp_consent_by || (user.whatsapp_opted_out_at ?? 0) >= user.whatsapp_consent_at) return "Sin autorización vigente";
  return null;
}

const progress: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3 };
export function whatsappReceiptStatus(current: string, incoming: string): string {
  if (incoming === "failed") return ["delivered", "read"].includes(current) ? current : "failed";
  // A delivery/read receipt is stronger evidence than a preceding failure.
  if (current === "failed" && !["delivered", "read"].includes(incoming)) return current;
  return (progress[incoming] ?? -1) > (progress[current] ?? -1) ? incoming : current;
}

export function summarizeWhatsapp(statuses: string[]) {
  const sent = statuses.filter(s => ["accepted", "sent", "delivered", "read"].includes(s)).length;
  const failed = statuses.filter(s => s === "failed").length;
  const active = statuses.filter(s => s !== "skipped");
  const status = !active.length ? "no_recipients" : active.includes("unknown") ? "needs_review" :
    active.some(s => ["pending", "queued", "sending"].includes(s)) ? "pending" :
    failed ? sent ? "partial" : "failed" :
    active.every(s => s === "read") ? "read" :
    active.every(s => ["delivered", "read"].includes(s)) ? "delivered" : "accepted";
  return { status, sent_count: sent, failed_count: failed };
}

export function whatsappResultLabel(type: WhatsappType, requisicion: { status_revision?: string; status_entrega?: string }) {
  if (type === "reviewed") return requisicion.status_revision || "Revisada";
  if (type === "delivery") return requisicion.status_entrega || "Recepción actualizada";
  return getRequisicionNotificationConfig(type).label;
}

export function isWhatsappCallbackAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const received = header.slice(7);
  let difference = received.length ^ secret.length;
  for (let index = 0; index < secret.length; index++) difference |= secret.charCodeAt(index) ^ (received.charCodeAt(index) || 0);
  return difference === 0;
}
