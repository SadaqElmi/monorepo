import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_USER_COOKIE = "auth_user";
const AUTH_TOKEN_KEY = "auth_token";

type AuthPayload = {
  userType?: "system" | "tenant";
  role?: string;
  id?: string;
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

/**
 * Edge auth gate for the standalone POS app (cookie parity with qoondeeye-pharmacy proxy).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/staff-login") {
    const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;
    if (token) {
      const payload = getAuthPayload(request);
      if (payload?.id) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_TOKEN_KEY)?.value;
  const payload = getAuthPayload(request);

  if (!token || !payload?.id) {
    const login = new URL("/staff-login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/z-report",
    "/z-report/:path*",
    "/transactions",
    "/transactions/:path*",
    "/suspended",
    "/suspended/:path*",
    "/login",
    "/staff-login",
  ],
};
