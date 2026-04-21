# Accounting invariants (enforcement map)

This document ties product rules to code. It complements [branch-isolation-contract.md](./branch-isolation-contract.md).

## Journal integrity

- **Balanced lines:** `JournalService.createBalancedEntry` validates totals before insert and calls `assertJournalIntegrity` after insert ([`src/accounting/journal.service.ts`](../src/accounting/journal.service.ts)).
- **Line builder guard:** `assertJournalLinesWhenRequired` in [`src/accounting/accounting-journal-guards.ts`](../src/accounting/accounting-journal-guards.ts) fails fast when revenue/COGS or return amounts imply a journal but no lines were constructed ([`AccountingPostingService`](../src/accounting/accounting-posting.service.ts)).
- **Reconciliation:** `checkJournals` flags unbalanced entries and **journal entries with zero lines** ([`src/reconciliation/reconciliation.service.ts`](../src/reconciliation/reconciliation.service.ts)).

## Lock date (period close)

- **Posting:** All inserts through `JournalService.createBalancedEntry` call `AccountingLockDateService.assertEntryDateOpen` with the journal `source_type`. When `entry_date` is on or before `branches.accounting_lock_date`, only adjustment-style `source_type` values (`period_adjustment`, `consolidation_bs`, `consolidation_pnl`, `consolidation_reversal`) may post; routine operational types remain blocked in closed periods.
- **Operational documents:** Sales, purchases, expenses, sale returns, supplier/customer payments assert the relevant document or payment **date** before mutating stock, headers, or cash-side tables (same service as posting).

## Branch isolation

See [branch-isolation-contract.md](./branch-isolation-contract.md).

## Reversal instead of delete (financial)

- **Sales:** Hard delete is blocked when a `journal_entries` row exists for `source_type IN ('sale','customer_invoice')` and the sale id ([`src/sales/sales.service.ts`](../src/sales/sales.service.ts)).
- **Expenses:** Delete posts an `expense_reversal` journal when an `expense` journal exists, then removes the row ([`src/expenses/expenses.service.ts`](../src/expenses/expenses.service.ts)).
- **Sale returns:** Delete posts `sale_return_reversal` when a `sale_return` journal exists, then reverses inventory ([`src/sale-returns/sale-returns.service.ts`](../src/sale-returns/sale-returns.service.ts)).
- **Purchases:** Existing reversal journal + stock revert flow unchanged; additionally guarded by lock date and audit logs.

## Branch read scope (`branchReadScope`)

- Tenant HTTP requests set **`req.branchReadScope`** in [`src/common/middleware/branch.middleware.ts`](../src/common/middleware/branch.middleware.ts): `readBranchIds` (GET filters), `readAllBranches` (client sent `x-branch-id: all` and policy allowed), and `mutationBranchId` (same as `req.branchId` for writes).
- [`assertAllowedBranches`](../src/common/branch-scope/branch-scope.util.ts) resolves from **`branchReadScope.readBranchIds`** first, then falls back to `allowedBranchIds` for compatibility.

## Inter-branch stock transfers (due from / due to)

- **Ship and receive journals** are created only through `AccountingPostingService.postTransferShipJournal` and `postTransferReceiveJournal` ([`src/accounting/accounting-posting.service.ts`](../src/accounting/accounting-posting.service.ts)); the only production callers are in [`TransfersService`](../src/transfers/transfers.service.ts) (ship, receive, and repair paths).
- **Parity guard:** completing a receive calls `assertCrossBranchBalance` so ship and receive inter-branch GL stay aligned for the normal receive flow ([`src/transfers/transfers.service.ts`](../src/transfers/transfers.service.ts)). Legacy journals, repairs, or manual postings can still surface as consolidation residual or on the **Inter-branch mismatches** report.
- **Optional strictness:** future tenant/env flags (for example cost drift thresholds) belong next to this guard, not as a duplicate of receive-time blocking.

## Period close vs inter-branch health

- **Optional hard block:** when `INTERBRANCH_LOCK_BLOCK_ON_CRITICAL=true`, advancing **`branches.accounting_lock_date`** is rejected if close-readiness is critical (critical inter-branch mismatches, negative inventory, or transfer posting failures/missing journals). Default is off so operators are not surprised; turn on for stricter close discipline ([`src/branches/branches.service.ts`](../src/branches/branches.service.ts)).
- **Control-center API:** `GET /api/accounting/close-readiness` aggregates period-close blockers and warnings (`status`, `summary`, `issues[]`) for the scoped branches ([`src/accounting/accounting.controller.ts`](../src/accounting/accounting.controller.ts), [`src/accounting/financial-reports.service.ts`](../src/accounting/financial-reports.service.ts)).

## Transfer lifecycle + stuck detection

