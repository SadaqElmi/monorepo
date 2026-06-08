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
  configuration: {
    staff: "/configuration/staff",
    roles: "/configuration/roles",
  },
  accounting: {
    root: "/accounting",
    monitoring: "/accounting/monitoring",
    controlCenter: "/accounting/control-center",
    importCenter: "/administration/import-center",
    posStatement: "/accounting/pos-statement",
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
