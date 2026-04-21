"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BarChart2,
  Boxes,
  Building2,
  GalleryVerticalEnd,
  Globe2,
  LayoutDashboard,
  Package2,
  PieChart,
  Settings2,
  ShoppingCart,
  ShieldCheck,
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
    url: "/inventory/stock",
    icon: Warehouse,
    items: [
      { title: "Stock", url: "/inventory/stock" },
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
    title: "Staff",
    url: "/configuration/staff",
    icon: Users2,
    items: [
      { title: "Staff & users", url: "/configuration/staff" },
      { title: "Roles", url: "/configuration/roles" },
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

const adminNavMain = [
  {
    title: "Admin control",
    url: "/admin",
    icon: ShieldCheck,
    isActive: true,
    items: [{ title: "Overview", url: "/admin" }],
  },
  {
    title: "Clients & domains",
    url: "/tenants",
    icon: Building2,
    items: [
      { title: "Clients", url: "/tenants" },
      { title: "Domains", url: "/domains" },
    ],
  },
  {
    title: "System users & staff",
    url: "/system-users",
    icon: Users2,
    items: [
      { title: "System users", url: "/system-users" },
      { title: "Staff & roles", url: "/admin/staff" },
    ],
  },
  {
    title: "System",
    url: "/system",
    icon: PieChart,
    items: [
      { title: "Notifications", url: "/notifications" },
      { title: "Reports (coming soon)", url: "/reports" },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
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

  const isAdmin =
    sidebarUser.userType === "system" || sidebarUser.userType === "admin";
  const isCashier = sidebarUser.role?.toLowerCase() === "cashier";
  const navMain = isAdmin
    ? adminNavMain
    : isCashier
      ? cashierNavMain
      : pharmacyNavMain;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain
          items={navMain}
          prepend={isAdmin || isCashier ? null : <TeamSwitcher />}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} onLogout={handleLogout} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
