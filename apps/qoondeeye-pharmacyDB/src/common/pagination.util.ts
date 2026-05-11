/** Paginated list envelope for API responses. */
export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

/**
 * When the client sends `page` (1-based), return pagination params.
 * If `page` is omitted, callers should use legacy unbounded (or limit-only) behavior.
 */
export function parsePagedQueryParam(
  pageRaw: string | undefined,
  limitRaw: string | undefined,
  opts?: { defaultLimit?: number; maxLimit?: number },
): { page: number; limit: number; skip: number } | null {
  if (pageRaw === undefined || pageRaw === null || String(pageRaw).trim() === '') {
    return null;
  }
  const defaultLimit = opts?.defaultLimit ?? DEFAULT_PAGE_LIMIT;
  const maxLimit = opts?.maxLimit ?? MAX_PAGE_LIMIT;
  const page = Math.max(1, parseInt(String(pageRaw), 10) || 1);
  const limitRawNorm =
    limitRaw !== undefined && String(limitRaw).trim() !== ''
      ? parseInt(String(limitRaw), 10)
      : defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, limitRawNorm || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function toPagedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PagedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  return { items, total, page, limit, totalPages };
}
