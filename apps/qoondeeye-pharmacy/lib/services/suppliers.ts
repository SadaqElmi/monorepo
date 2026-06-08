import { unwrapListResponse } from "@repo/utils";
import type { PagedList } from "@repo/types";

import { SUPPLIERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type SupplierType = "local" | "international";

export type Supplier = {
  id: string;
  name: string | null;
  supplier_type?: SupplierType;
  country?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string | null;
};

export type CreateSupplierInput = {
  name?: string;
  supplierType?: SupplierType;
  country?: string | null;
  city?: string | null;
  phone?: string;
  email?: string;
  address?: string;
  active?: boolean;
};

export type UpdateSupplierInput = CreateSupplierInput;

export type SupplierStats = {
  totalPurchases: number;
  totalPurchaseAmount: number;
  lastPurchaseDate: string | null;
  outstandingBalance: number;
};

export type SupplierProductRow = {
  itemNo: string | null;
  productId: string;
  productName: string;
  lastCostPrice: number | string | null;
  lastPurchaseDate: string | null;
  preferredSupplier: boolean;
  supplierItemCode?: string | null;
};

export type SupplierPurchaseRow = {
  purchaseNumber: string | null;
  purchaseId: string;
  supplierInvoiceNumber: string | null;
  date: string | null;
  branchId: string;
  branchName: string | null;
  amount: number | string | null;
  status: string;
};

export type SupplierStatementLine = {
  date: string;
  source_type: string;
  source_id: string | null;
  reference: string | null;
  description: string;
  debit: number | string;
  credit: number | string;
  running_balance: number | string;
  branch_id: string;
  branch_name: string | null;
};

export type SupplierStatement = PagedList<SupplierStatementLine> & {
  openingBalance: number | string;
  totalDebits: number | string;
  totalCredits: number | string;
  closingBalance: number | string;
};

export type SupplierPriceHistoryRow = {
  date: string | null;
  purchase_id: string;
  supplier_invoice_no: string | null;
  item_no: string | null;
  product_name: string;
  quantity: number | string | null;
  cost_price: number | string | null;
  selling_price: number | string | null;
  batch_number: string | null;
  expiry_date: string | null;
  branch_name: string | null;
};

export type SupplierPriceHistory = PagedList<SupplierPriceHistoryRow> & {
  summary: {
    lastCost: number | string | null;
    minCost: number | string | null;
    maxCost: number | string | null;
    averageCost: number | string | null;
  };
};

export type ProductsBySupplierReportRow = {
  supplierId: string;
  supplierName: string | null;
  supplierType: SupplierType;
  country: string | null;
  city: string | null;
  productId: string;
  itemNo: string | null;
  productName: string;
  isPreferred: boolean;
  lastCostPrice: number | string | null;
  lastPurchaseDate: string | null;
};

export type PurchasesBySupplierReportRow = {
  supplierId: string;
  supplierName: string | null;
  supplierType: SupplierType;
  country: string | null;
  city: string | null;
  purchaseCount: number | string;
  totalPurchaseAmount: number | string;
  lastPurchaseDate: string | null;
};

export type TopSupplierSpendReportRow = PurchasesBySupplierReportRow & {
  rank: number | string;
};

export async function getSuppliers(tenantSlug: string): Promise<Supplier[]> {
  const data = await jsonFetch<Supplier[] | PagedList<Supplier>>(SUPPLIERS_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
  return unwrapListResponse(data).items;
}

export async function getSuppliersPaged(
  tenantSlug: string,
  params: {
    page: number;
    limit?: number;
    q?: string;
    supplierType?: SupplierType;
    active?: boolean;
  },
): Promise<PagedList<Supplier>> {
  const q = new URLSearchParams({
    page: String(Math.max(1, params.page)),
    limit: String(Math.max(1, params.limit ?? 25)),
  });
  if (params.q?.trim()) q.set("q", params.q.trim());
  if (params.supplierType) q.set("supplierType", params.supplierType);
  if (params.active !== undefined) q.set("active", String(params.active));
  return jsonFetch<PagedList<Supplier>>(`${SUPPLIERS_PREFIX}?${q}`, {
    method: "GET",
    tenantSlug,
  });
}

export async function getSupplier(
  tenantSlug: string,
  id: string,
): Promise<Supplier | null> {
  return jsonFetch<Supplier | null>(`${SUPPLIERS_PREFIX}/${id}`, {
    method: "GET",
    tenantSlug,
  });
}

export async function getSupplierStats(
  tenantSlug: string,
  id: string,
  branchId?: string,
): Promise<SupplierStats> {
  const q = new URLSearchParams();
  if (branchId) q.set("branchId", branchId);
  const qs = q.toString();
  return jsonFetch<SupplierStats>(
    `${SUPPLIERS_PREFIX}/${id}/stats${qs ? `?${qs}` : ""}`,
    { method: "GET", tenantSlug },
  );
}

export async function getSupplierProducts(
  tenantSlug: string,
  id: string,
  params: { page: number; limit?: number; branchId?: string },
): Promise<PagedList<SupplierProductRow>> {
  const q = pagedQuery(params);
  return jsonFetch<PagedList<SupplierProductRow>>(
    `${SUPPLIERS_PREFIX}/${id}/products?${q}`,
    { method: "GET", tenantSlug },
  );
}

export async function getSupplierPurchases(
  tenantSlug: string,
  id: string,
  params: { page: number; limit?: number; branchId?: string },
): Promise<PagedList<SupplierPurchaseRow>> {
  const q = pagedQuery(params);
  return jsonFetch<PagedList<SupplierPurchaseRow>>(
    `${SUPPLIERS_PREFIX}/${id}/purchases?${q}`,
    { method: "GET", tenantSlug },
  );
}

export async function getSupplierStatement(
  tenantSlug: string,
  id: string,
  params: {
    page: number;
    limit?: number;
    from?: string;
    to?: string;
    branchId?: string;
  },
): Promise<SupplierStatement> {
  const q = pagedQuery(params);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return jsonFetch<SupplierStatement>(
    `${SUPPLIERS_PREFIX}/${id}/statement?${q}`,
    { method: "GET", tenantSlug },
  );
}

export async function getSupplierPriceHistory(
  tenantSlug: string,
  id: string,
  params: {
    page: number;
    limit?: number;
    productId?: string;
    from?: string;
    to?: string;
    branchId?: string;
  },
): Promise<SupplierPriceHistory> {
  const q = pagedQuery(params);
  if (params.productId?.trim()) q.set("productId", params.productId.trim());
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return jsonFetch<SupplierPriceHistory>(
    `${SUPPLIERS_PREFIX}/${id}/price-history?${q}`,
    { method: "GET", tenantSlug },
  );
}

export async function createSupplier(
  tenantSlug: string,
  input: CreateSupplierInput,
): Promise<Supplier> {
  return jsonFetch<Supplier>(SUPPLIERS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function getProductsBySupplierReport(
  tenantSlug: string,
  params: {
    page: number;
    limit?: number;
    branchId?: string;
    supplierId?: string;
    q?: string;
    supplierType?: SupplierType;
    active?: boolean;
  },
): Promise<PagedList<ProductsBySupplierReportRow>> {
  const q = supplierReportQuery(params);
  return jsonFetch<PagedList<ProductsBySupplierReportRow>>(
    `${SUPPLIERS_PREFIX}/reports/products-by-supplier?${q}`,
    { method: "GET", tenantSlug },
  );
}

export async function getPurchasesBySupplierReport(
  tenantSlug: string,
  params: {
    page: number;
    limit?: number;
    branchId?: string;
    supplierId?: string;
    q?: string;
    supplierType?: SupplierType;
    active?: boolean;
    from?: string;
    to?: string;
  },
): Promise<PagedList<PurchasesBySupplierReportRow>> {
  const q = supplierReportQuery(params);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return jsonFetch<PagedList<PurchasesBySupplierReportRow>>(
    `${SUPPLIERS_PREFIX}/reports/purchases-by-supplier?${q}`,
    { method: "GET", tenantSlug },
  );
}

export async function getTopSuppliersBySpendReport(
  tenantSlug: string,
  params: {
    page: number;
    limit?: number;
    branchId?: string;
    supplierId?: string;
    q?: string;
    supplierType?: SupplierType;
    active?: boolean;
    from?: string;
    to?: string;
  },
): Promise<PagedList<TopSupplierSpendReportRow>> {
  const q = supplierReportQuery(params);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return jsonFetch<PagedList<TopSupplierSpendReportRow>>(
    `${SUPPLIERS_PREFIX}/reports/top-by-spend?${q}`,
    { method: "GET", tenantSlug },
  );
}

function pagedQuery(params: {
  page: number;
  limit?: number;
  branchId?: string;
}) {
  const q = new URLSearchParams({
    page: String(Math.max(1, params.page)),
    limit: String(Math.max(1, params.limit ?? 25)),
  });
  if (params.branchId) q.set("branchId", params.branchId);
  return q;
}

function supplierReportQuery(params: {
  page: number;
  limit?: number;
  branchId?: string;
  supplierId?: string;
  q?: string;
  supplierType?: SupplierType;
  active?: boolean;
}) {
  const q = pagedQuery(params);
  if (params.supplierId?.trim()) q.set("supplierId", params.supplierId.trim());
  if (params.q?.trim()) q.set("q", params.q.trim());
  if (params.supplierType) q.set("supplierType", params.supplierType);
  if (params.active !== undefined) q.set("active", String(params.active));
  return q;
}

export async function updateSupplier(
  tenantSlug: string,
  id: string,
  input: UpdateSupplierInput,
): Promise<Supplier | null> {
  return jsonFetch<Supplier | null>(`${SUPPLIERS_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteSupplier(
  tenantSlug: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return jsonFetch<{ deleted: boolean }>(`${SUPPLIERS_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

