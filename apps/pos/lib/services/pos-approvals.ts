import { POS_PREFIX } from "./endpoints";
import { authGet, authPost } from "./http";

export type PosApprovalAction =
  | "large_discount"
  | "price_override"
  | "refund"
  | "void_sale"
  | "shift_reopen"
  | "cash_variance";

export type PosApprovalRecord = {
  id: string;
  branchId: string;
  actionType: string;
  status: string;
  approvedBy?: string | null;
  expiresAt?: string | null;
};

export async function requestAndApprove(
  tenantSlug: string,
  body: {
    actionType: PosApprovalAction;
    supervisorPin: string;
    reasonCode?: string;
    reasonNote?: string;
    payload?: Record<string, unknown>;
  },
) {
  return authPost<PosApprovalRecord>(
    `${POS_PREFIX}/approvals/request-and-approve`,
    body,
    { "X-Tenant": tenantSlug },
  );
}

export async function listPendingApprovals(
  tenantSlug: string,
  limit = 50,
) {
  return authGet<PosApprovalRecord[]>(
    `${POS_PREFIX}/approvals/pending?limit=${limit}`,
    { "X-Tenant": tenantSlug },
  );
}
