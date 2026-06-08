# Hardcoded Role Checks Remaining After Phase 2

## Intentionally kept (temporary)

| Location | Behavior |
|----------|----------|
| `PermissionGuard` / `userHasPermissions` | Admin role bypass |
| `requireServerPermission` (frontend) | Admin role bypass |
| `filterErpNavModulesForUser` | Cashier → POS-only nav module |
| `branch.middleware.ts` | Super-admin / system paths still receive `ALL_ACCOUNTING_PERMISSIONS` |
| POS cashier/pharmacist mutation exceptions | Documented in middleware comments (role-based POS paths until fully permission-mapped) |

## Replaced in Phase 2

| Location | Now uses |
|----------|----------|
| `suppliers.controller` | Permission guards (removed `assertSupplierMutationRole`) |
| `sales-discount.policy` | `override_credit_limit` permission (+ admin role fallback) |
| `transfers.service` `assertApproverRole` | `approve_transfer` permission (+ admin/owner fallback) |
| Branch middleware global mutation gate | Removed — per-route guards |

## Still role-based (follow-up)

| Location | Notes |
|----------|-------|
| `accounting.controller` | Some `canManageSystemAccounts` admin/owner checks |
| `reconciliation.controller` / repair endpoints | Super-admin or undocumented repair access |
| `pos-sessions.controller` | Unguarded — POS scope via middleware role exceptions |
| `transactions.controller`, `return-vouchers`, `returns` | Unguarded mutations |

Recommend Phase 3: remove admin bypass, guard remaining controllers, replace POS role exceptions with `create_sale` / session permissions.
