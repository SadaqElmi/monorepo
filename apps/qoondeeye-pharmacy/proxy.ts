import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAdminDashboardUrl } from "@/lib/admin-dashboard-url";
import { getPosAppUrl } from "@/lib/pos-app-url";

const AUTH_USER_COOKIE = "auth_user";
const AUTH_TOKEN_KEY = "auth_token";

type AuthPayload = {
  userType?: "system" | "tenant";
  role?: string;
};

function getAuthPayload(request: NextRequest): AuthPayload | null {
  const raw = request.cookies.get(AUTH_USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as AuthPayload;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/register") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Legacy /pos path — redirect to standalone POS app
  if (pathname === "/pos" || pathname.startsWith("/pos/")) {
    return NextResponse.redirect(getPosAppUrl());
  }

  if (pathname === "/login" || pathname === "/system-login") {
    const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;
    if (token) {
      const payload = getAuthPayload(request);
      if (payload?.userType === "system") {
        return NextResponse.redirect(getAdminDashboardUrl("/admin"));
      }
      if (payload?.userType === "tenant") {
        if (payload.role?.toLowerCase() === "cashier") {
          return NextResponse.redirect(getPosAppUrl());
        }
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;
  const payload = getAuthPayload(request);

  if (!token || !payload) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  const adminDashboardPaths = [
    "/admin",
    "/tenants",
    "/domains",
    "/system-users",
    "/reports",
  ];
  const isAdminDashboardPath = adminDashboardPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isAdminDashboardPath) {
    return NextResponse.redirect(getAdminDashboardUrl(pathname));
  }

  if (
    pathname === "/notifications" &&
    (payload.userType === "system" || payload.role === "super_admin")
  ) {
    return NextResponse.redirect(getAdminDashboardUrl("/notifications"));
  }

  const tenantPaths = [
    "/dashboard",
    "/staff",
    "/products",
    "/categories",
    "/inventory",
    "/batches",
    "/branches",
    "/sales",
    "/returns",
    "/sale-returns",
    "/customers",
    "/suppliers",
    "/purchases",
    "/expenses",
    "/expense-categories",
    "/vendors",
    "/configuration",
    "/accounting",
    "/chart-of-accounts",
    "/patient-loans",
    "/notifications",
    "/roles",
  ];
  const isTenantPath = tenantPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (isTenantPath) {
    if (payload.userType === "tenant" && payload.role?.toLowerCase() === "cashier") {
      return NextResponse.redirect(getPosAppUrl());
    }
    if (payload.userType !== "tenant" && payload.role === "super_admin") {
      return NextResponse.redirect(getAdminDashboardUrl("/admin"));
    }
    if (payload.userType !== "tenant" && payload.userType !== "system") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/tenants",
    "/tenants/:path*",
    "/domains",
    "/domains/:path*",
    "/system-users",
    "/system-users/:path*",
    "/reports",
    "/reports/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/staff",
    "/staff/:path*",
    "/products",
    "/products/:path*",
    "/categories",
    "/categories/:path*",
    "/inventory",
    "/inventory/:path*",
    "/batches",
    "/batches/:path*",
    "/branches",
    "/branches/:path*",
    "/sales",
    "/sales/:path*",
    "/returns",
    "/returns/:path*",
    "/sale-returns",
    "/sale-returns/:path*",
    "/customers",
    "/customers/:path*",
    "/suppliers",
    "/suppliers/:path*",
    "/purchases",
    "/purchases/:path*",
    "/expenses",
    "/expenses/:path*",
    "/expense-categories",
    "/expense-categories/:path*",
    "/vendors",
    "/vendors/:path*",
    "/configuration",
    "/configuration/:path*",
    "/accounting",
    "/accounting/:path*",
    "/chart-of-accounts",
    "/chart-of-accounts/:path*",
    "/patient-loans",
    "/patient-loans/:path*",
    "/notifications",
    "/notifications/:path*",
    "/roles",
    "/roles/:path*",
    "/pos",
    "/pos/:path*",
    "/login",
    "/register",
    "/system-login",
  ],
};
