import assert from "node:assert/strict";
import {
  allocateInvoiceAmount,
  invoiceModelOutputSchema,
  inferInvoiceGroupBy,
  isInvoiceAnalysisIntent,
  normalizeInvoiceCurrency,
  normalizeInvoiceText,
  normalizeInvoiceUuid,
  parseCfdiXml,
} from "../convex/invoiceRules.ts";

assert.equal(normalizeInvoiceText("  DISCO-de Córte  "), "disco de corte");
assert.equal(normalizeInvoiceUuid("abc-123 xyz"), "ABC123XYZ");
assert.equal(normalizeInvoiceCurrency("mxn"), "MXN");
assert.equal(normalizeInvoiceCurrency("pesos"), "SIN_MONEDA");
assert.equal(isInvoiceAnalysisIntent("¿Cuánto gastamos en herramienta menor?"), true);
assert.equal(isInvoiceAnalysisIntent("Lista los activos potenciales comprados"), true);
assert.equal(isInvoiceAnalysisIntent("Dame el avance físico"), false);
assert.equal(inferInvoiceGroupBy("Desglosa herramienta menor por categoría"), "category");
assert.equal(inferInvoiceGroupBy("¿Qué taladros compramos?"), "item");
assert.equal(inferInvoiceGroupBy("Compara las facturas de los proyectos"), "project");

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
assert.throws(() => parseCfdiXml(`<!DOCTYPE x [<!ENTITY leaked SYSTEM "file:///etc/passwd">]>${cfdi}`), /DTD|entidades externas/);
assert.throws(() => parseCfdiXml("<xml />"), /Comprobante/);

const allocated = allocateInvoiceAmount(100, [{ weight: 1 }, { weight: 1 }, { weight: 1 }]);
assert.deepEqual(allocated, [33.34, 33.33, 33.33]);
assert.equal(allocated.reduce((sum, value) => sum + value, 0), 100);
const negative = allocateInvoiceAmount(-10, [{ weight: 2 }, { weight: 1 }]);
assert.equal(Number(negative.reduce((sum, value) => sum + value, 0).toFixed(2)), -10);
assert.deepEqual(allocateInvoiceAmount(20, []), []);

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
