/** Cookie mirrored from localStorage branch selection for server-side API scope. */

export const ACTIVE_BRANCH_ID_COOKIE = "active_branch_id";
export const ACTIVE_BRANCH_AGGREGATE_COOKIE = "active_branch_aggregate";

const COOKIE_MAX_AGE_DAYS = 7;

function cookieOptions(maxAge: number) {
  return `path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Client-only: sync branch switcher value to cookies for RSC fetches. */
export function syncActiveBranchCookie(branchId: string) {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const opts = cookieOptions(maxAge);
  const trimmed = branchId.trim();
  if (!trimmed) {
    clearActiveBranchCookies();
    return;
  }
  if (trimmed === "all") {
    document.cookie = `${ACTIVE_BRANCH_AGGREGATE_COOKIE}=1; ${opts}`;
    document.cookie = `${ACTIVE_BRANCH_ID_COOKIE}=; path=/; max-age=0`;
  } else {
    document.cookie = `${ACTIVE_BRANCH_AGGREGATE_COOKIE}=; path=/; max-age=0`;
    document.cookie = `${ACTIVE_BRANCH_ID_COOKIE}=${encodeURIComponent(trimmed)}; ${opts}`;
  }
}

/** Client-only: remove branch cookies (e.g. on tenant switch at login). */
export function clearActiveBranchCookies() {
  if (typeof document === "undefined") return;
  const zero = "path=/; max-age=0";
  document.cookie = `${ACTIVE_BRANCH_AGGREGATE_COOKIE}=; ${zero}`;
  document.cookie = `${ACTIVE_BRANCH_ID_COOKIE}=; ${zero}`;
}
