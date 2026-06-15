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

export const getServerSession = cache(readServerSession);

export async function requireServerSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session?.token || !session.tenantSlug) {
    redirect("/staff-login");
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
    canViewAllBranches: Boolean(session.canViewAllBranches),
    permissions: session.permissions ?? [],
  };
}
