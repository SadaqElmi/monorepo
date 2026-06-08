import {
  ApiError,
  formatApiErrorForUser,
  getRequestIdFromHeaders,
  logApiErrorForSupport,
  parseNestErrorMessage,
  parseRetryAfterSeconds,
  RATE_LIMIT_USER_MESSAGE,
} from "@repo/utils";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";

export type JsonHeaders = Record<string, string>;

export {
  ApiError,
  formatApiErrorForUser,
  logApiErrorForSupport,
  RATE_LIMIT_USER_MESSAGE,
};

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

function mergeClientHeaders(init?: RequestInit): Record<string, string> {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const merged: Record<string, string> = { ...headers };

  const hasAuth = Object.keys(merged).some(
    (k) => k.toLowerCase() === "authorization",
  );
  if (!hasAuth) {
    const authToken = getAuthTokenFromCookie();
    if (authToken) {
      merged.Authorization = `Bearer ${authToken}`;
    }
  }

  return merged;
}

function hasExplicitTenantHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === "x-tenant");
}

function hasAuthorizationHeader(headers: Record<string, string>): boolean {
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === "authorization" && Boolean(value?.trim()),
  );
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
  const mergedHeaders = mergeClientHeaders(requestInit);

  if (tenantSlug && !mergedHeaders["X-Tenant"]) {
    mergedHeaders["X-Tenant"] = tenantSlug;
  }

  if (
    (tenantSlug || hasExplicitTenantHeader(mergedHeaders)) &&
    !hasAuthorizationHeader(mergedHeaders)
  ) {
    const err = new ApiError("Missing auth token. Please sign in again.", {
      status: 403,
    });
    logApiErrorForSupport(err);
    throw err;
  }

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
