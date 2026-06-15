/** Fixed row height for react-window (px). Tune if row layout changes. */
export const TENANT_ROW_HEIGHT = 132;

/** Use virtualization when filtered rows exceed this count. */
export const TENANT_VIRTUALIZE_MIN_ROWS = 12;

/** Client-side page size when list is small enough to skip virtualization. */
export const TENANT_PAGE_SIZE = 50;

/** Poll interval while any tenant is provisioning (ms). */
export const TENANT_POLL_INTERVAL_MS = 3000;

/** Max viewport height for the virtualized list (px). */
export const TENANT_LIST_MAX_HEIGHT = 640;
