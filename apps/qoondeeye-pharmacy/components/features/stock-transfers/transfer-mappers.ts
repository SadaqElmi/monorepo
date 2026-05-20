import type { Branch } from "@/lib/services/branches";
import type { InventoryEntry } from "@/lib/services/inventory";
import type {
  TransferApprovalState,
  TransferDto,
  TransferEventDto,
} from "@/lib/services/transfers";

import type { StockTransferDetail, StockTransferListRow } from "./types";
import type { TransferStatus } from "./types";

export type TransferDetailBundle = {
  detail: StockTransferDetail;
  events: TransferEventDto[];
};

export function availabilityMapForBranch(
  branchId: string | undefined,
  inventory: Pick<InventoryEntry, "product_id" | "branch_id" | "quantity">[],
): Map<string, number> {
  const m = new Map<string, number>();
  if (!branchId) return m;
  for (const row of inventory) {
    if (row.branch_id === branchId && row.product_id) {
      m.set(row.product_id, row.quantity ?? 0);
    }
  }
  return m;
}

function normalizeStatus(raw: string | undefined | null): TransferStatus {
  const s = (raw ?? "draft").toLowerCase();
  if (s === "confirmed") return "confirmed";
  if (s === "shipped") return "shipped";
  if (s === "received") return "received";
  if (s === "closed") return "closed";
  return "draft";
}

function branchName(map: Map<string, string>, id: string | undefined): string {
  if (!id) return "—";
  return map.get(id) ?? id;
}

/** API may return snake_case or camelCase timestamps. */
function pickTransferTimestamp(
  d: TransferDto,
  snake: "confirmed_at" | "shipped_at" | "received_at",
  camel: "confirmedAt" | "shippedAt" | "receivedAt",
): string | null {
  const o = d as Record<string, unknown>;
  const v = o[snake] ?? o[camel];
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  return null;
}

export function displayIdFromTransferDto(d: TransferDto): string {
  const n = d.transfer_number ?? d.number;
  if (n && String(n).trim()) {
    const t = String(n).trim();
    return t.startsWith("#") ? t : `#${t}`;
  }
  return `#${d.id.slice(0, 8).toUpperCase()}`;
}

export function branchesToMap(branches: Branch[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of branches) {
    if (b.id) m.set(b.id, b.name?.trim() || b.id);
  }
  return m;
}

export function transferDtoToListRow(
  d: TransferDto,
  branchMap: Map<string, string>,
): StockTransferListRow {
  const fromId = d.from_branch_id ?? "";
  const toId = d.to_branch_id ?? "";
  const created = d.created_by_name?.trim();
  return {
    id: d.id,
    displayId: displayIdFromTransferDto(d),
    fromBranch: branchName(branchMap, fromId),
    toBranch: branchName(branchMap, toId),
    status: normalizeStatus(d.status),
    createdByName: created?.length ? created : "—",
    createdByInitials: created
      ? created
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("") || undefined
      : undefined,
    fromBranchId: fromId || undefined,
    toBranchId: toId || undefined,
    approvalState:
      (d.approval_status as TransferApprovalState | undefined) ??
      (d.approval_state as TransferApprovalState | undefined) ??
      undefined,
    isReversed: Boolean(d.is_reversed),
  };
}

export function transferDtoToDetail(
  d: TransferDto,
  branchMap: Map<string, string>,
  inventoryAvailableByProductId?: Map<string, number>,
): StockTransferDetail {
  const fromId = d.from_branch_id ?? "";
  const toId = d.to_branch_id ?? "";
  const items = d.items ?? [];
  const lines = items.map((it) => {
    const pid = it.product_id ?? "";
    const avail = inventoryAvailableByProductId?.get(pid) ?? 0;
    return {
      id: it.id,
      productName: it.product?.name?.trim() || "Product",
      sku: it.product?.sku?.trim() || pid.slice(0, 8) || "—",
      available: avail,
      quantity: Number(it.quantity ?? 0),
      unit: it.product?.unit?.trim() || "—",
      receivedQty:
        it.received_quantity != null ? Number(it.received_quantity) : undefined,
      remainingQty:
        it.received_quantity != null && it.quantity != null
          ? Math.max(0, Number(it.quantity) - Number(it.received_quantity))
          : undefined,
    };
  });

  const totalUnits = lines.reduce((s, l) => s + l.quantity, 0);

  return {
    id: d.id,
    displayId: displayIdFromTransferDto(d),
    status: normalizeStatus(d.status),
    fromBranch: branchName(branchMap, fromId),
    toBranch: branchName(branchMap, toId),
    fromBranchId: fromId || undefined,
    toBranchId: toId || undefined,
    createdByName: d.created_by_name?.trim() || "—",
    expectedDate: d.expected_date ?? undefined,
    phaseLabel: undefined,
    lines,
    journalDebitLabel:
      d.journal_debit_label?.trim() || "Account: 1205 - Due From Warehouse",
    journalDebitAmount: d.journal_debit_amount?.trim() || "—",
    journalCreditLabel:
      d.journal_credit_label?.trim() || "Account: 1300 - Pharma Inventory",
    journalCreditAmount: d.journal_credit_amount?.trim() || "—",
    totalUnits,
    estTax: "$0.00",
    authorizedBy: d.authorized_by ?? undefined,
    confirmedAt: pickTransferTimestamp(d, "confirmed_at", "confirmedAt"),
    shippedAt: pickTransferTimestamp(d, "shipped_at", "shippedAt"),
    receivedAt: pickTransferTimestamp(d, "received_at", "receivedAt"),
    inTransitQuantity:
      Boolean(d.is_reversed)
        ? null
        : d.in_transit_quantity != null
          ? Number(d.in_transit_quantity)
          : d.status?.toLowerCase() === "shipped"
            ? totalUnits
            : null,
    approvalState:
      (d.approval_status as TransferApprovalState | undefined) ??
      (d.approval_state as TransferApprovalState | undefined) ??
      undefined,
    approvedBy: d.approved_by ?? null,
    approvedAt: d.approved_at ?? null,
    shipAccountingState: d.ship_accounting_state ?? "pending",
    receiveAccountingState: d.receive_accounting_state ?? "pending",
    lastAccountingError: d.last_accounting_error ?? null,
    shippedJournalEntryId: d.shipped_journal_entry_id ?? null,
    receiveJournalEntryId: d.receive_journal_entry_id ?? null,
    isReversed: Boolean(d.is_reversed),
    reversalReason: d.reversal_reason ?? null,
    reversedAt: d.reversed_at ?? null,
    processingLockOwner: d.processing_lock_owner ?? null,
    processingLockUntil: d.processing_lock_until ?? null,
    processingStage: d.processing_stage ?? null,
  };
}
