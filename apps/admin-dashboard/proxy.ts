import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

function isSystemUser(payload: AuthPayload | null): boolean {
  if (!payload) return false;
  if (payload.userType === "system") return true;
  return payload.role?.toLowerCase() === "super_admin";
}

const protectedPrefixes = [
  "/admin",
  "/tenants",
  "/tenant-owners",
  "/domains",
  "/system-users",
  "/notifications",
  "/audit-logs",
  "/reports",
  "/retail-ops",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;
    const payload = getAuthPayload(request);
    if (token && isSystemUser(payload)) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;
  const payload = getAuthPayload(request);

  if (!token || !payload || !isSystemUser(payload)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/admin/:path*",
    "/tenants/:path*",
    "/tenant-owners/:path*",
    "/domains/:path*",
    "/system-users/:path*",
    "/notifications/:path*",
    "/audit-logs/:path*",
    "/reports/:path*",
  ],
};
