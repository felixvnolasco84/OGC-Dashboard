import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { EditFields, PaymentEditContext, PaymentEditDraft } from "../../convex/paymentEdit";

export const editableFields = ["concepto_adicional", "proveedor_id", "payment_account_id", "fecha", "tipo_pago", "moneda", "tipo_cambio", "status", "categoria",
  "banco", "tarjeta", "numero_cuenta", "clabe", "numero_transferencia", "codigo_referencia", "factura", "comprobante"] as const;
export type EditField = typeof editableFields[number];
export type EditForm = Record<EditField, string>;
export function editForm(transaction: Doc<"transacciones">): EditForm {
  return Object.fromEntries(editableFields.map(key => [key, key === "fecha" ? dateInput(transaction.fecha) : String(transaction[key] ?? "")])) as EditForm;
}
export function dateInput(value: string) {
  const local = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return local ? `${local[3]}-${local[2]}-${local[1]}` : value;
}
export function buildEditDraft(context: PaymentEditContext, form: EditForm, amounts: Record<string, string>, paymentId?: Id<"pagos">): PaymentEditDraft {
  const seed = editForm(context.transaction);
  const fields: EditFields = {};
  for (const key of editableFields) {
    if (paymentId && key !== "concepto_adicional") continue;
    if (form[key] === seed[key]) continue;
    const value = key === "concepto_adicional" ? form[key].trim() : key === "tipo_pago" || key === "categoria" ? form[key].toUpperCase() : form[key];
    if (key === "concepto_adicional" && value === seed[key]) continue;
    Object.assign(fields, { [key]: key === "proveedor_id" || key === "payment_account_id" ? value || null : value });
  }
  const edits: PaymentEditDraft["amounts"] = [];
  for (const [id, raw] of Object.entries(amounts)) {
    if (paymentId && id !== paymentId) throw new Error("Sólo puedes editar el concepto seleccionado.");
    const item = context.lineItems.find(p => p._id === id);
    if (!item) throw new Error("Un concepto del borrador ya no existe. Descarta ese cambio antes de continuar.");
    if (!raw.trim() || !/^-?\d+(?:\.\d{0,2})?$/.test(raw.trim()) || !Number.isFinite(Number(raw))) {
      throw new Error("Completa los montos con hasta dos decimales; puedes usar cero o cantidades negativas.");
    }
    const monto = Number(raw);
    if (monto !== item.monto) edits.push({ id: item._id, monto });
  }
  return { id: context.transaction._id, fields, amounts: edits };
}

export function rebaseEditForm(previous: PaymentEditContext, current: PaymentEditContext, form: EditForm) {
  const old = editForm(previous.transaction), fresh = editForm(current.transaction);
  for (const key of editableFields) if (form[key] !== old[key]) fresh[key] = form[key];
  return fresh;
}
