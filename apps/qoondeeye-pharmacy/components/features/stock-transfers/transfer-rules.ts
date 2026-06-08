import type { TransferStatus } from "./types";

/** ERP order for lifecycle checks */
export const TRANSFER_STATUS_ORDER: TransferStatus[] = [
  "draft",
  "confirmed",
  "shipped",
  "received",
  "closed",
];

export function transferStatusIndex(status: TransferStatus): number {
  return TRANSFER_STATUS_ORDER.indexOf(status);
}

/** Shipped and received: no line edits, no branch changes */
export function isTransferLocked(status: TransferStatus): boolean {
  return status === "shipped" || status === "received" || status === "closed";
}

export function canEditTransferFully(status: TransferStatus): boolean {
  return status === "draft";
}

/** Optional limited edits (quantities) — UI still allows composer link with warning */
export function canEditTransferLimited(status: TransferStatus): boolean {
  return status === "confirmed";
}

export function phaseLabelForStatus(status: TransferStatus): string {
  switch (status) {
    case "draft":
      return "Draft — planning";
    case "confirmed":
      return "Confirmed order";
    case "shipped":
      return "In transit";
    case "received":
      return "Completed";
    case "closed":
      return "Closed";
    default:
      return "";
  }
}

export type ApprovalStateInput = string | null | undefined;

/** Only draft may move to confirmed. */
export function canConfirm(status: TransferStatus): boolean {
  return status === "draft";
}

/**
 * Ship from confirmed when approval is not required (`none`) or explicitly approved.
 * `pending` / `rejected` block shipping until a manager approves or approval is re-requested.
 */
export function canShip(
  status: TransferStatus,
  approvalState?: ApprovalStateInput,
): boolean {
  if (status !== "confirmed") return false;
  const a = (approvalState ?? "none").toLowerCase().trim() || "none";
  return a === "approved" || a === "none";
}

/** Reversed while still `shipped` is allowed in DB — receiving must stay blocked. */
export function canReceive(
  status: TransferStatus,
  isReversed?: boolean | null,
): boolean {
  if (isReversed) return false;
  return status === "shipped";
}

export function canReverse(
  status: TransferStatus,
  isReversed?: boolean | null,
): boolean {
  if (isReversed) return false;
  return status === "shipped" || status === "received";
}

export function canEditBranches(status: TransferStatus): boolean {
  return status === "draft";
}

export function canEditQuantities(status: TransferStatus): boolean {
  return status === "draft" || status === "confirmed";
}

export function canRequestApproval(
  status: TransferStatus,
  approvalState?: ApprovalStateInput,
): boolean {
  if (status !== "confirmed") return false;
  const a = (approvalState ?? "").toLowerCase().trim();
  if (!a || a === "none" || a === "rejected") return true;
  return false;
}

export function canApproveOrReject(
  approvalState?: ApprovalStateInput,
  actorRole?: string | null,
): boolean {
  const role = (actorRole ?? "").toLowerCase().trim();
  if (role !== "manager" && role !== "admin" && role !== "owner") return false;
  return (approvalState ?? "").toLowerCase().trim() === "pending";
}
