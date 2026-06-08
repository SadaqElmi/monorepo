import "server-only";

import { getServerSession } from "@/lib/auth-server";
import { serverFetchCacheInit } from "@/lib/server-fetch-cache";
import {
  DOMAINS_PREFIX,
  SYSTEM_USERS_PREFIX,
  TENANTS_PREFIX,
} from "@/lib/services/endpoints";
import type { Domain } from "@/lib/services/domains";
import type { SystemUser } from "@/lib/services/system-users";
import type { Tenant } from "@/lib/services/tenants";

export async function serverPlatformJsonFetch<TResponse>(
  url: string,
  init?: RequestInit & { cacheMode?: "default" | "report" | "no-store" },
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

export async function getTenantsServer(): Promise<Tenant[]> {
  return serverPlatformJsonFetch<Tenant[]>(TENANTS_PREFIX, { method: "GET" });
}

export async function getDomainsServer(input?: {
  tenantId?: string;
}): Promise<Domain[]> {
  const qs = input?.tenantId
    ? `?tenantId=${encodeURIComponent(input.tenantId)}`
    : "";
  return serverPlatformJsonFetch<Domain[]>(`${DOMAINS_PREFIX}${qs}`, {
    method: "GET",
  });
}

export async function getSystemUsersServer(): Promise<SystemUser[]> {
  return serverPlatformJsonFetch<SystemUser[]>(SYSTEM_USERS_PREFIX, {
    method: "GET",
  });
}
