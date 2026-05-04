/**
 * Client-side auth helpers. Token and user payload are stored in cookies
 * so middleware can enforce /admin vs /dashboard access.
 */

const AUTH_TOKEN_KEY = "auth_token";
const AUTH_USER_KEY = "auth_user";
const AUTH_USER_COOKIE = "auth_user";
const COOKIE_MAX_AGE_DAYS = 7;

export type StoredUser = {
  id: string;
  /** Empty for some POS staff (cashier role) accounts */
  email?: string;
  /** POS staff ID entered at login (device-bound flow). */
  staffId?: string;
  name: string | null;
  userType?: "system" | "tenant";
  role?: string;
  tenantId?: string | null;
  /** Schema name for X-Tenant header (e.g. pharmacy1) */
  tenantSlug?: string | null;
  assignedBranchId?: string | null;
  allowedBranchIds?: string[];
  canViewAllBranches?: boolean;
  // Allow any extra fields returned by the backend.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

function cookieOptions(maxAge: number) {
  return `path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function setAuthToken(token: string, user: StoredUser) {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${AUTH_TOKEN_KEY}=${encodeURIComponent(token)}; ${cookieOptions(maxAge)}`;
  const payload = {
    userType:
      user.userType ?? (user.role === "super_admin" ? "system" : "tenant"),
    role: user.role ?? "user",
    tenantId: user.tenantId ?? null,
    tenantSlug: user.tenantSlug ?? null,
    assignedBranchId: user.assignedBranchId ?? null,
    allowedBranchIds: Array.isArray(user.allowedBranchIds)
      ? user.allowedBranchIds
      : [],
    canViewAllBranches: Boolean(user.canViewAllBranches),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    id: user.id,
    email: user.email ?? "",
    name: user.name,
    ...(typeof user.staffId === "string" && user.staffId.trim()
      ? { staffId: user.staffId.trim() }
      : {}),
  };
  document.cookie = `${AUTH_USER_COOKIE}=${encodeURIComponent(JSON.stringify(payload))}; ${cookieOptions(maxAge)}`;
  try {
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

export function clearAuthToken() {
  if (typeof document === "undefined") return;
  const zero = "path=/; max-age=0";
  document.cookie = `${AUTH_TOKEN_KEY}=; ${zero}`;
  document.cookie = `${AUTH_USER_COOKIE}=; ${zero}`;
  try {
    sessionStorage.removeItem(AUTH_USER_KEY);
  } catch {
    // ignore
  }
}

export function getStoredUser(): StoredUser | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function parseAuthUserFromDocumentCookie(): AuthCookiePayload | null {
  if (typeof document === "undefined") return null;
  const escaped = AUTH_USER_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`),
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as AuthCookiePayload;
  } catch {
    return null;
  }
}

/**
 * Full session user when available; otherwise reconstructs from `auth_user` cookie
 * (e.g. fresh navigation before sessionStorage is repopulated).
 */
export function getResolvedStoredUser(): StoredUser | null {
  const fromSession = getStoredUser();
  if (fromSession) return fromSession;

  const fromCookie = parseAuthUserFromDocumentCookie();
  if (!fromCookie?.id) return null;

  return {
    id: fromCookie.id,
    email: fromCookie.email?.trim() || undefined,
    name: fromCookie.name ?? fromCookie.email ?? null,
    ...(typeof fromCookie.staffId === "string" && fromCookie.staffId.trim()
      ? { staffId: fromCookie.staffId.trim() }
      : {}),
    userType: fromCookie.userType,
    role: fromCookie.role,
    tenantId: fromCookie.tenantId ?? undefined,
    tenantSlug: fromCookie.tenantSlug ?? null,
    assignedBranchId: fromCookie.assignedBranchId ?? null,
    allowedBranchIds: Array.isArray(fromCookie.allowedBranchIds)
      ? fromCookie.allowedBranchIds
      : [],
    canViewAllBranches: Boolean(fromCookie.canViewAllBranches),
    permissions: Array.isArray(fromCookie.permissions)
      ? fromCookie.permissions
      : [],
  };
}

/** Parsed auth payload from cookie (for middleware). */
export type AuthCookiePayload = {
  userType?: "system" | "tenant";
  staffId?: string;
  role?: string;
  tenantId?: string | null;
  tenantSlug?: string | null;
  assignedBranchId?: string | null;
  allowedBranchIds?: string[];
  canViewAllBranches?: boolean;
  permissions?: string[];
  id?: string;
  email?: string;
  name?: string | null;
};

export function getAuthFromCookie(
  cookieHeader: string | undefined,
): AuthCookiePayload | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${AUTH_USER_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as AuthCookiePayload;
  } catch {
    return null;
  }
}
