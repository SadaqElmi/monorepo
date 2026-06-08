# RBAC Phase 1 — Migration Safety Notes

## Existing tenants

- `ensureRbacPhase1Permissions` runs idempotently via `applyTenantSchemaPatches` on every tenant-scoped request.
- New permissions are inserted with `ON CONFLICT DO NOTHING`.
- Admin role receives all 8 new permissions via `ON CONFLICT DO NOTHING` on `role_permissions`.
- No permissions are removed or revoked from non-admin roles.

## Admin bypass interaction

- `PermissionGuard` still bypasses all checks when `req.userRole === 'admin'`.
- Tenants whose admin users rely on bypass without DB grants continue to work.
- Non-admin users now require explicit DB grants for newly guarded actions.

## Manager + permission mismatch

- Managers may hold `manage_pricing`, `manage_users`, etc. in DB but **BranchMiddleware blocks most ERP mutations** for manager (not `isBranchSuperUser`).
- Error message says "admin/manager" but code checks `isBranchSuperUser` (admin/owner only).
- Phase 1 does **not** change this — see `rbac-manager-mutation-review.md`.

## JWT / cookie permissions

- Frontend route guards read `session.permissions` from auth cookie.
- Users must re-login (or refresh session) after role permission changes to see updated nav and pass route guards.
- Empty `permissions[]` in cookie still shows all permission-gated nav items (pre-existing behavior).

## Endpoint mapping

| Spec | Implemented as |
|------|----------------|
| `POST /accounting/period/close` | `POST /accounting/period/approve` + `close_period` |
| `POST /accounting/journal-entries/post` | `POST /accounting/journal-entries` + `post_journal` |
| `POST /accounting/journal-entries/reverse` | N/A — no HTTP endpoint |
| `PATCH /branches/*/lock-date` | `PATCH /branches/:id` when `accountingLockDate` present |

## Rollback

- Remove `@UseGuards` / `@RequirePermissions` decorators to revert API enforcement.
- Frontend: revert page/layout guards and `ALL_PERMISSIONS` expansion.
- DB: seeded permissions are harmless if unused; no migration down required.
