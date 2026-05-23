/** Matches Nest `PagedResult` / `@repo/types` `PagedList`. */
export type PagedList<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/** User-facing message when the API returns HTTP 429. */
export const RATE_LIMIT_USER_MESSAGE =
  "Too many requests. Please wait and try again.";

export const BRANCH_ACCESS_DENIED_MESSAGE =
  "You do not have access to this branch. Switch to your assigned branch or ask an administrator.";

export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly isRateLimited: boolean;
  readonly isNetworkError: boolean;
  readonly isBranchAccessDenied: boolean;

  constructor(
    message: string,
    options: {
      status: number;
      requestId?: string;
      retryAfterSeconds?: number;
      isNetworkError?: boolean;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.isRateLimited = options.status === 429;
    this.isNetworkError = Boolean(options.isNetworkError);
    this.isBranchAccessDenied =
      /access denied to this branch/i.test(message) ||
      /access denied to all branches/i.test(message);
  }
}

export function isPagedList<T>(value: unknown): value is PagedList<T> {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.items) &&
    typeof o.total === "number" &&
    typeof o.page === "number" &&
    typeof o.limit === "number" &&
    typeof o.totalPages === "number"
  );
}

/** Accept legacy array responses or new `{ items, total, page, limit, totalPages }`. */
export function unwrapListResponse<T>(
  data: T[] | PagedList<T>,
  fallbackPage = 1,
  fallbackLimit?: number,
): PagedList<T> {
  if (isPagedList<T>(data)) return data;
  const items = Array.isArray(data) ? data : [];
  const limit = fallbackLimit ?? Math.max(1, items.length);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  return {
    items,
    total,
    page: fallbackPage,
    limit,
    totalPages,
  };
}

export function buildPagedQuery(
  params: { page?: number; limit?: number; extra?: Record<string, string> },
): string {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.extra) {
    for (const [k, v] of Object.entries(params.extra)) {
      if (v !== "") q.set(k, v);
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function parseNestErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const msg = (data as { message?: unknown }).message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  if (Array.isArray(msg)) {
    const parts = msg.filter(
      (m): m is string => typeof m === "string" && m.trim().length > 0,
    );
    if (parts.length) return parts.join(", ");
  }
  return fallback;
}

export function getHeaderValue(
  headers: Headers,
  name: string,
): string | undefined {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
}

export function parseRetryAfterSeconds(
  headers: Headers,
): number | undefined {
  const raw = getHeaderValue(headers, "Retry-After");
  if (!raw) return undefined;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) return asNum;
  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export function getRequestIdFromHeaders(headers: Headers): string | undefined {
  return (
    getHeaderValue(headers, "x-request-id") ??
    getHeaderValue(headers, "request-id") ??
    undefined
  );
}

export function friendlyStatusMessage(status: number): string {
  switch (status) {
    case 401:
      return "Your session has expired or your sign-in was not accepted. Please sign in again.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested resource was not found.";
    case 429:
      return RATE_LIMIT_USER_MESSAGE;
    case 500:
    case 502:
    case 503:
    case 504:
      return "The server encountered a problem. Please try again shortly.";
    default:
      return status >= 500
        ? "Something went wrong on the server. Please try again."
        : "The request could not be completed.";
  }
}

/** Map API/network errors to safe UI text; logs request id when present. */
export function formatApiErrorForUser(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isBranchAccessDenied) return BRANCH_ACCESS_DENIED_MESSAGE;
    if (error.isNetworkError) {
      return "Cannot reach the server. Check your internet connection and that the API URL is correct.";
    }
    if (error.isRateLimited) return RATE_LIMIT_USER_MESSAGE;
    const base =
      error.status >= 400 && error.status < 500 && error.message
        ? error.message
        : friendlyStatusMessage(error.status);
    if (error.requestId) {
      return `${base} Reference ID: ${error.requestId}`;
    }
    return base;
  }
  if (error instanceof Error) {
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return "Cannot reach the server. Check your connection and API URL.";
    }
    if (/access denied to this branch/i.test(error.message)) {
      return BRANCH_ACCESS_DENIED_MESSAGE;
    }
    return error.message || "Something went wrong.";
  }
  return "Something went wrong.";
}

/** TanStack Query: no retry on 401/403/429; up to 2 retries on 5xx/network. */
export function queryRetryPolicy(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if ([401, 403, 429].includes(error.status)) return false;
    if (error.status >= 500 || error.isNetworkError) return failureCount < 2;
    return false;
  }
  return failureCount < 1;
}

export function logApiErrorForSupport(error: unknown): void {
  if (typeof console === "undefined") return;
  if (error instanceof ApiError) {
    if (error.requestId) {
      console.error("[API]", error.message, {
        status: error.status,
        requestId: error.requestId,
      });
    } else {
      console.error("[API]", error.message, { status: error.status });
    }
    return;
  }
  if (error instanceof Error) {
    console.error("[API]", error.message);
  }
}
