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
      { label: "Tenant owners", href: "/tenant-owners" },
      { label: "Domains", href: "/domains" },
    ],
  },
  {
    id: "users",
    label: "Platform access",
    children: [{ label: "System users", href: "/system-users" }],
  },
  {
    id: "audit",
    label: "Audit",
    children: [{ label: "Admin audit logs", href: "/audit-logs" }],
  },
  {
    id: "retail",
    label: "Retail",
    children: [{ label: "Retail operations", href: "/retail-ops" }],
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
