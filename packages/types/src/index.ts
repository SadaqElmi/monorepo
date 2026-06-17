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
  itemNo?: string | null;
  name: string;
  genericName?: string | null;
  sku?: string | null;
  listPrice?: number | string | null;
  branchId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  category?: Category | null;
  supplierId?: string | null;
  supplierName?: string | null;
  strength?: string | null;
  formulation?: string | null;
  unit?: string | null;
  description?: string | null;
  createdAt?: string;
  availableStock?: number;
  uoms?: ProductUom[];
  uomId?: string | null;
  uomCode?: string | null;
  uomName?: string | null;
  uomSymbol?: string | null;
  conversionFactorToBase?: number | string | null;
  uomSellingPrice?: number | string | null;
  uomCostPrice?: number | string | null;
  matchedBarcode?: string | null;
};

export type Uom = {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  active?: boolean;
};

export type ProductUom = {
  id: string;
  productId: string;
  uomId: string;
  code: string;
  name: string;
  symbol?: string | null;
  conversionFactorToBase: number | string;
  isBase: boolean;
  isPurchaseDefault: boolean;
  isSalesDefault: boolean;
  isPosDefault: boolean;
  isActive: boolean;
  sellingPrice?: number | string | null;
  costPrice?: number | string | null;
  initialCostPrice?: number | string | null;
  lastPurchaseCost?: number | string | null;
  lastPurchaseAt?: string | null;
  barcodes?: string[];
};

export type ProductUomSetupInput = {
  code: string;
  conversionFactorToBase?: number;
  isBase?: boolean;
  isPurchaseDefault?: boolean;
  isSalesDefault?: boolean;
  isPosDefault?: boolean;
  sellingPrice?: number | null;
  costPrice?: number | null;
};

export type PriceGroup = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductPriceGroupPrice = {
  id: string;
  productId: string;
  uomId: string;
  priceGroupId: string;
  sellingPrice: number | string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductPriceHistory = {
  id: string;
  productId: string;
  productName?: string | null;
  uomId?: string | null;
  uomCode?: string | null;
  priceGroupId?: string | null;
  priceGroupCode?: string | null;
  oldSellingPrice?: number | string | null;
  newSellingPrice?: number | string | null;
  oldCostPrice?: number | string | null;
  newCostPrice?: number | string | null;
  changeReason?: string | null;
  source: string;
  actorUserId?: string | null;
  createdAt?: string;
};

export type OfferRule = {
  id?: string;
  offerId?: string;
  productId?: string | null;
  productName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  minQuantity?: number | string | null;
  buyQuantity?: number | string | null;
  getQuantity?: number | string | null;
  specialPrice?: number | string | null;
  bundleProductIds?: unknown;
  createdAt?: string;
};

export type OfferList = {
  id: string;
  no: string;
  description: string;
  status: "enabled" | "disabled";
  priceGroupId?: string | null;
  priceGroupCode?: string | null;
  priority: number;
  validationPeriodId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  offerType: string;
  discountType: string;
  discountValue: number | string;
  applyTo: string;
  branchScope: string;
  stackingEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  rules?: OfferRule[];
};

export type ResolvedOffer = {
  offerId: string;
  no: string;
  description: string;
  offerType: string;
  discountType: string;
  discountValue: number;
  priority: number;
  priceGroupId?: string | null;
  ruleId?: string | null;
  unitPrice: number;
  unitDiscount: number;
  discountAmount: number;
  finalUnitPrice: number;
  stackingEnabled: boolean;
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
  uom_id?: string | null;
  uom_code?: string | null;
  entered_quantity?: number | string | null;
  conversion_factor_snapshot?: number | string | null;
  base_quantity?: number | string | null;
  price: number | string | null;
  total: number | string | null;
  /** POS manual charge type when `product_id` is null (Member / Delivery / Tailor). */
  misc_charge_kind?: string | null;
  price_group_id?: string | null;
  offer_id?: string | null;
  line_discount?: number | string | null;
  discount_source?: string | null;
};

export type Sale = {
  id: string;
  branch_id: string | null;
  receipt_number?: string | null;
  total_amount: number | string | null;
  discount: number | string | null;
  tax: number | string | null;
  sale_date: string | null;
  customer_id?: string | null;
  on_account?: boolean;
  customer_name?: string | null;
  /** Primary payment method code (from `payments.method` when stored). */
  payment_method?: string | null;
  /** Branch code (store number) when returned from list/detail APIs. */
  store_no?: string | null;
  /** POS device code when returned from list/detail APIs. */
  terminal_no?: string | null;
  items?: SaleItem[];
};

/** VAT rate for cart totals — standalone POS and ERP POS must match the API discount/tax fields. */
export const POS_TAX_RATE = 0.05;

/** Default cart discount before cashier edits (standalone POS default). */
export const POS_DEFAULT_DISCOUNT = 0;

/** Display labels for payment method codes sent to `POST /api/sales`. */
export const POS_PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  "customer-credit": "Customer Credit",
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
  "customer-credit",
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
  onAccount?: boolean;
  customerId?: string;
  creditOverride?: { managerUserId: string; reason: string };
  /** Open POS shift session id (required for register sales once shift workflow is enabled). */
  posSessionId?: string;
  /** Client-generated UUID for offline sync deduplication. */
  clientSaleRef?: string;
  /** `online` (default) or `offline` when replayed from POS outbox. */
  syncSource?: "online" | "offline";
  /** Approved supervisor request when discount exceeds role cap. */
  discountApprovalId?: string;
  items: Array<{
    productId?: string;
    uomId?: string;
    miscChargeKind?: PosBillableMiscChargeKind;
    quantity: number;
    price?: number;
    priceGroupId?: string;
    offerId?: string;
    lineDiscount?: number;
    discountSource?: string;
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
  uom_id?: string | null;
  entered_quantity?: number | string | null;
  conversion_factor_snapshot?: number | string | null;
  base_quantity?: number | string | null;
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
  uomId?: string | null;
  enteredQuantity?: number | string | null;
  conversionFactorSnapshot?: number | string | null;
  baseQuantity?: number | string | null;
  unitPrice?: number | string;
  token: string;
  status: string;
  barcodeValue?: string;
};

export type UnitType = string;

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
  /** Client UUID for offline sync deduplication. */
  clientSaleRef?: string;
  /** Set when the sale was voided on the server. */
  voided?: boolean;
  createdAt: number;
  paymentMethod: string;
  lines: PosTransactionLine[];
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  /** Branch code (store number). */
  storeNo?: string | null;
  /** POS terminal device code. */
  terminalNo?: string | null;
  customerId?: string;
  customerName?: string;
  onAccount?: boolean;
  outstandingAfterSale?: number;
  /** Amount the customer tendered at checkout (from payment keypad). Change = amountTendered − total when overpaying. */
  amountTendered?: number;
  /** Overpayment to return; stored at checkout for receipt (avoids display issues if totals are re-read as strings). */
  changeDue?: number;
};

