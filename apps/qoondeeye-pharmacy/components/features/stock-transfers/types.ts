export type TransferStatus =
  | "draft"
  | "confirmed"
  | "shipped"
  | "received"
  | "closed";

export type StockTransferListRow = {
  id: string;
  displayId: string;
  fromBranch: string;
  toBranch: string;
  status: TransferStatus;
  createdByName: string;
  createdByAvatarUrl?: string;
  createdByInitials?: string;
  fromBranchId?: string;
  toBranchId?: string;
  approvalState?: string | null;
  /** Shipped rows can still be reversed at source — not receivable at destination. */
  isReversed?: boolean;
};

export type TransferLineItem = {
  id: string;
  productName: string;
  sku: string;
  available: number;
  quantity: number;
  unit: string;
  /** When API supports partial receive */
  receivedQty?: number;
  remainingQty?: number;
};

export type StockTransferDetail = {
  id: string;
  displayId: string;
  status: TransferStatus;
  fromBranch: string;
  toBranch: string;
  fromBranchId?: string;
  toBranchId?: string;
  /** Server-driven approval gate before ship (optional). */
  approvalState?: string | null;
  createdByName: string;
  expectedDate?: string;
  priority?: "normal" | "urgent";
  phaseLabel?: string;
  lines: TransferLineItem[];
  journalDebitLabel: string;
  journalDebitAmount: string;
  journalCreditLabel: string;
  journalCreditAmount: string;
  totalUnits: number;
  estTax: string;
  authorizedBy?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  shipAccountingState?: "posted" | "failed" | "pending" | string;
  receiveAccountingState?: "posted" | "failed" | "pending" | string;
  lastAccountingError?: string | null;
  shippedJournalEntryId?: string | null;
  receiveJournalEntryId?: string | null;
  isReversed?: boolean;
  reversalReason?: string | null;
  reversedAt?: string | null;
  processingLockOwner?: string | null;
  processingLockUntil?: string | null;
  processingStage?: string | null;
  /** When the order was confirmed (no stock move yet) */
  confirmedAt?: string | null;
  /** Stock OUT at source + transfer_out + accounting (ship) */
  shippedAt?: string | null;
  /** Stock IN at destination + transfer_in + accounting (receive) */
  receivedAt?: string | null;
  /** Total qty in transit (after ship, before receive) — optional ERP field */
  inTransitQuantity?: number | null;
};
