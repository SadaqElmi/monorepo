import {
  ApiError,
  formatApiErrorForUser,
  getRequestIdFromHeaders,
  logApiErrorForSupport,
  parseNestErrorMessage,
  parseRetryAfterSeconds,
  RATE_LIMIT_USER_MESSAGE,
} from "@repo/utils";
import {
  getClientBranchIdHeaderForApi,
  getEffectiveClientBranchId,
} from "@/lib/branch-access";
import { getPosDeviceCredential } from "@/lib/device-client";
import {
  clearRefreshToken,
  getStoredRefreshToken,
  setRefreshToken,
} from "@/lib/auth-client";
import { AUTH_PREFIX } from "./endpoints";

export type JsonHeaders = Record<string, string>;
const AUTH_TOKEN_COOKIE = "auth_token";

export {
  ApiError,
  formatApiErrorForUser,
  logApiErrorForSupport,
  RATE_LIMIT_USER_MESSAGE,
};

export function getClientBranchId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return getEffectiveClientBranchId();
}

function hasExplicitBranchHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === "x-branch-id");
}

function hasExplicitTenantHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === "x-tenant");
}

function hasExplicitAuthorization(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
}

function getAuthTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const escaped = AUTH_TOKEN_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`),
  );
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function setAuthTokenCookie(token: string) {
  if (typeof document === "undefined") return;
  const maxAge = 7 * 24 * 60 * 60;
  document.cookie = `${AUTH_TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function getTenantSlugFromHeaders(headers: Record<string, string>): string | null {
  const entry = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === "x-tenant",
  );
  return entry?.[1]?.trim() || null;
}

let refreshInFlight: Promise<string | null> | null = null;

async function rotateAccessToken(tenantSlug: string): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  const deviceCredential = getPosDeviceCredential();
  if (!refreshToken || !deviceCredential) return null;

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${AUTH_PREFIX}/pos/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        refreshToken,
        tenantSlug,
        deviceCredential,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("refresh failed");
        const data = (await res.json()) as {
          token: string;
          refreshToken: string;
        };
        setAuthTokenCookie(data.token);
        setRefreshToken(data.refreshToken);
        return data.token;
      })
      .catch(() => {
        clearRefreshToken();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

function mergeClientHeaders(
  init?: RequestInit,
  options?: { tenantSlug?: string },
): Record<string, string> {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const merged: Record<string, string> = { ...headers };

  if (options?.tenantSlug && !hasExplicitTenantHeader(merged)) {
    merged["X-Tenant"] = options.tenantSlug;
  }

  const branchHeader = getClientBranchIdHeaderForApi();
  if (!hasExplicitBranchHeader(merged) && branchHeader) {
    merged["x-branch-id"] = branchHeader;
  }

  if (!hasExplicitAuthorization(merged)) {
    const authToken = getAuthTokenFromCookie();
    if (authToken) {
      merged.Authorization = `Bearer ${authToken}`;
    }
  }

  return merged;
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json().catch(() => ({}));
  }
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function throwApiError(res: Response, data: unknown): never {
  const requestId = getRequestIdFromHeaders(res.headers);
  const retryAfterSeconds = parseRetryAfterSeconds(res.headers);
  const rawMessage = parseNestErrorMessage(data, "Request failed");
  const message =
    res.status === 429 ? RATE_LIMIT_USER_MESSAGE : rawMessage;
  const err = new ApiError(message, {
    status: res.status,
    requestId,
    retryAfterSeconds,
  });
  logApiErrorForSupport(err);
  throw err;
}

export type JsonFetchOptions = RequestInit & {
  tenantSlug?: string;
  /** Internal: skip refresh retry to avoid loops. */
  _skipRefresh?: boolean;
};

export async function jsonFetch<TResponse>(
  url: string,
  init?: JsonFetchOptions,
): Promise<TResponse> {
  const { tenantSlug, _skipRefresh, ...requestInit } = init ?? {};
  const mergedHeaders = mergeClientHeaders(requestInit, { tenantSlug });

  let res: Response;
  try {
    res = await fetch(url, {
      ...requestInit,
      credentials: requestInit.credentials ?? "include",
      headers: mergedHeaders,
      signal: requestInit.signal,
    });
  } catch {
    const err = new ApiError(
      "Cannot reach the server. Check your connection and API URL.",
      { status: 0, isNetworkError: true },
    );
    logApiErrorForSupport(err);
    throw err;
  }

  if (res.status === 401 && !_skipRefresh) {
    const slug =
      tenantSlug?.trim() ||
      getTenantSlugFromHeaders(mergedHeaders) ||
      undefined;
    if (slug) {
      const newToken = await rotateAccessToken(slug);
      if (newToken) {
        return jsonFetch<TResponse>(url, {
          ...init,
          _skipRefresh: true,
        });
      }
    }
  }

  if (res.status === 204) {
    return undefined as TResponse;
  }

  const data = await parseResponseBody(res);

  if (!res.ok) {
    throwApiError(res, data);
  }

  return data as TResponse;
}

export async function blobFetch(
  url: string,
  init?: JsonFetchOptions,
): Promise<Blob> {
  const { tenantSlug, _skipRefresh, ...requestInit } = init ?? {};
  const mergedHeaders = mergeClientHeaders(requestInit, { tenantSlug });

  let res: Response;
  try {
    res = await fetch(url, {
      ...requestInit,
      credentials: requestInit.credentials ?? "include",
      headers: mergedHeaders,
      signal: requestInit.signal,
    });
  } catch {
    const err = new ApiError(
      "Cannot reach the server. Check your connection and API URL.",
      { status: 0, isNetworkError: true },
    );
    logApiErrorForSupport(err);
    throw err;
  }

  if (res.status === 401 && !_skipRefresh) {
    const slug =
      tenantSlug?.trim() ||
      getTenantSlugFromHeaders(mergedHeaders) ||
      undefined;
    if (slug) {
      const newToken = await rotateAccessToken(slug);
      if (newToken) {
        return blobFetch(url, { ...init, _skipRefresh: true });
      }
    }
  }

  if (!res.ok) {
    const data = await parseResponseBody(res);
    throwApiError(res, data);
  }

  return res.blob();
}

export async function authPost<TResponse>(
  url: string,
  body: Record<string, unknown>,
  headers?: JsonHeaders,
): Promise<TResponse> {
  return jsonFetch<TResponse>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export async function authGet<TResponse>(
  url: string,
  headers?: JsonHeaders,
): Promise<TResponse> {
  return jsonFetch<TResponse>(url, {
    method: "GET",
    headers,
  });
}
