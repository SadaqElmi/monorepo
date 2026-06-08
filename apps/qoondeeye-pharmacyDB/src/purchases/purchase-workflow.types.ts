export const PURCHASE_STATUSES = [
  'draft',
  'released',
  'partially_received',
  'received',
  'invoiced',
  'closed',
  'cancelled',
] as const;

export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export type PurchaseWorkflowMode = 'immediate' | 'draft';

export function isPurchaseEditableStatus(
  status: string | null | undefined,
): boolean {
  return status === 'draft' || status === 'released';
}

export function purchaseHasPostedInventory(
  status: string | null | undefined,
): boolean {
  return (
    status === 'received' ||
    status === 'invoiced' ||
    status === 'closed' ||
    status === 'partially_received'
  );
}

export function purchaseHasPostedInvoice(
  status: string | null | undefined,
): boolean {
  return status === 'invoiced' || status === 'closed';
}