export type CustomerCreditSummary = {
  customerId: string;
  customerName: string | null;
  customerNo: string | null;
  phone: string | null;
  creditLimit: number | null;
  creditStatus: string;
  isActive: boolean;
  outstandingBalance: number;
  availableCredit: number | null;
  totalSales: number;
  creditSalesCount: number;
  creditSalesTotal: number;
  repaymentsTotal: number;
  lastPaymentDate: string | null;
};

export type CustomerLoanHistoryRow = {
  saleId: string;
  receiptNumber: string | null;
  saleDate: string;
  originalAmount: number;
  paidAmount: number;
  remainingBalance: number;
  dueDate: string | null;
  status: "open" | "partial" | "paid" | "overdue";
};

export type CustomerSummary = {
  id: string;
  name: string | null;
  phone: string | null;
  address?: string | null;
  customer_no?: string | null;
  credit_limit?: number | null;
  credit_status?: string;
  is_active?: boolean;
  member_card_no?: string | null;
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
  uomId?: string;
  uomCode?: string;
  uomSymbol?: string;
  conversionFactorToBase?: number;
  baseQty?: number;
  /** Free-form note attached to the line via the Comment action. */
  comment?: string;
  /** Per-line discount percent (0..100) applied via the Line Discount % action. */
  lineDiscountPct?: number;
  priceGroupId?: string;
  offerId?: string;
  lineDiscount?: number;
  discountSource?: string;
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

export type TransactionRegisterType = "sale" | "refund";

export type RefundStatus = "none" | "partial" | "full";

export type TransactionRegisterRow = {
  register_id: string;
  transaction_no: string;
  receipt_no: string | null;
  member_card_no: string | null;
  pos_receipt_no: string | null;
  transaction_type: TransactionRegisterType;
  store_no: string | null;
  branch_id: string;
  terminal_id: string | null;
  terminal_no: string | null;
  staff_id: string | null;
  staff_code: string | null;
  staff_name: string | null;
  transaction_at: string;
  customer_id: string | null;
  customer_no: string | null;
  customer_name: string | null;
  customer_order_id: string | null;
  sales_type: string;
  payment_method: string | null;
  gross_amount: number;
  net_amount: number;
  payment_amount: number;
  discount_amount: number;
  cost_amount: number;
  manager_id: string | null;
  statement_no: string | null;
  posted_statement_no: string | null;
  refund_status: RefundStatus | null;
  sale_id: string | null;
};

export type TransactionRegisterItemRow = {
  item_no: string | null;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  uom_code: string | null;
  uom_symbol: string | null;
  unit_price: number;
  discount: number;
  net_amount: number;
};

export type TransactionRegisterPaymentRow = {
  method: string;
  amount: number;
  bucket: string;
};

export type TransactionRegisterDetail = TransactionRegisterRow & {
  items: TransactionRegisterItemRow[];
  payments: TransactionRegisterPaymentRow[];
  payment_summary: string;
  profit: number;
  created_by: {
    user_id: string | null;
    name: string | null;
    staff_code: string | null;
  } | null;
  refunded_by: {
    user_id: string | null;
    name: string | null;
    staff_code: string | null;
  } | null;
  manager_override: string | null;
  linked_sale_register_id: string | null;
  linked_returns: Array<{
    register_id: string;
    transaction_no: string;
    net_amount: number;
    return_date: string;
  }>;
};

export type TransactionRegisterListQuery = {
  page: number;
  limit: number;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  terminal_id?: string;
  staff_id?: string;
  receipt_no?: string;
  transaction_no?: string;
  customer_id?: string;
  customer_q?: string;
  transaction_type?: TransactionRegisterType;
  refund_status?: RefundStatus;
  statement_id?: string;
  manager_id?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
};
