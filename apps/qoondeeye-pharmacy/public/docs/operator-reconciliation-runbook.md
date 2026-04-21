# Operator runbook: reconciliation findings

This runbook matches the checks implemented in `ReconciliationService` (Nest backend). Use it **after** a reconciliation run, starting from the issue log in the ERP UI or from `public.reconciliation_logs`.

Canonical copy for developers: `qoondeeye-pharmacyDB/docs/operator-reconciliation-runbook.md`.

## 1. Two different schemas

| Data | Where it lives |
|------|----------------|
| Tenant business data (`stock_transfers`, `stock_transfer_events`, `journal_entries`, `journal_lines`, `branches`, `inventory`, …) | **Tenant schema** (e.g. `pharmacy1`). Set `search_path` or qualify names: `"pharmacy1"."stock_transfers"`. |
| Reconciliation **runs** and **logs** | **`public`** schema: `reconciliation_runs`, `reconciliation_logs` (Prisma models in `prisma/schema.prisma`). |

Replace `<tenant>` with your tenant schema name in every SQL example below.

## 2. Start from the log row

1. Run reconciliation from **Reconciliation** (or `POST /api/reconciliation/run`).
2. Open the issue log; note **type**, **severity**, **message**, **entity_id**, and **metadata** (e.g. `entity_code`, `transfer_id`, `branch_id`).
3. Use **Related** links in the UI where present (transfer / journal / inventory).

Severity policy (see `reconciliation-severity.policy.ts`):

| Severity | Typical meaning | Urgency |
|----------|-----------------|--------|
| **critical** | Missing transfer journals, journal integrity failure, unbalanced entry, cross-branch mismatch | Treat as **blocker** for trusting GL / inter-branch balances until understood. |
| **warning** | Inventory vs GL mismatch, phase failure | Investigate; may be timing, costing, or missing postings. |
| **info** | Event replay vs row mismatch | Audit / consistency; often legacy or one-off data drift. |

Log **types**: `transfer`, `journal`, `branch`, `inventory`, `event`, `system` (`reconciliation.types.ts`).

## 3. Transfer: missing journal link IDs

**Symptoms (messages):** e.g. “Shipped transfer missing shipped journal entry id”, “Received transfer missing receive journal entry id”.

**List affected transfers (tenant schema):**

```sql
-- Shipped but no ship journal id
SELECT id, transfer_number, status,
       shipped_journal_entry_id, receive_journal_entry_id
FROM "<tenant>"."stock_transfers"
WHERE status = 'shipped'
  AND shipped_journal_entry_id IS NULL;

-- Received but missing either journal id
SELECT id, transfer_number, status,
       shipped_journal_entry_id, receive_journal_entry_id
FROM "<tenant>"."stock_transfers"
WHERE status = 'received'
  AND (shipped_journal_entry_id IS NULL OR receive_journal_entry_id IS NULL);
```

**Orphan journals (posted but not linked on the row):** postings use `source_type` + `source_id` = transfer id. Unique index: `(branch_id, source_type, source_id)` on `journal_entries`.

```sql
-- Ship journal should be on SOURCE branch
SELECT id, branch_id, entry_date, source_type, source_id, description
FROM "<tenant>"."journal_entries"
WHERE source_type = 'transfer_ship'
  AND source_id = '<transfer_uuid>'::uuid;

-- Receive journal should be on DESTINATION branch
SELECT id, branch_id, entry_date, source_type, source_id, description
FROM "<tenant>"."journal_entries"
WHERE source_type = 'transfer_receive'
  AND source_id = '<transfer_uuid>'::uuid;
```

**Manual fix principle:** Prefer **linking** an existing `journal_entries` row onto `stock_transfers.shipped_journal_entry_id` / `receive_journal_entry_id` over inserting a second journal (duplicate ship/receive for the same `(branch_id, source_type, source_id)` will hit the unique index).

**Automated fix (when enabled):** use `POST /api/transfers/:id/repair/journal-links` with `{ "confirm": true }` (admin / owner / super_admin only). See API responses for `before` / `after` / `actions`.

## 4. Event replay vs database row

**Symptoms:** log type `event`, message prefix `Event replay mismatch`, metadata lists e.g. `approval_state: derived=pending db=none`.

**Inspect events (ordered):**

```sql
SELECT aggregate_version, created_at, event_type, message, metadata
FROM "<tenant>"."stock_transfer_events"
WHERE transfer_id = '<transfer_uuid>'::uuid
ORDER BY aggregate_version ASC, created_at ASC;
```

Derived rules are implemented in `src/transfers/replay/transfer-replay.util.ts` (e.g. `CONFIRMED` → status confirmed and approval pending in the replay model).

**Manual fix:** Align the row with the **event-derived** state when you are satisfied the events are the source of truth—especially `approval_state` when the DB still shows `none` after older migrations.

**Automated fix:** `POST /api/transfers/:id/repair/approval-from-replay` with `{ "confirm": true }` (conservative rules in code).

## 5. Inventory vs GL

**Symptoms:** type `inventory`, message “Inventory stock valuation vs GL inventory account mismatch”; metadata includes `stock_valuation`, `gl_inventory_net`, `diff`.

The check compares:

- **Stock side:** inventory valuation service (per branch).
- **GL side:** sum of `journal_lines` (debit − credit) on accounts where `chart_of_accounts.account_key = 'inventory'`, for that branch, with `entry_date` up to an “as of” date used by the engine (see `checkInventoryVsGl` in `reconciliation.service.ts`).

**This is not auto-healed by transfer repair alone.** Use journals, purchases, sales, adjustments, and costing investigation. Transfer missing journals (above) is one common contributor.

## 6. Cross-branch and journal integrity

**Cross-branch:** logs type `branch` (including pair totals). **Journal integrity:** type `journal`. Treat as **critical** until a qualified user validates balances and postings.

## 7. Financial periods / lock dates

Before **creating** new journals (manual or API “recreate”), confirm the intended **entry date** is allowed for the branch (same rules as normal ship/receive—lock dates / closed periods). If the period is closed, prefer an **adjustment** strategy agreed with finance rather than back-dating.

## 8. API reference (repair)

All require: `Cookie: auth_token=…`, header `X-Tenant: <slug>`, JSON body `{ "confirm": true }`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/transfers/:id/repair/journal-links` | Link orphan `journal_entries` to `stock_transfers` where ids are null. |
| POST | `/api/transfers/:id/repair/approval-from-replay` | Patch `approval_state` from event replay (conservative). |
| POST | `/api/transfers/:id/repair/recreate-missing-journals` | Create missing ship/receive journals only when no row exists for the unique `(branch_id, source_type, source_id)`; then link. |

Responses include `before`, `after`, and `actions` for support audit. Re-run reconciliation after any repair.
