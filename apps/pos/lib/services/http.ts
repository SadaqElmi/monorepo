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
};

export async function jsonFetch<TResponse>(
  url: string,
  init?: JsonFetchOptions,
): Promise<TResponse> {
  const { tenantSlug, ...requestInit } = init ?? {};
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
  const { tenantSlug, ...requestInit } = init ?? {};
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
