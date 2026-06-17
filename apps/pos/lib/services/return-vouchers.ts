import { RETURN_VOUCHERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type {
  FinalizeReturnVoucherResult,
  ReturnVoucherCreated,
  ReturnVoucherPreview,
} from "@repo/types";

export type {
  ReturnVoucherCreated,
  FinalizeReturnVoucherResult,
  ReturnVoucherPreview,
};

export async function createReturnVoucher(
  tenantSlug: string,
  body: {
    saleId: string;
    saleItemId: string;
    quantity: number;
    reason?: string;
  },
): Promise<ReturnVoucherCreated> {
  return jsonFetch<ReturnVoucherCreated>(RETURN_VOUCHERS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(body),
  });
}

export async function getReturnVoucherByToken(
  tenantSlug: string,
  token: string,
): Promise<ReturnVoucherPreview> {
  const t = encodeURIComponent(token.trim());
  return jsonFetch<ReturnVoucherPreview>(
    `${RETURN_VOUCHERS_PREFIX}/by-token/${t}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function finalizeReturnVoucher(
  tenantSlug: string,
  voucherId: string,
  body: {
    token: string;
    confirmedProductId: string;
    scannedUnitPrice?: number;
    refundMethod: string;
    approvalId: string;
  },
): Promise<FinalizeReturnVoucherResult> {
  return jsonFetch<FinalizeReturnVoucherResult>(
    `${RETURN_VOUCHERS_PREFIX}/${voucherId}/finalize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant": tenantSlug,
      } as JsonHeaders,
      body: JSON.stringify(body),
    },
  );
}
