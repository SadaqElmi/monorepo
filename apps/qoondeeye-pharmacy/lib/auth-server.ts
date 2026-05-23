import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthCookiePayload } from "@/lib/auth-client";
import { getAuthFromCookie } from "@/lib/auth-client";

export const AUTH_TOKEN_COOKIE = "auth_token";
export const AUTH_USER_COOKIE = "auth_user";

export type ServerSession = AuthCookiePayload & {
  token: string;
};

async function readServerSession(): Promise<ServerSession | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_TOKEN_COOKIE)?.value?.trim();
  if (!token) return null;

  const rawUser = jar.get(AUTH_USER_COOKIE)?.value;
  const user = rawUser
    ? (() => {
        try {
          return JSON.parse(decodeURIComponent(rawUser)) as AuthCookiePayload;
        } catch {
          return getAuthFromCookie(`${AUTH_USER_COOKIE}=${rawUser}`);
        }
      })()
    : null;

  if (!user?.id) return null;
  return { ...user, token };
}

/** Deduped per RSC request — safe to call from page + serverJsonFetch. */
export const getServerSession = cache(readServerSession);

export function isSystemUser(
  session: AuthCookiePayload | null | undefined,
): boolean {
  if (!session) return false;
  if (session.userType === "system") return true;
  return session.role?.toLowerCase() === "super_admin";
}

export async function requireSystemSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session?.token) {
    redirect("/login");
  }
  if (!isSystemUser(session)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireServerSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session?.token || !session.tenantSlug) {
    redirect("/login");
  }
  return session;
}

export function sessionToDisplayUser(session: ServerSession) {
  return {
    id: session.id ?? "",
    email: session.email?.trim() || undefined,
    name: session.name ?? session.email ?? null,
    userType: session.userType,
    role: session.role,
    tenantId: session.tenantId ?? undefined,
    tenantSlug: session.tenantSlug ?? null,
    assignedBranchId: session.assignedBranchId ?? null,
    allowedBranchIds: session.allowedBranchIds ?? [],
    canViewAllBranches:
      typeof session.canViewAllBranches === "boolean"
        ? session.canViewAllBranches
        : undefined,
    permissions: session.permissions ?? [],
  };
}
