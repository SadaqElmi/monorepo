import type {
  PagedList,
  TransactionRegisterDetail,
  TransactionRegisterListQuery,
  TransactionRegisterRow,
} from "@repo/types";

import { TRANSACTION_REGISTER_PREFIX } from "./endpoints";
import { blobFetch, type JsonHeaders, jsonFetch } from "./http";

export type {
  TransactionRegisterDetail,
  TransactionRegisterListQuery,
  TransactionRegisterRow,
};

function buildQuery(q: TransactionRegisterListQuery): string {
  const p = new URLSearchParams();
  p.set("page", String(Math.max(1, q.page)));
  p.set("limit", String(Math.max(1, q.limit)));
  if (q.branch_id?.trim()) p.set("branch_id", q.branch_id.trim());
  if (q.date_from?.trim()) p.set("date_from", q.date_from.trim());
  if (q.date_to?.trim()) p.set("date_to", q.date_to.trim());
  if (q.terminal_id?.trim()) p.set("terminal_id", q.terminal_id.trim());
  if (q.staff_id?.trim()) p.set("staff_id", q.staff_id.trim());
  if (q.receipt_no?.trim()) p.set("receipt_no", q.receipt_no.trim());
  if (q.transaction_no?.trim()) p.set("transaction_no", q.transaction_no.trim());
  if (q.customer_id?.trim()) p.set("customer_id", q.customer_id.trim());
  if (q.customer_q?.trim()) p.set("customer_q", q.customer_q.trim());
  if (q.transaction_type) p.set("transaction_type", q.transaction_type);
  if (q.refund_status) p.set("refund_status", q.refund_status);
  if (q.statement_id?.trim()) p.set("statement_id", q.statement_id.trim());
  if (q.manager_id?.trim()) p.set("manager_id", q.manager_id.trim());
  if (q.sort_by?.trim()) p.set("sort_by", q.sort_by.trim());
  if (q.sort_dir) p.set("sort_dir", q.sort_dir);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function getTransactionRegisterPaged(
  tenantSlug: string,
  query: TransactionRegisterListQuery,
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<TransactionRegisterRow>> {
  return jsonFetch<PagedList<TransactionRegisterRow>>(
    `${TRANSACTION_REGISTER_PREFIX}${buildQuery(query)}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export async function getTransactionRegisterDetail(
  tenantSlug: string,
  registerId: string,
  init?: Pick<RequestInit, "signal">,
): Promise<TransactionRegisterDetail> {
  const encoded = encodeURIComponent(registerId);
  return jsonFetch<TransactionRegisterDetail>(
    `${TRANSACTION_REGISTER_PREFIX}/${encoded}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export async function exportTransactionRegister(
  tenantSlug: string,
  query: Omit<TransactionRegisterListQuery, "page" | "limit"> & {
    format: "csv" | "xlsx";
  },
): Promise<Blob> {
  const p = new URLSearchParams();
  p.set("format", query.format);
  if (query.branch_id?.trim()) p.set("branch_id", query.branch_id.trim());
  if (query.date_from?.trim()) p.set("date_from", query.date_from.trim());
  if (query.date_to?.trim()) p.set("date_to", query.date_to.trim());
  if (query.terminal_id?.trim()) p.set("terminal_id", query.terminal_id.trim());
  if (query.staff_id?.trim()) p.set("staff_id", query.staff_id.trim());
  if (query.receipt_no?.trim()) p.set("receipt_no", query.receipt_no.trim());
  if (query.transaction_no?.trim()) {
    p.set("transaction_no", query.transaction_no.trim());
  }
  if (query.customer_id?.trim()) p.set("customer_id", query.customer_id.trim());
  if (query.customer_q?.trim()) p.set("customer_q", query.customer_q.trim());
  if (query.transaction_type) p.set("transaction_type", query.transaction_type);
  if (query.refund_status) p.set("refund_status", query.refund_status);
  if (query.statement_id?.trim()) p.set("statement_id", query.statement_id.trim());
  if (query.manager_id?.trim()) p.set("manager_id", query.manager_id.trim());
  if (query.sort_by?.trim()) p.set("sort_by", query.sort_by.trim());
  if (query.sort_dir) p.set("sort_dir", query.sort_dir);

  return blobFetch(
    `${TRANSACTION_REGISTER_PREFIX}/export?${p.toString()}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}
