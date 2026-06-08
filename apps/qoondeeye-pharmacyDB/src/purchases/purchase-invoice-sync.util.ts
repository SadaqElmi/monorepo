/** Keep invoice_number and supplier_invoice_no aligned during v1 transition. */
export function normalizeSupplierInvoiceNo(
  value: string | null | undefined,
): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function syncPurchaseInvoiceFields(input: {
  invoiceNumber?: string | null;
  supplierInvoiceNo?: string | null;
}): { invoice_number: string | null; supplier_invoice_no: string | null } {
  const fromSupplier = normalizeSupplierInvoiceNo(input.supplierInvoiceNo);
  const fromLegacy = normalizeSupplierInvoiceNo(input.invoiceNumber);
  const canonical = fromSupplier ?? fromLegacy;
  return {
    invoice_number: canonical,
    supplier_invoice_no: canonical,
  };
}
