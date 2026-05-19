/**
 * Stock transfer API client.
 *
 * Contract (align with your Nest `/api/transfers` module):
 * - GET    /api/transfers?status=&from_branch_id=&to_branch_id=&approval_state=
 * - GET    /api/transfers/:id
 * - GET    /api/transfers/:id/events
 * - POST   /api/transfers
 * - PATCH  /api/transfers/:id
 * - POST   /api/transfers/:id/confirm
 * - POST   /api/transfers/:id/request-approval
 * - POST   /api/transfers/:id/approve
 * - POST   /api/transfers/:id/reject
 * - POST   /api/transfers/:id/ship
 * - POST   /api/transfers/:id/receive
 * - POST   /api/transfers/:id/close
 * - POST   /api/transfers/:id/reverse
 *
 * Request bodies use snake_case keys (typical Nest DTO serialization).
 * Responses: supports raw arrays, `{ data: [] }`, or `{ transfers: [] }`.
 */

import type { PagedList } from "@repo/types";
import {
  createTransferDraftSchema,
  parseInput,
  type CreateTransferDraftInput,
} from "@/lib/validation";

import { TRANSFERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import { invalidateReportCacheForBranch } from "./accounting";

export type TransferApprovalState =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | string;

export type TransferItemDto = {
  id: string;
  product_id?: string;
  quantity?: number;
  received_quantity?: number | null;
  unit_cost_snapshot?: number | null;
  line_cost_snapshot?: number | null;
  product?: {
    name?: string | null;
    sku?: string | null;
    unit?: string | null;
  } | null;
};

export type TransferDto = {
  id: string;
  transfer_number?: string | null;
  number?: string | null;
  from_branch_id?: string;
  to_branch_id?: string;
  status?: string;
  approval_status?: string | null;
  approval_state?: string | null;
  lock_version?: number;
  created_by_name?: string | null;
  created_at?: string;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  received_at?: string | null;
  /** Some proxies / serializers use camelCase */
  confirmedAt?: string | null;
  shippedAt?: string | null;
  receivedAt?: string | null;
  expected_date?: string | null;
  expected_stock_snapshot?: Record<string, unknown> | null;
  items?: TransferItemDto[];
  /** Optional journal summary from API */
  journal_debit_label?: string | null;
  journal_debit_amount?: string | null;
  journal_credit_label?: string | null;
  journal_credit_amount?: string | null;
  authorized_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  shipped_journal_entry_id?: string | null;
  receive_journal_entry_id?: string | null;
  ship_reversal_journal_entry_id?: string | null;
  receive_reversal_journal_entry_id?: string | null;
  ship_accounting_state?: "posted" | "failed" | "pending" | string;
  receive_accounting_state?: "posted" | "failed" | "pending" | string;
  last_accounting_error?: string | null;
  is_reversed?: boolean;
  reversed_by?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  in_transit_quantity?: number | null;
  processing_lock_owner?: string | null;
  processing_lock_until?: string | null;
  processing_stage?: string | null;
};

export type TransferEventDto = {
  id: string;
  type?: string;
  event_type?: string;
  created_at?: string;
  actor_user_id?: string | null;
  branch_id?: string | null;
  metadata?: Record<string, unknown> | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  aggregate_version?: number;
  schema_version?: number;
  correlation_id?: string | null;
  causation_id?: string | null;
  idempotency_key?: string | null;
};

export type TransferMonitoringOverviewDto = {
  transfers_today: number;
  shipped_today: number;
  received_today: number;
  failed_today: number;
  integrity_errors_today: number;
  idempotency_replays_today: number;
  idempotency_conflicts_today: number;
  failure_distribution: Array<{ stage: string; count: number }>;
  trend_hours: Array<{ hour: string; shipped: number; received: number }>;
  recent_transfers: Array<{
    id: string;
    transfer_number: string | null;
    from_branch_id: string;
    to_branch_id: string;
    status: string;
    timestamp: string | null;
  }>;
  recent_errors: Array<{
    id: string;
    transfer_id: string | null;
    stage: string;
    error_message: string;
    created_at: string;
  }>;
};

export type ListTransfersQuery = {
  status?: string;
  from_branch_id?: string;
  to_branch_id?: string;
  approval_state?: string;
  branch_id?: string;
};

export type ListTransfersPagedQuery = ListTransfersQuery & {
  page: number;
  limit?: number;
};

function parseListPayload(raw: unknown): TransferDto[] {
  if (Array.isArray(raw)) return raw as TransferDto[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as TransferDto[];
    if (Array.isArray(o.transfers)) return o.transfers as TransferDto[];
  }
  return [];
}

function buildQuery(q?: ListTransfersQuery): string {
  const p = new URLSearchParams();
  if (!q) return "";
  if (q.status) p.set("status", q.status);
  if (q.from_branch_id) p.set("from_branch_id", q.from_branch_id);
  if (q.to_branch_id) p.set("to_branch_id", q.to_branch_id);
  if (q.approval_state) p.set("approval_state", q.approval_state);
  if (q.branch_id) p.set("branch_id", q.branch_id);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function buildPagedQuery(q: ListTransfersPagedQuery): string {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.from_branch_id) p.set("from_branch_id", q.from_branch_id);
  if (q.to_branch_id) p.set("to_branch_id", q.to_branch_id);
  if (q.approval_state) p.set("approval_state", q.approval_state);
  if (q.branch_id) p.set("branch_id", q.branch_id);
  p.set("page", String(Math.max(1, q.page)));
  if (q.limit != null) p.set("limit", String(Math.max(1, q.limit)));
  const s = p.toString();
  return s ? `?${s}` : "?";
}

export async function listTransfers(
  tenantSlug: string,
  query?: ListTransfersQuery,
  init?: Pick<RequestInit, "signal">,
): Promise<TransferDto[]> {
  const raw = await jsonFetch<unknown>(
    `${TRANSFERS_PREFIX}${buildQuery(query)}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
  return parseListPayload(raw);
}

export async function listTransfersPaged(
  tenantSlug: string,
  query: ListTransfersPagedQuery,
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<TransferDto>> {
  return jsonFetch<PagedList<TransferDto>>(
    `${TRANSFERS_PREFIX}${buildPagedQuery(query)}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export async function getTransfer(
  tenantSlug: string,
  id: string,
): Promise<TransferDto> {
  return jsonFetch<TransferDto>(
    `${TRANSFERS_PREFIX}/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function getTransferEvents(
  tenantSlug: string,
  id: string,
): Promise<TransferEventDto[]> {
  const raw = await jsonFetch<unknown>(
    `${TRANSFERS_PREFIX}/${encodeURIComponent(id)}/events`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
  if (Array.isArray(raw)) return raw as TransferEventDto[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as TransferEventDto[];
    if (Array.isArray(o.events)) return o.events as TransferEventDto[];
  }
  return [];
}

export async function getTransferMonitoringOverview(
  tenantSlug: string,
): Promise<TransferMonitoringOverviewDto> {
  return jsonFetch<TransferMonitoringOverviewDto>(
    `${TRANSFERS_PREFIX}/monitoring/overview`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

/** Per-status counts for KPI cards (optional branch scope = either endpoint). */
export async function getTransferStatusCounts(
  tenantSlug: string,
  branchScopeId?: string | null,
  init?: Pick<RequestInit, "signal">,
): Promise<Record<string, number>> {
  const qs =
    branchScopeId != null && branchScopeId.trim()
      ? `?branch_id=${encodeURIComponent(branchScopeId.trim())}`
      : "";
  return jsonFetch<Record<string, number>>(
    `${TRANSFERS_PREFIX}/summary/status-counts${qs}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export type CreateTransferInput = CreateTransferDraftInput & {
  expectedDate?: string | null;
};

function buildMutationHeaders(tenantSlug: string): JsonHeaders {
  const now = Date.now();
  const nonce = Math.random().toString(36).slice(2, 10);
  return {
    "Content-Type": "application/json",
    "X-Tenant": tenantSlug,
    "X-Correlation-Id": `tx-${now}-${nonce}`,
    "X-Idempotency-Key": `idem-${now}-${nonce}`,
  } as JsonHeaders;
}

export async function createTransfer(
  tenantSlug: string,
  input: CreateTransferInput,
): Promise<TransferDto> {
  const validated = parseInput(createTransferDraftSchema, {
    toBranchId: input.toBranchId,
    items: input.items,
  });
  const payload = await jsonFetch<TransferDto>(TRANSFERS_PREFIX, {
    method: "POST",
    headers: {
      ...buildMutationHeaders(tenantSlug),
    } as JsonHeaders,
    body: JSON.stringify({
      to_branch_id: validated.toBranchId,
      expected_date: input.expectedDate ?? undefined,
      items: validated.items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
      })),
    }),
  });
  invalidateReportCacheForBranch(payload.from_branch_id);
  invalidateReportCacheForBranch(payload.to_branch_id);
  return payload;
}

export type UpdateTransferInput = {
  toBranchId?: string;
  expectedDate?: string | null;
  items?: { productId: string; quantity: number }[];
};

export async function updateTransfer(
  tenantSlug: string,
  id: string,
  input: UpdateTransferInput,
): Promise<TransferDto> {
  const body: Record<string, unknown> = {};
  if (input.toBranchId !== undefined) body.to_branch_id = input.toBranchId;
  if (input.expectedDate !== undefined) body.expected_date = input.expectedDate;
  if (input.items !== undefined) {
    body.items = input.items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
    }));
  }
  const payload = await jsonFetch<TransferDto>(
    `${TRANSFERS_PREFIX}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        ...buildMutationHeaders(tenantSlug),
      } as JsonHeaders,
      body: JSON.stringify(body),
    },
  );
  invalidateReportCacheForBranch(payload.from_branch_id);
  invalidateReportCacheForBranch(payload.to_branch_id);
  return payload;
}

async function postTransition(
  tenantSlug: string,
  id: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<TransferDto> {
  const payload = await jsonFetch<TransferDto>(
    `${TRANSFERS_PREFIX}/${encodeURIComponent(id)}/${path}`,
    {
      method: "POST",
      headers: {
        ...buildMutationHeaders(tenantSlug),
      } as JsonHeaders,
      body: JSON.stringify(body ?? {}),
    },
  );
  invalidateReportCacheForBranch(payload.from_branch_id);
  invalidateReportCacheForBranch(payload.to_branch_id);
  return payload;
}

export async function confirmTransfer(
  tenantSlug: string,
  id: string,
): Promise<TransferDto> {
  return postTransition(tenantSlug, id, "confirm");
}

export async function requestTransferApproval(
  tenantSlug: string,
  id: string,
): Promise<TransferDto> {
  return postTransition(tenantSlug, id, "request-approval");
}

export async function approveTransfer(
  tenantSlug: string,
  id: string,
): Promise<TransferDto> {
  return postTransition(tenantSlug, id, "approve");
}

export async function rejectTransfer(
  tenantSlug: string,
  id: string,
  reason?: string,
): Promise<TransferDto> {
  return postTransition(tenantSlug, id, "reject", reason ? { reason } : undefined);
}

export async function shipTransfer(
  tenantSlug: string,
  id: string,
): Promise<TransferDto> {
  return postTransition(tenantSlug, id, "ship");
}

export async function receiveTransfer(
  tenantSlug: string,
  id: string,
): Promise<TransferDto> {
  return postTransition(tenantSlug, id, "receive");
}

export async function closeTransfer(
  tenantSlug: string,
  id: string,
): Promise<TransferDto> {
  return postTransition(tenantSlug, id, "close");
}

export async function reverseTransfer(
  tenantSlug: string,
  id: string,
  reason?: string,
): Promise<TransferDto> {
  return postTransition(tenantSlug, id, "reverse", reason ? { reason } : undefined);
}
