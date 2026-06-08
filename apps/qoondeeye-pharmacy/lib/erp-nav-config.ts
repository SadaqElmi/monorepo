import { getEffectivePermissions } from "./permissions";

export type ErpNavChild = {
  label: string;
  href: string;
  permission?: string;
};

export type ErpNavModule = {
  id: string;
  label: string;
  children: ErpNavChild[];
};

/** Canonical pharmacy top navigation (matches reorganized App Router paths). */
export const ERP_NAV_MODULES: ErpNavModule[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    children: [{ label: "Overview", href: "/dashboard" }],
  },
  {
    id: "pos",
    label: "POS",
    children: [{ label: "Point of sale", href: "/pos" }],
  },
  {
    id: "customers",
    label: "Customers",
    children: [
      { label: "Invoices", href: "/customers/invoices" },
      { label: "Credit notes", href: "/customers/credit-notes" },
      { label: "Payments", href: "/customers/customer-payments" },
      { label: "Customers", href: "/customers", permission: "view_customers" },
      { label: "Patient loans", href: "/customers/patient-loans" },
    ],
  },
  {
    id: "vendors",
    label: "Vendors",
    children: [
      {
        label: "Bills",
        href: "/vendors/bills",
        permission: "view_purchases",
      },
      {
        label: "Vendors",
        href: "/vendors/suppliers",
        permission: "view_suppliers",
      },
      {
        label: "Purchase Orders",
        href: "/vendors/bills/new",
        permission: "create_purchase",
      },
      {
        label: "Refunds",
        href: "/vendors/returns",
      },
      {
        label: "Payments",
        href: "/vendors/supplier-payments",
      },
      { label: "Employee Expenses", href: "/vendors/expenses", permission: "view_expenses" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    children: [
      { label: "Items", href: "/items" },
      { label: "Items by location", href: "/items-locations" },
      { label: "Products", href: "/inventory/products", permission: "view_products" },
      { label: "Import products", href: "/inventory/products/import", permission: "import_products" },
      {
        label: "Opening stock import",
        href: "/inventory/opening-stock/import",
        permission: "import_opening_stock",
      },
      { label: "Import history", href: "/inventory/products/import/history" },
      { label: "Inventory history", href: "/inventory/history" },
      { label: "Batches", href: "/inventory/batches" },
      { label: "Categories", href: "/inventory/categories", permission: "view_products" },
      { label: "Branches", href: "/inventory/branches", permission: "edit_branch" },
      { label: "Stock transfers", href: "/inventory/transfers", permission: "transfer_inventory" },
      { label: "Incoming transfers", href: "/inventory/transfers/incoming", permission: "transfer_inventory" },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    children: [
      {
        label: "Offer Lists",
        href: "/sales/offer-lists",
        permission: "manage_offers",
      },
      {
        label: "Pricing Management",
        href: "/sales/pricing-management",
        permission: "manage_pricing",
      },
      {
        label: "Price Groups",
        href: "/sales/price-groups",
        permission: "manage_price_groups",
      },
      { label: "Units of Measure", href: "/sales/uoms", permission: "edit_product" },
      {
        label: "Transaction Register",
        href: "/sales/transaction-register",
        permission: "view_transaction_register",
      },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    children: [
      { label: "Dashboard", href: "/accounting", permission: "view_reports" },
      { label: "Control Center", href: "/accounting/control-center", permission: "manage_accounting_configuration" },
      { label: "Reconciliation", href: "/reconciliation", permission: "view_reports" },
    ],
  },

  {
    id: "administration",
    label: "Administration",
    children: [
      {
        label: "Import Center",
        href: "/administration/import-center",
        permission: "view_import_center",
      },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    children: [
      {
        label: "Staff & users",
        href: "/configuration/staff",
        permission: "view_staff",
      },
      {
        label: "Roles",
        href: "/configuration/roles",
        permission: "view_roles",
      },
    ],
  },
];

export type ErpNavUserFilter = {
  userType?: "system" | "tenant" | "admin" | "pharmacy";
  role?: string;
  permissions?: string[];
};

export function filterErpNavModulesForUser(
  filter: ErpNavUserFilter,
): ErpNavModule[] {
  const isSystemUser =
    filter.userType === "system" || filter.userType === "admin";
  if (isSystemUser) {
    return [];
  }
  const isCashier = filter.role?.toLowerCase() === "cashier";
  const base = isCashier
    ? ERP_NAV_MODULES.filter((m) => m.id === "pos")
    : ERP_NAV_MODULES;

  const isAdmin = filter.role?.toLowerCase() === "admin";
  const perms = getEffectivePermissions(filter.permissions ?? []);

  return base
    .map((mod) => ({
      ...mod,
      children: mod.children.filter((c) => {
        if (!c.permission) return true;
        if (isAdmin) return true;
        if (!perms.size) return false;
        return perms.has(c.permission);
      }),
    }))
    .filter((mod) => mod.children.length > 0);
}

/** Longest matching child href wins (e.g. /accounting/reports/x beats /accounting). */
export function getActiveErpModule(
  pathname: string,
  modules: ErpNavModule[],
): ErpNavModule | null {
  let best: { mod: ErpNavModule; len: number } | null = null;
  for (const mod of modules) {
    for (const c of mod.children) {
      const href = c.href;
      const exact = pathname === href;
      const nested = pathname.startsWith(`${href}/`);
      if (exact || nested) {
        const len = href.length;
        if (!best || len > best.len) {
          best = { mod, len };
        }
      }
    }
  }
  return best?.mod ?? null;
}

/** Sub-nav items for a module id (pharmacy shell only). */
export function getErpModuleChildren(moduleId: string): ErpNavChild[] {
  const mod = ERP_NAV_MODULES.find((m) => m.id === moduleId);
  return mod?.children ?? [];
}
