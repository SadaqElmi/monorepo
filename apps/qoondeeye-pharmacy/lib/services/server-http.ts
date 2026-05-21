import "server-only";

import { getServerSession, type ServerSession } from "@/lib/auth-server";
import { getServerBranchScope } from "@/lib/branch-scope-server";
import {
  serverFetchCacheInit,
  type ServerFetchCacheMode,
} from "@/lib/server-fetch-cache";

export type JsonHeaders = Record<string, string>;

export type ServerJsonFetchInit = RequestInit & {
  tenantSlug?: string;
  /** `report` = 30s Next.js revalidate; default = no-store */
  cacheMode?: ServerFetchCacheMode;
};

async function resolveSession() {
  const session = await getServerSession();
  if (!session?.token) {
    throw new Error("Unauthorized");
  }
  const scope = await getServerBranchScope(session);
  return {
    token: session.token,
    user: session,
    branchHeader: scope.branchHeader,
  };
}

/** Platform admin APIs (tenants, domains, system-users) — no X-Tenant. */
export async function serverPlatformJsonFetch<TResponse>(
  url: string,
  init?: RequestInit & { cacheMode?: ServerFetchCacheMode },
): Promise<TResponse> {
  const session = await getServerSession();
  if (!session?.token) {
    throw new Error("Unauthorized");
  }

  const cacheMode = init?.cacheMode ?? "default";
  const cacheInit = serverFetchCacheInit(cacheMode);
  const { cacheMode: _cm, ...restInit } = init ?? {};

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, {
    ...restInit,
    headers,
    ...cacheInit,
    cache: restInit.cache ?? cacheInit.cache,
    next: restInit.next ?? cacheInit.next,
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

export async function serverJsonFetch<TResponse>(
  url: string,
  init?: ServerJsonFetchInit,
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

  const cacheMode = init?.cacheMode ?? "default";
  const cacheInit = serverFetchCacheInit(cacheMode);
  const { cacheMode: _cm, tenantSlug: _ts, ...restInit } = init ?? {};

  const res = await fetch(url, {
    ...restInit,
    headers,
    ...cacheInit,
    cache: restInit.cache ?? cacheInit.cache,
    next: restInit.next ?? cacheInit.next,
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
  init?: RequestInit & { cacheMode?: ServerFetchCacheMode },
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
  const cacheMode = init?.cacheMode ?? "default";
  const cacheInit = serverFetchCacheInit(cacheMode);
  const { cacheMode: _cm, ...restInit } = init ?? {};

  const res = await fetch(url, {
    ...restInit,
    headers,
    ...cacheInit,
    cache: restInit.cache ?? cacheInit.cache,
    next: restInit.next ?? cacheInit.next,
  });
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
