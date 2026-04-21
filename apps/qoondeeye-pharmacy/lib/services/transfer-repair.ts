import { TRANSFERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type TransferRepairAction =
  | { kind: "link_ship_journal"; journal_entry_id: string }
  | { kind: "link_receive_journal"; journal_entry_id: string }
  | { kind: "update_approval_state"; from: string; to: string }
  | { kind: "create_ship_journal"; journal_entry_id: string; amount: number }
  | { kind: "create_receive_journal"; journal_entry_id: string; amount: number };

export type TransferRepairResult = {
  transfer_id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  actions: TransferRepairAction[];
};

export type AutoFixResult = {
  issue: string;
  suggested_fix: string;
  applied: boolean;
  readinessStatus?: string;
  actions: Array<Record<string, unknown>>;
};

async function postRepair(
  tenantSlug: string,
  transferId: string,
  pathSegment: string,
): Promise<TransferRepairResult> {
  const base = TRANSFERS_PREFIX.replace(/\/$/, "");
  return jsonFetch<TransferRepairResult>(
    `${base}/${encodeURIComponent(transferId)}/repair/${pathSegment}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant": tenantSlug,
      } as JsonHeaders,
      body: JSON.stringify({ confirm: true }),
    },
  );
}

export function repairTransferJournalLinks(
  tenantSlug: string,
  transferId: string,
): Promise<TransferRepairResult> {
  return postRepair(tenantSlug, transferId, "journal-links");
}

export function repairTransferApprovalFromReplay(
  tenantSlug: string,
  transferId: string,
): Promise<TransferRepairResult> {
  return postRepair(tenantSlug, transferId, "approval-from-replay");
}

export function recreateMissingTransferJournals(
  tenantSlug: string,
  transferId: string,
): Promise<TransferRepairResult> {
  return postRepair(tenantSlug, transferId, "recreate-missing-journals");
}

export function runAutoRepair(tenantSlug: string): Promise<AutoFixResult> {
  const base = TRANSFERS_PREFIX.replace(/\/$/, "");
  return jsonFetch<AutoFixResult>(`${base}/repairs/auto-fix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify({}),
  });
}
