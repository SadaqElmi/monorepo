export type ErpNavChild = { label: string; href: string };

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
      { label: "Customers", href: "/customers" },
      { label: "Patient loans", href: "/customers/patient-loans" },
    ],
  },

  {
    id: "inventory",
    label: "Inventory",
    children: [
      { label: "Items", href: "/items" },
      { label: "Items by location", href: "/items-locations" },
      { label: "Products", href: "/inventory/products" },
      { label: "Stock", href: "/inventory/stock" },
      { label: "Batches", href: "/inventory/batches" },
      { label: "Categories", href: "/inventory/categories" },
      { label: "Branches", href: "/inventory/branches" },
      { label: "Stock transfers", href: "/inventory/transfers" },
      { label: "Incoming transfers", href: "/inventory/transfers/incoming" },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    children: [
      { label: "Dashboard", href: "/accounting" },
      { label: "Control Center", href: "/accounting/control-center" },
      { label: "Reconciliation", href: "/reconciliation" },
    ],
  },

  {
    id: "configuration",
    label: "Configuration",
    children: [
      { label: "Staff & users", href: "/configuration/staff" },
      { label: "Roles", href: "/configuration/roles" },
    ],
  },
];

export const ADMIN_ERP_NAV_MODULES: ErpNavModule[] = [
  {
    id: "admin",
    label: "Admin",
    children: [{ label: "Overview", href: "/admin" }],
  },
  {
    id: "clients",
    label: "Clients & domains",
    children: [
      { label: "Clients", href: "/tenants" },
      { label: "Domains", href: "/domains" },
    ],
  },
  {
    id: "users",
    label: "Users & staff",
    children: [
      { label: "System users", href: "/system-users" },
      { label: "Staff & roles", href: "/admin/staff" },
    ],
  },
  {
    id: "system",
    label: "System",
    children: [
      { label: "Notifications", href: "/notifications" },
      { label: "Reports (coming soon)", href: "/reports" },
    ],
  },
];

export type ErpNavUserFilter = {
  userType?: "system" | "tenant" | "admin" | "pharmacy";
  role?: string;
};

export function filterErpNavModulesForUser(
  filter: ErpNavUserFilter,
): ErpNavModule[] {
  const isAdmin = filter.userType === "system" || filter.userType === "admin";
  if (isAdmin) {
    return ADMIN_ERP_NAV_MODULES;
  }
  const isCashier = filter.role?.toLowerCase() === "cashier";
  if (isCashier) {
    return ERP_NAV_MODULES.filter((m) => m.id === "pos");
  }
  return ERP_NAV_MODULES;
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