- Transfer lifecycle includes explicit `closed` after `received` (`POST /api/transfers/:id/close`), keeping `stock_transfers.status` immutable for completed flows ([`src/transfers/transfers.controller.ts`](../src/transfers/transfers.controller.ts), [`src/transfers/transfers.service.ts`](../src/transfers/transfers.service.ts)).
- `GET /api/reports/stuck-transfers` flags `shipped` transfers older than threshold without receive posting; threshold defaults to `TRANSFER_STUCK_HOURS` (24h fallback) ([`src/accounting/financial-reports.controller.ts`](../src/accounting/financial-reports.controller.ts)).

## P&amp;L and inter-branch (feature flag)

- **`FEATURE_INTERBRANCH_PNL_EXCLUDE`:** when `true` / `1` / `yes`, the income statement SQL excludes journal lines whose **`chart_of_accounts.is_interbranch`** is true (foundation for later intercompany P&amp;L rules). Default off — group P&amp;L remains a simple sum.
- Income statement payload also returns an **intercompany bucket** (`intercompany.revenue/cogs/expenses/netIncomeImpact`) plus `netRevenue` so operators can see gross vs intercompany impact without losing transparency.

## `branch_account_balance_snapshot` (schema prep)

- Tenant table **`branch_account_balance_snapshot`** is created idempotently by [`TenantService.applyTenantSchemaPatches`](../src/tenant/tenant.service.ts). It is **not** populated by application code yet; a future job should write `(branch_id, account_id, period_start, balance)` for faster as-of reporting.

## Audit trail (application)

For mutations covered by this hardening pass, services call `AuditLogService.append` with:

- `branch_id`, `actor_user_id` (from `req.userId` on HTTP controllers), `table_name`, `record_id`, `action`, and JSON `old_payload` / `new_payload` where useful.

Security-related branch denials may still be logged only by middleware.

## Inter-branch remediation + auditability

- Inter-branch mismatch payload includes `fixSuggestionCode` to keep remediation deterministic in UI (`complete_receive`, `repair_transfer_journal`, `inspect_due_from_to_mapping`) ([`src/accounting/interbranch-report.util.ts`](../src/accounting/interbranch-report.util.ts)).
- Transfer lifecycle and repair operations append explicit audit-log actions (`interbranch_ship`, `interbranch_receive`, `interbranch_close`, and repair actions) to support finance/support traceability ([`src/transfers/transfers.service.ts`](../src/transfers/transfers.service.ts)).

## Snapshot baseline behavior (compare mode)

- When report compare-by-snapshot is requested and no prior-day baseline exists, the response now falls back to an on-demand same-day baseline using the just-persisted snapshot (zero delta baseline) for P&amp;L, balance sheet, and cash flow.

## Explicit all-branch permission

- Auth/session payload now carries `canViewAllBranches` and backend scope checks prefer this explicit permission signal over role-only inference when present ([`src/auth/auth.service.ts`](../src/auth/auth.service.ts), [`src/common/middleware/branch.middleware.ts`](../src/common/middleware/branch.middleware.ts), [`src/common/branch-scope/branch-scope.util.ts`](../src/common/branch-scope/branch-scope.util.ts)).

## Required fields (append helper)

Use [`AuditLogService.append`](../src/accounting/audit-log.service.ts) with explicit `tableName`, `recordId`, `action`, and at least one of `newPayload` / `oldPayload` for financial writes so operators can answer who / what / when.

## Tamper-evident audit hash chain

- Audit rows now store canonical fields (`entity_type`, `entity_id`, `before_json`, `after_json`, `event_ts`) plus chain linkage (`prev_hash`, `audit_hash`) on `audit_logs`.
- Hash generation is centralized in [`AuditLogService`](../src/accounting/audit-log.service.ts), so transfer lifecycle writes and middleware security denials use the same chain writer path.
- `AUDIT_HASH_CHAIN_ENFORCED` controls strict hash creation (`true` by default); disabling it preserves writes while emitting null `audit_hash` values.

## Period workflow state machine

- Period workflow persists to `accounting_period_workflow` with states `open -> review -> approved -> closed`.
- `POST /api/accounting/period/approve` checks close-readiness first, then sets `approved` (or `closed` when readiness is clean) and stores `prepared_by` / `approved_by`.
- `POST /api/accounting/period/reopen` moves scope back to `review` and records `reopened_by`.

## Daily control APIs

- `GET /api/reports/inventory-gl-sync` returns `inventoryValue`, `glValue`, `difference`, and severity per branch to surface inventory-vs-GL drift.
- `GET /api/reports/alerts` aggregates high-signal control items (stuck transfers, critical inter-branch mismatch, negative inventory) and pushes deduped in-app notifications.
- `GET /api/reports/variance-analysis` returns account-level change attribution by driver (`source_type`) for explainable deltas.

## Controlled auto-repair

- `POST /api/transfers/repairs/auto-fix` proposes transfer repairs and only executes safe repair actions when `AUTO_REPAIR_ENABLED=true`.
- When disabled (default), responses remain explainable (`suggested_fix`, `actions[]`) but make no data mutations.
