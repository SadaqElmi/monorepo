# API performance profiling

When Network shows an API above ~300ms after parallel server fetches:

1. Note the URL and tenant/branch headers from DevTools.
2. In `qoondeeye-pharmacyDB`, run `EXPLAIN ANALYZE` on the matching query in `src/` services.
3. Add indexes only when EXPLAIN shows sequential scans on large tables.

## Indexes added (2026-05)

- `stock_transfers(from_branch_id, to_branch_id, status)` — transfer list filters
- `stock_transfers(to_branch_id, status)` — incoming transfers

Existing indexes (see `branch_isolation_hardening` migration): `inventory(branch_id, product_id)`, `journal_entries(branch_id, entry_date)`.

## Server cache

Report reads use `cacheMode: "report"` (30s revalidate) via `lib/server-fetch-cache.ts`. Do not use for mutations or auth.
