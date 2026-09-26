export const normalizeOgcInvoiceReference = (value?: string) => value?.trim().replace(/\s+/g, " ") || undefined;

export const appendOgcInvoiceDuplicateKey = (base: string, tipo: string, reference?: string) => {
  if (tipo !== "ingreso") return base;
  const normalized = normalizeOgcInvoiceReference(reference)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized ? `${base}|factura:${normalized}` : base;
};

export const canResumeOgcCapture = (active: boolean, storedFinancialKey: string, incomingFinancialKey: string) =>
  active && storedFinancialKey === incomingFinancialKey;
