export const ROUTES = {
  vendors: {
    bills: "/vendors/bills",
    suppliers: "/vendors/suppliers",
    expenses: "/vendors/expenses",
    expenseCategories: "/vendors/expense-categories",
    returns: "/vendors/returns",
  },
  customers: {
    root: "/customers",
    invoices: "/customers/invoices",
    creditNotes: "/customers/credit-notes",
    patientLoans: "/customers/patient-loans",
  },
  inventory: {
    products: "/inventory/products",
    items: "/items",
    history: "/inventory/history",
    batches: "/inventory/batches",
    categories: "/inventory/categories",
    branches: "/inventory/branches",
    transfers: "/inventory/transfers",
    transfersNew: "/inventory/transfers/new",
    transfersIncoming: "/inventory/transfers/incoming",
  },
  sales: {
    offerLists: "/sales/offer-lists",
    pricingManagement: "/sales/pricing-management",
    priceGroups: "/sales/price-groups",
    uoms: "/sales/uoms",
    transactionRegister: "/sales/transaction-register",
  },
  users: {
    staff: "/users/staff",
    roles: "/users/roles",
  },
  configuration: {
    posTerminals: "/configuration/pos-terminals",
    posDevices: "/configuration/pos-devices",
    posSecurity: "/configuration/pos-security",
    posCenter: "/configuration/pos-center",
    posAnalytics: "/configuration/pos-analytics",
    posAudit: "/configuration/pos-audit",
    posShifts: "/configuration/pos-shifts",
    posApprovals: "/operations/pos-approvals",
  },
  accounting: {
    root: "/accounting",
    monitoring: "/accounting/monitoring",
    controlCenter: "/accounting/control-center",
    importCenter: "/administration/import-center",
    auditTrail: "/accounting/audit-trail",
    posStatement: "/accounting/pos-statement",
    cashMovements: "/accounting/cash-movements",
  },
} as const;

export function inventoryTransferDetailPath(
  transferId: string,
  opts?: { receiver?: boolean },
) {
  const base = `${ROUTES.inventory.transfers}/${encodeURIComponent(transferId)}`;
  return opts?.receiver ? `${base}?receiver=1` : base;
}

export function transactionRegisterDetailPath(registerId: string) {
  return `${ROUTES.sales.transactionRegister}/${encodeURIComponent(registerId)}`;
}

export function posStatementPath(opts?: {
  sessionId?: string;
  branchId?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.sessionId) params.set("sessionId", opts.sessionId);
  if (opts?.branchId) params.set("branchId", opts.branchId);
  const qs = params.toString();
  return qs
    ? `${ROUTES.accounting.posStatement}?${qs}`
    : ROUTES.accounting.posStatement;
}

export function posTerminalActivityPath(terminalId: string) {
  return `${ROUTES.configuration.posTerminals}/${encodeURIComponent(terminalId)}`;
}

export function auditTrailPath(opts?: { table?: "pos_auth" }) {
  if (opts?.table === "pos_auth") {
    return `${ROUTES.accounting.auditTrail}?table=pos_auth`;
  }
  return ROUTES.accounting.auditTrail;
}
