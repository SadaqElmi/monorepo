/** Domain / catalog models shared across apps */
export type ProductModel = {
  id: string;
  sku?: string | null;
  name: string;
  categoryId?: string | null;
  listPrice?: number | null;
};

export type InvoiceLineModel = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceModel = {
  id: string;
  invoiceNumber: string;
  customerId?: string | null;
  lines: InvoiceLineModel[];
  subTotal: number;
  tax: number;
  discount: number;
  total: number;
};

/** API-aligned types (Nest + JSON) */
export type Category = {
  id: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  branchId?: string | null;
  parentId?: string | null;
  createdAt?: string;
};

export type Product = {
  id: string;
  name: string;
  genericName?: string | null;
  sku?: string | null;
  listPrice?: number | string | null;
  branchId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  category?: Category | null;
  strength?: string | null;
  formulation?: string | null;
  unit?: string | null;
  description?: string | null;
  createdAt?: string;
  availableStock?: number;
};

export type Batch = {
  id: string;
  product_id: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number | null;
  cost_price: number | null;
  selling_price: number | null;
  created_at?: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  branch_id: string | null;
  product_id: string | null;
  batch_id: string | null;
  quantity: number | null;
  price: number | string | null;
  total: number | string | null;
  /** POS manual charge type when `product_id` is null (Member / Delivery / Tailor). */
  misc_charge_kind?: string | null;
};

export type Sale = {
  id: string;
  branch_id: string | null;
  receipt_number?: string | null;
  total_amount: number | string | null;
  discount: number | string | null;
  tax: number | string | null;
  sale_date: string | null;
  /** Primary payment method code (from `payments.method` when stored). */
  payment_method?: string | null;
  items?: SaleItem[];
};

/** VAT rate for cart totals — standalone POS and ERP POS must match the API discount/tax fields. */
export const POS_TAX_RATE = 0.05;

/** Default cart discount before cashier edits (standalone POS default). */
export const POS_DEFAULT_DISCOUNT = 0;

/** Display labels for payment method codes sent to `POST /api/sales`. */
export const POS_PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  evc: "EVC",
  edahab: "E-Dahab",
  "merchant-evc": "Merchant EVC",
  "merchant-edahab": "Merchant E-Dahab",
  banks: "Banks",
  "primary-wallet": "Primary Wallet",
  "member-points": "Member Points",
  voucher: "Voucher",
  "My Cash": "My Cash",
  Ebesa: "Ebesa",
  "My Bank": "My Bank",
  "T-plus": "T-plus",
  "Yeel App": "Yeel App",
  Refund: "Refund",
};

/** Button order on the register payment step (same as `apps/pos`). */
export const POS_PAYMENT_METHOD_IDS = [
  "cash",
  "evc",
  "edahab",
  "merchant-evc",
  "merchant-edahab",
  "banks",
  "primary-wallet",
  "member-points",
  "My Cash",
  "Ebesa",
  "My Bank",
  "T-plus",
  "Yeel App",
  "Refund",
] as const;

/** Misc charges accepted by `POST /api/sales` (revenue lines). Member card is POS-only until points. */
export type PosBillableMiscChargeKind = "delivery" | "tailor";

export type CreateSaleInput = {
  branchId?: string;
  totalAmount?: number;
  discount?: number;
  tax?: number;
  paymentMethod?: string;
  /** Open POS shift session id (required for register sales once shift workflow is enabled). */
  posSessionId?: string;
  items: Array<{
    productId?: string;
    miscChargeKind?: PosBillableMiscChargeKind;
    quantity: number;
    price?: number;
  }>;
};

export type UpdateSaleInput = {
  branchId?: string;
  totalAmount?: number;
  discount?: number;
  tax?: number;
};

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

export type UnitType = "PC" | "Box" | "Ctn" | "router";

/** POS receipt / local transaction record */
export type PosTransactionLine = {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  unitType: UnitType;
};

export type PosTransaction = {
  receiptId: string;
  saleId?: string;
  createdAt: number;
  paymentMethod: string;
  lines: PosTransactionLine[];
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  /** Amount the customer tendered at checkout (from payment keypad). Change = amountTendered − total when overpaying. */
  amountTendered?: number;
  /** Overpayment to return; stored at checkout for receipt (avoids display issues if totals are re-read as strings). */
  changeDue?: number;
};
/** Register manual charge keys (includes member card for future points — not posted to sales API yet). */
export type PosMiscChargeKind = "member_card" | "delivery" | "tailor";

/** Display / receipt labels for `misc_charge_kind` / POS cart (align with register). */
export const POS_MISC_CHARGE_LINE_LABELS: Record<PosMiscChargeKind, string> = {
  member_card: "Member card",
  delivery: "Delivery charge",
  tailor: "Tailor Service",
};

export type PosCartLine = {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  listUnitPrice?: number;
  qty: number;
  unitType: UnitType;
  /** Free-form note attached to the line via the Comment action. */
  comment?: string;
  /** Per-line discount percent (0..100) applied via the Line Discount % action. */
  lineDiscountPct?: number;
  /** Manual charge from Member card / Delivery / Tailor keys (see PosMiscChargeKind). */
  miscChargeKind?: PosMiscChargeKind;
};

export type PosHeldOrder = {
  id: string;
  /** Local receipt-like ID for held/suspended carts (00001, 00002, …). */
  receiptId?: string;
  label: string;
  createdAt: number;
  lines: PosCartLine[];
  /** Whether the synthetic VAT line should be shown when recalling this held order. */
  showVatLine?: boolean;
};

/** Nest list endpoints return this shape when the `page` query parameter is present. */
export type PagedList<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
