import { RETURN_VOUCHERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type ReturnVoucherCreated = {
  id: string;
  branch_id: string;
  sale_id: string;
  sale_item_id: string;
  quantity: number;
  unit_price: number | string;
  token: string;
  status: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  barcodeValue: string;
};

export type FinalizeReturnVoucherResult = {
  saleReturn: {
    id: string;
    sale_id: string;
    branch_id: string | null;
    reason: string | null;
    refund_method: string | null;
    refund_amount: number | string | null;
    return_date: string;
  };
  refundAmount: number;
  receiptNumber: string | null;
  originalSaleId: string;
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

export type ReturnVoucherPreview = {
  id: string;
  branchId?: string;
  saleId?: string;
  saleItemId?: string;
  quantity: number;
  unitPrice?: number | string;
  token: string;
  status: string;
  barcodeValue?: string;
};

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
