import assert from "node:assert/strict";
import {
  allocateInvoiceAmount,
  buildInvoiceReconciliation,
  invoiceModelOutputSchema,
  invoiceAllocationValidationError,
  invoiceDocumentPairKey,
  inferInvoiceDateBasis,
  inferInvoiceGroupBy,
  isCurrentInvoiceRunState,
  isInvoiceAnalysisIntent,
  normalizeInvoiceCurrency,
  normalizeInvoiceText,
  normalizeInvoiceUuid,
  parseInvoiceIssuedDate,
  parseCfdiXml,
  resolveInvoiceAggregateSearch,
} from "../convex/invoiceRules.ts";
import {
  markInvoiceStale,
  transactionChangeInvalidatesInvoice,
} from "../convex/invoiceIntegrity.ts";

assert.equal(normalizeInvoiceText("  DISCO-de Córte  "), "disco de corte");
assert.equal(normalizeInvoiceUuid("abc-123 xyz"), "ABC123XYZ");
assert.equal(normalizeInvoiceCurrency("mxn"), "MXN");
assert.equal(normalizeInvoiceCurrency("pesos"), "SIN_MONEDA");
assert.equal(isInvoiceAnalysisIntent("¿Cuánto gastamos en herramienta menor?"), true);
assert.equal(isInvoiceAnalysisIntent("Lista los activos potenciales comprados"), true);
assert.equal(isInvoiceAnalysisIntent("¿Las notas de crédito redujeron el gasto?"), true);
assert.equal(isInvoiceAnalysisIntent("Revisa los complementos de pago"), true);
assert.equal(isInvoiceAnalysisIntent("Dame el avance físico"), false);
assert.equal(inferInvoiceGroupBy("Desglosa herramienta menor por categoría"), "category");
assert.equal(inferInvoiceGroupBy("¿Qué taladros compramos?"), "item");
assert.equal(inferInvoiceGroupBy("Compara las facturas de los proyectos"), "project");
assert.equal(inferInvoiceDateBasis("Facturas emitidas durante agosto"), "invoice");
assert.equal(inferInvoiceDateBasis("¿Cuánto pagamos durante agosto?"), "payment");
assert.equal(parseInvoiceIssuedDate("2026-08-25T10:30:00"), "2026-08-25");
assert.equal(parseInvoiceIssuedDate("25/08/2026"), "2026-08-25");
assert.equal(parseInvoiceIssuedDate("31/02/2026"), undefined);

const sharedUuid = "11111111-2222-3333-4444-555555555555";
assert.equal(invoiceDocumentPairKey(`CFDI_${sharedUuid}.xml`), invoiceDocumentPairKey(`Factura ${sharedUuid}.pdf`));
assert.equal(invoiceDocumentPairKey("FACTURA-A-102.xml"), invoiceDocumentPairKey("A-102 factura.pdf"));
assert.notEqual(invoiceDocumentPairKey("A-102.xml"), invoiceDocumentPairKey("A-103.pdf"));

const cfdi = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Folio="A-102" Fecha="2026-08-24T10:30:00" Moneda="MXN" SubTotal="1500.00" Total="1740.00" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="FERRETERIA DEMO" />
  <cfdi:Receptor Rfc="BBB010101BBB" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="27112700" Cantidad="1" Unidad="PIEZA" Descripcion="Taladro percutor" ValorUnitario="1200" Importe="1200">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="192" /></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
    <cfdi:Concepto ClaveProdServ="27112800" Cantidad="10" Unidad="PIEZA" Descripcion="Disco de corte" ValorUnitario="30" Importe="300">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="48" /></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="11111111-2222-3333-4444-555555555555" />
