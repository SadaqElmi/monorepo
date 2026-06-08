import { syncPurchaseInvoiceFields } from './purchase-invoice-sync.util';
import {
  purchaseHasPostedInventory,
  purchaseHasPostedInvoice,
} from './purchase-workflow.types';

describe('purchase invoice sync', () => {
  it('keeps invoice_number and supplier_invoice_no aligned', () => {
    const out = syncPurchaseInvoiceFields({
      supplierInvoiceNo: 'INV-1001',
    });
    expect(out.invoice_number).toBe('INV-1001');
    expect(out.supplier_invoice_no).toBe('INV-1001');
  });
});

describe('purchase workflow status helpers', () => {
  it('draft has no posted inventory or invoice', () => {
    expect(purchaseHasPostedInventory('draft')).toBe(false);
    expect(purchaseHasPostedInvoice('draft')).toBe(false);
  });

  it('received has inventory but not invoice', () => {
    expect(purchaseHasPostedInventory('received')).toBe(true);
    expect(purchaseHasPostedInvoice('received')).toBe(false);
  });

  it('closed has both', () => {
    expect(purchaseHasPostedInventory('closed')).toBe(true);
    expect(purchaseHasPostedInvoice('closed')).toBe(true);
  });
});
