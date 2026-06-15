"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart2,
  Boxes,
  GalleryVerticalEnd,
  Globe2,
  LayoutDashboard,
  Package2,
  Settings2,
  ShoppingCart,
  Stethoscope,
  Truck,
  Users2,
  Warehouse,
  TruckIcon,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import { clearAuthToken, getStoredUser } from "@/lib/auth-client";
import { prefetchErpSidebarHints } from "@/lib/erp-query-prefetch";
import { ROUTES } from "@/lib/routes";

const pharmacyNavMain = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    isActive: true,
  },
  {
    title: "Point of sale",
    url: "/pos",
    icon: ShoppingCart,
    isActive: true,
  },
  {
    title: "Products",
    url: "/inventory/products",
    icon: Boxes,
    items: [
      { title: "Products", url: "/inventory/products" },
      { title: "Categories", url: "/inventory/categories" },
    ],
  },
  {
    title: "Inventory",
    url: "/items",
    icon: Warehouse,
    items: [
      { title: "Items", url: "/items" },
      { title: "Inventory history", url: "/inventory/history" },
      { title: "Batches", url: "/inventory/batches" },
      { title: "Branches", url: "/inventory/branches" },
    ],
  },
  {
    title: "Purchasing",
    url: ROUTES.vendors.bills,
    icon: Truck,
    items: [
      { title: "Bills", url: ROUTES.vendors.bills },
      { title: "Returns", url: ROUTES.vendors.returns },
      { title: "Suppliers", url: ROUTES.vendors.suppliers },
    ],
  },
  {
    title: "Users",
    url: ROUTES.users.staff,
    icon: Users2,
    items: [
      { title: "Staff & users", url: ROUTES.users.staff },
      { title: "Roles", url: ROUTES.users.roles },
    ],
  },
  {
    title: "Configuration",
    url: ROUTES.configuration.posTerminals,
    icon: Settings2,
    items: [
      { title: "POS Terminals", url: ROUTES.configuration.posTerminals },
      { title: "POS Devices", url: ROUTES.configuration.posDevices },
      { title: "POS Security", url: ROUTES.configuration.posSecurity },
      { title: "Operations center", url: ROUTES.configuration.posCenter },
      { title: "POS approvals", url: ROUTES.configuration.posApprovals },
      { title: "POS analytics", url: ROUTES.configuration.posAnalytics },
      { title: "POS audit log", url: ROUTES.configuration.posAudit },
      { title: "POS shifts", url: ROUTES.configuration.posShifts },
    ],
  },

  {
    title: "Sales & Customers",
    url: "/customers/invoices",
    icon: ShoppingCart,
    items: [
      { title: "Invoices", url: "/customers/invoices" },
      { title: "Credit notes", url: "/customers/credit-notes" },
      { title: "Customers", url: "/customers" },
      { title: "Patient Loans", url: "/customers/patient-loans" },
    ],
  },

  {
    title: "Finance",
    url: "/accounting",
    icon: BarChart2,
    items: [
      { title: "Accounting", url: "/accounting" },
      { title: "Control Center", url: ROUTES.accounting.controlCenter },
      { title: "Monitoring", url: ROUTES.accounting.monitoring },
      { title: "POS statement", url: ROUTES.accounting.posStatement },
      { title: "Audit trail", url: ROUTES.accounting.auditTrail },
      { title: "Cash movements", url: ROUTES.accounting.cashMovements },
      { title: "Expenses", url: ROUTES.vendors.expenses },
      {
        title: "Expense Categories",
        url: ROUTES.vendors.expenseCategories,
      },
    ],
  },
];

const cashierNavMain = [
  {
    title: "Point of sale",
    url: "/pos",
    icon: ShoppingCart,
    isActive: true,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const prefetchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const prefetchSidebarModule = React.useCallback(
    (title: string) => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = setTimeout(() => {
        prefetchErpSidebarHints(queryClient, title);
      }, 300);
    },
    [queryClient],
  );

  React.useEffect(
    () => () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    },
    [],
  );

  const onCollapsibleOpenChange = React.useCallback(
    (title: string, open: boolean) => {
      if (open) prefetchSidebarModule(title);
    },
    [prefetchSidebarModule],
  );
  const [sidebarUser, setSidebarUser] = React.useState<{
    name: string;
    email: string;
    avatar?: string;
    role?: string;
    userType?: "system" | "tenant" | "admin" | "pharmacy";
  }>(() => {
    if (typeof window === "undefined") {
      return { name: "Guest", email: "Sign in" };
    }
    const u = getStoredUser() as {
      name: string | null;
      email?: string;
      role?: string;
      userType?: "system" | "tenant" | "admin" | "pharmacy";
    } | null;
    return u
      ? {
          name: u.name ?? u.email ?? "User",
          email: u.email ?? "",
          role: u.role,
          userType: u.userType,
          avatar: undefined,
        }
      : { name: "Guest", email: "Sign in" };
  });

  React.useEffect(() => {
    const u = getStoredUser() as {
      name: string | null;
      email?: string;
      role?: string;
      userType?: "system" | "tenant" | "admin" | "pharmacy";
    } | null;
    setSidebarUser(
      u
        ? {
            name: u.name ?? u.email ?? "User",
            email: u.email ?? "",
            role: u.role,
            userType: u.userType,
            avatar: undefined,
          }
        : { name: "Guest", email: "Sign in" },
    );
  }, []);

  const handleLogout = React.useCallback(() => {
    clearAuthToken();
    router.push("/login");
  }, [router]);

  const isCashier = sidebarUser.role?.toLowerCase() === "cashier";
  const navMain = isCashier ? cashierNavMain : pharmacyNavMain;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain
          items={navMain}
          prepend={isCashier ? null : <TeamSwitcher />}
          onCollapsiblePointerEnter={prefetchSidebarModule}
          onCollapsibleOpenChange={onCollapsibleOpenChange}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} onLogout={handleLogout} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