</cfdi:Comprobante>`;
const parsed = parseCfdiXml(cfdi);
assert.equal(parsed.invoice_type, "invoice");
assert.equal(parsed.currency, "MXN");
assert.equal(parsed.total, 1740);
assert.equal(parsed.items.length, 2);
assert.equal(parsed.items[0].description, "Taladro percutor");
assert.equal(parsed.items[0].gross_amount, 1392);
assert.equal(parsed.items[1].tax_amount, 48);
assert.deepEqual(parsed.warnings, []);

const creditNote = parseCfdiXml(cfdi.replace('TipoDeComprobante="I"', 'TipoDeComprobante="E"'));
assert.equal(creditNote.invoice_type, "credit_note");
const paymentComplement = parseCfdiXml(cfdi.replace('TipoDeComprobante="I"', 'TipoDeComprobante="P"'));
assert.equal(paymentComplement.invoice_type, "payment_complement");
assert.throws(() => parseCfdiXml(`<!DOCTYPE x [<!ENTITY leaked SYSTEM "file:///etc/passwd">]>${cfdi}`), /DTD|entidades externas/);
assert.throws(() => parseCfdiXml("<xml />"), /Comprobante/);

const allocated = allocateInvoiceAmount(100, [{ weight: 1 }, { weight: 1 }, { weight: 1 }]);
assert.deepEqual(allocated, [33.34, 33.33, 33.33]);
assert.equal(allocated.reduce((sum, value) => sum + value, 0), 100);
const negative = allocateInvoiceAmount(-10, [{ weight: 2 }, { weight: 1 }]);
assert.equal(Number(negative.reduce((sum, value) => sum + value, 0).toFixed(2)), -10);
assert.deepEqual(allocateInvoiceAmount(20, []), []);

assert.equal(invoiceAllocationValidationError("invoice", 100), undefined);
assert.match(invoiceAllocationValidationError("invoice", -100), /nota de crédito/);
assert.equal(invoiceAllocationValidationError("credit_note", -100), undefined);
assert.match(invoiceAllocationValidationError("credit_note", 100), /negativo/);
assert.match(invoiceAllocationValidationError("payment_complement", 100), /complementos de pago/);
assert.match(invoiceAllocationValidationError("invoice", 10.001), /dos decimales/);
assert.match(invoiceAllocationValidationError("invoice", 1_000_000_000_001), /límite/);

assert.deepEqual(buildInvoiceReconciliation({
  invoice_type: "invoice",
  invoice_total: 100,
  invoice_currency: "MXN",
  allocations: [{ amount: 100, currency: "MXN", transaction_total: 100 }],
}), {
  status: "matched",
  exception_codes: [],
  allocated_total: 100,
  invoice_total: 100,
  currency: "MXN",
  variance: 0,
  allocation_count: 1,
});
const exceptionalReconciliation = buildInvoiceReconciliation({
  invoice_type: "unknown",
  invoice_total: 100,
  invoice_currency: "USD",
  allocations: [
    { amount: 90, currency: "MXN", transaction_total: 80, existing_approved_amount: 10 },
    { amount: 10, currency: "USD", transaction_total: 10 },
  ],
  has_unclassified_items: true,
});
assert.equal(exceptionalReconciliation.status, "exception");
assert.deepEqual(new Set(exceptionalReconciliation.exception_codes), new Set([
  "allocation_transaction_mismatch",
  "transaction_overallocated",
  "multiple_currencies",
  "unknown_document_type",
  "unclassified_items",
]));

const mixedInvoiceItems = [
  { label: "Taladro percutor", category: "tool", weight: 30 },
  { label: "Cemento gris", category: "material", weight: 70 },
];
const mixedAllocations = allocateInvoiceAmount(100, mixedInvoiceItems);
const toolTotal = mixedInvoiceItems.reduce(
  (sum, item, index) => sum + (item.category === "tool" ? mixedAllocations[index] : 0),
  0,
);
assert.equal(toolTotal, 30, "El filtro debe aplicarse después de prorratear todos los conceptos");

assert.deepEqual(
  resolveInvoiceAggregateSearch(
    "Desglosa las facturas de @Larena Torre I",
    ["Taladro percutor", "Cemento gris"],
    ["Larena Torre I"],
  ).status,
  "not_requested",
);
assert.equal(
  resolveInvoiceAggregateSearch("Necesito revisar el detalle de las facturas", ["Taladro percutor"]).status,
  "not_requested",
);
assert.deepEqual(
  resolveInvoiceAggregateSearch("¿Cuánto gastamos en taladros?", ["Taladro percutor", "Cemento gris"]).matching_indexes,
  [0],
);
assert.equal(
  resolveInvoiceAggregateSearch("Facturas de escalera telescópica", ["Taladro percutor", "Cemento gris"]).status,
  "not_found",
);

assert.equal(isCurrentInvoiceRunState({
  active_run_id: "run-new",
  run_id: "run-new",
  invoice_status: "extracting",
  run_status: "extracting",
  allowed_statuses: ["extracting"],
}), true);
assert.equal(isCurrentInvoiceRunState({
  active_run_id: "run-new",
  run_id: "run-old",
  invoice_status: "extracting",
  run_status: "extracting",
  allowed_statuses: ["extracting"],
}), false, "Una corrida anterior no puede completar sobre la factura activa");
assert.equal(isCurrentInvoiceRunState({
  active_run_id: "run-new",
  run_id: "run-new",
  invoice_status: "stale",
  run_status: "extracting",
  allowed_statuses: ["extracting"],
}), false, "Una fuente invalidada no puede completar su corrida");

const approvedTransaction = {
  proveedor_id: "provider-a",
  monto_total: 100,
  fecha: "25/08/2026",
  status: "Pagado",
  moneda: "MXN",
  tipo_cambio: "1",
};
assert.equal(transactionChangeInvalidatesInvoice(approvedTransaction, { banco: "No relevante" }), false);
assert.equal(transactionChangeInvalidatesInvoice(approvedTransaction, { monto_total: 101 }), true);
assert.equal(transactionChangeInvalidatesInvoice(approvedTransaction, { proveedor_id: "provider-b" }), true);
assert.equal(transactionChangeInvalidatesInvoice(approvedTransaction, { status: "Por pagar" }), true);

const state = new Map([
  ["invoice-1", { _id: "invoice-1", status: "approved", active_run_id: "run-1", revision: 4, updated_at: 1 }],
  ["run-1", { _id: "run-1", status: "approved", completed_at: 2 }],
]);
const fakeMutationCtx = {
  db: {
    get: async (id) => state.get(id) || null,
    patch: async (id, value) => state.set(id, { ...state.get(id), ...value }),
  },
};
assert.equal(await markInvoiceStale(fakeMutationCtx, "invoice-1"), true);
assert.equal(state.get("invoice-1").status, "stale");
assert.equal(state.get("invoice-1").revision, 5);
assert.equal(state.get("run-1").status, "stale");
assert.equal(await markInvoiceStale(fakeMutationCtx, "invoice-1"), false, "La invalidación debe ser idempotente");

const validModelOutput = {
  document_type: "invoice",
  header: {
    uuid: null, folio: null, issuer_name: null, issuer_rfc: null, receiver_rfc: null,
    issued_at: null, currency: null, subtotal: null, discount: null,
    transferred_taxes: null, retained_taxes: null, total: null,
  },
  items: [{
    source_index: 0,
    description: "Taladro percutor",
    product_code: "27112700",
    quantity: null,
    unit: null,
    unit_price: null,
    discount: null,
    net_amount: null,
    tax_amount: null,
    gross_amount: null,
    category_code: "power_tools",
    canonical_label: "Taladro percutor",
    confidence: "high",
    asset_candidate: true,
    evidence_page: null,
  }],
  warnings: [],
};
assert.equal(invoiceModelOutputSchema.parse(validModelOutput).items[0].asset_candidate, true);
assert.throws(() => invoiceModelOutputSchema.parse({ ...validModelOutput, unexpected: true }));

console.log("Invoice analysis rule tests passed");
