import "server-only";

import { cookies } from "next/headers";

import {
  AUTH_TOKEN_COOKIE,
  AUTH_USER_COOKIE,
  type ServerSession,
} from "@/lib/auth-server";
import { getServerBranchScope } from "@/lib/branch-scope-server";
import type { AuthCookiePayload } from "@/lib/auth-client";

export type JsonHeaders = Record<string, string>;

async function resolveSession(): Promise<{
  token: string;
  user: AuthCookiePayload;
  branchHeader: string | undefined;
}> {
  const jar = await cookies();
  const token = jar.get(AUTH_TOKEN_COOKIE)?.value?.trim();
  const rawUser = jar.get(AUTH_USER_COOKIE)?.value;
  if (!token || !rawUser) {
    throw new Error("Unauthorized");
  }
  let user: AuthCookiePayload;
  try {
    user = JSON.parse(decodeURIComponent(rawUser)) as AuthCookiePayload;
  } catch {
    throw new Error("Invalid auth cookie");
  }
  const scope = await getServerBranchScope(user);
  return { token, user, branchHeader: scope.branchHeader };
}

export async function serverJsonFetch<TResponse>(
  url: string,
  init?: RequestInit & { tenantSlug?: string },
): Promise<TResponse> {
  const { token, user, branchHeader } = await resolveSession();
  const tenantSlug =
    init?.tenantSlug?.trim() || user.tenantSlug?.trim() || "";
  if (!tenantSlug) {
    throw new Error("Missing tenant scope");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant": tenantSlug,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (branchHeader && !headers["x-branch-id"]) {
    headers["x-branch-id"] = branchHeader;
  }

  const res = await fetch(url, {
    ...init,
    headers,
    cache: init?.cache ?? "no-store",
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : Array.isArray((data as { message?: unknown }).message)
          ? ((data as { message: string[] }).message).join(", ")
          : "Request failed";
    throw new Error(message);
  }

  return data as TResponse;
}

export async function serverJsonFetchWithSession<TResponse>(
  url: string,
  session: ServerSession,
  init?: RequestInit,
): Promise<TResponse> {
  const scope = await getServerBranchScope(session);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
    "X-Tenant": session.tenantSlug ?? "",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (scope.branchHeader && !headers["x-branch-id"]) {
    headers["x-branch-id"] = scope.branchHeader;
  }
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (data as { message?: string }).message === "string"
        ? (data as { message: string }).message
        : "Request failed",
    );
  }
  return data as TResponse;
}
