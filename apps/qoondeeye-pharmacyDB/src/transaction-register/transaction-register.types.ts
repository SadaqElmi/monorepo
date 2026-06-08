export type TransactionRegisterType = 'sale' | 'refund';

export type RefundStatus = 'none' | 'partial' | 'full';

export type TransactionRegisterListRow = {
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

export type TransactionRegisterDetail = TransactionRegisterListRow & {
  items: TransactionRegisterItemRow[];
  payments: TransactionRegisterPaymentRow[];
  payment_summary: string;
  profit: number;
  created_by: { user_id: string | null; name: string | null; staff_code: string | null } | null;
  refunded_by: { user_id: string | null; name: string | null; staff_code: string | null } | null;
  manager_override: string | null;
  linked_sale_register_id: string | null;
  linked_returns: Array<{
    register_id: string;
    transaction_no: string;
    net_amount: number;
    return_date: string;
  }>;
};

export type TransactionRegisterQuery = {
  branchIds: string[];
  page: number;
  limit: number;
  skip: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  terminalId?: string | null;
  staffId?: string | null;
  receiptNo?: string | null;
  transactionNo?: string | null;
  customerId?: string | null;
  customerQ?: string | null;
  transactionType?: TransactionRegisterType | null;
  refundStatus?: RefundStatus | null;
  statementId?: string | null;
  managerId?: string | null;
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc';
};
