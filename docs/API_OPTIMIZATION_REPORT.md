# API usage optimization — implementation report

## Summary

Reduced duplicate API traffic in **qoondeeye-pharmacy** (ERP) and **pos** by fixing mount-time cache invalidation, centralizing branch list fetching, aligning one data source per screen, tightening React Query defaults, and narrowing POS post-sale refetches.///

## Files changed (grouped)

### Shared (`packages/utils`)

- `packages/utils/src/api-client.ts` — `queryRetryPolicy`
- `packages/utils/src/index.ts` — export

### ERP (`apps/qoondeeye-pharmacy`)

- `lib/get-query-client.ts` — smart retry, `mutations.retry: false`
- `lib/branch-reconcile.ts` — `{ changed, branchHeader }` result
- `components/branch-reconcile-host.tsx` — invalidate `erp` only when branch changed; seed branches via `fetchQuery`
- `components/team-switcher.tsx` — `useErpBranches` (no duplicate `getBranches`)
- `lib/erp-query-keys.ts` — `accountingAlerts` key
- `lib/erp-query-prefetch.ts` — lighter login prefetch (catalog only)
- `components/app-sidebar.tsx` — 300ms debounced sidebar prefetch
- `hooks/queries/use-erp-accounting-alerts.ts` — new
- `hooks/use-accounting-alerts.ts` — re-export hook
- `hooks/queries/use-erp-report-query.ts` — `enabled` waits for `branchFacet`
- `components/api/cached-query-toolbar.tsx` — new
- Pages: `inventory/categories/page.tsx`, `accounting/reports/consolidated/page.tsx`
- Clients: `categories-client`, `products-client`, `stock-client`, `dashboard-client`, `consolidated-client`, `control-center-client`, `batches-client`, `configuration-roles-client`, `configuration-staff-client`, `monitoring-client`, `suppliers-client`, `returns-client`, `journals-client`, `chart-of-accounts-client`, `customers-coa-client`

### POS (`apps/pos`)

- `components/query-provider.tsx` — smart retry, `mutations.retry: false`
- `lib/branch-reconcile.ts` — `{ changed, branchHeader }`
- `components/branch-reconcile-host.tsx` — invalidate `pos` only when changed
- `lib/pos-query-keys.ts` — split catalog keys
- `hooks/use-pos-catalog.ts` — 3 queries, `refetchOnWindowFocus: false`
- `lib/prefetch-register-data.ts` — prefetch split keys
- `lib/invalidate-pos-after-sale.ts` — new
- `components/pos-context.tsx` — targeted invalidation; session effect not tied to every route
- `features/register/ui/register-screen.tsx` — cap sale hydration to 5
- `components/api/cached-query-toolbar.tsx` — new

## Duplicates removed

| Pattern                                                      | Fix                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `BranchReconcileHost` invalidated all queries on every mount | Invalidate only when `reconcileClientBranchSelection().changed` |
| Team switcher + reconcile both called `GET /branches`        | Single `useErpBranches` / `fetchQuery` cache                    |
| Categories RSC full list + client paged list                 | RSC removed; client-only paged query                            |
| Login prefetched dashboard bundle + inventory                | Login prefetches catalog + branches only                        |
| POS sale invalidated full catalog (incl. categories)         | Invalidate `sales` + `catalogProducts` + `catalogBatches` only  |
| POS sales hydration up to 50× `getSaleById`                  | Capped at 5                                                     |
| Control center 8-way bundle included duplicate alerts        | Alerts via shared `useErpAccountingAlerts`                      |
| Consolidated reports RSC + auto client fetch                 | No RSC prefetch; **Run report** required                        |

## Query keys standardized

- `erpKeys.accountingAlerts(tenant, facet, branchId, aggregateAll)`
- POS: `posKeys.catalogProducts`, `catalogBatches`, `catalogCategories` (legacy `catalog` key retained for bump invalidation prefix)

## staleTime / gcTime

| Tier                                     | Value  | Usage                                        |
| ---------------------------------------- | ------ | -------------------------------------------- |
| `ERP_STALE_STATIC` / `POS_STALE_CATALOG` | 5 min  | branches, roles, catalog products/categories |
| `ERP_STALE_LIST` / `POS_STALE_SALES`     | 60 s   | lists, dashboard, alerts poll data           |
| `ERP_STALE_REPORT`                       | 2 min  | reports, control center bundle               |
| `ERP_STALE_HISTORY`                      | 30 s   | history pages                                |
| `ERP_GC_TIME` / `POS_GC_TIME`            | 30 min | gcTime                                       |

## refetchOnWindowFocus / refetchInterval

- Global: `refetchOnWindowFocus: false` (both apps)
- Removed POS catalog override (`true` → `false`)
- Accounting alerts: `refetchInterval` 45s via React Query (replaces raw `setInterval` fetch)

## Retry policy

- Queries: `queryRetryPolicy` — no retry on 401/403/429; up to 2 on 5xx/network
- Mutations: `retry: false` globally

## Pages optimized

- Login, dashboard, products, categories, stock, consolidated reports, control center, POS register (catalog split + sale invalidation)

## Network tab — manual verification (required)

Record **before/after** on your machine; numbers depend on tenant data and branch mode.

| Page                    | Target          | What to check                                          |
| ----------------------- | --------------- | ------------------------------------------------------ |
| `/login`                | 0 before submit | No API until login POST                                |
| `/dashboard`            | ≤8              | No duplicate bundle URLs within 2s after load settles  |
| `/inventory/products`   | ≤4              | Single catalog/categories/inventory set                |
| `/inventory/categories` | ≤3              | One paged categories call                              |
| `/inventory/stock`      | ≤4              | Refresh button refetches intentionally                 |
| POS `/`                 | ≤5 initial      | After sale: sales + products + batches, not categories |
| Consolidated report     | 0 until Run     | No balance sheet/P&L until button                      |

## APIs still called periodically (by design)

- **Accounting alerts** — `refetchInterval` 45s when nav/control center uses the hook (shared cache).
- **Branch reconcile** — one `GET /branches` per session when tenant user loads (feeds switcher + reconcile).

## Manual tests checklist

- [ ] Hard refresh each page; count Network requests
- [ ] Search products (client filter) — no API per keystroke
- [ ] Switch branch — only branch-scoped queries refetch
- [ ] POS sale — one POST; then sales + catalog products/batches refresh, not categories
- [ ] 401/403/429 — no repeated query retries
- [ ] Consolidated report — no heavy calls until **Run report**
- [ ] Error UI still shows `requestId` from `ApiError`
