# Branch Isolation Test and Rollout

## Security Test Matrix

### Unit-level checks
- Branch policy helpers:
  - `admin`/`owner` => global access.
  - `cashier`/`staff`/`manager` => assigned-branch required.
- Middleware branch resolution:
  - non-admin request with foreign `x-branch-id` => `403`.
  - non-admin request with `x-branch-id: all` => `403`.
  - admin request with unknown branch id => `403`.

### Integration checks
- Login:
  - cashier without `users.branch_id` cannot login.
  - cashier with assigned branch receives `assignedBranchId` and single `allowedBranchIds`.
- CRUD:
  - create payload with foreign branch id is ignored/rejected for restricted roles.
  - list/get/update/delete only operate on `req.allowedBranchIds`.
- Audit:
  - denied branch access writes `audit_logs` row with action `branch_access_denied`.

### E2E checks
- Cashier sale decrements stock only in assigned branch.
- Journal entries from sale are posted only for assigned branch.
- Reports with branch scope do not leak data from other branches.
- Monitoring endpoint `/api/accounting/security/branch-access-metrics` reports denials.

## Rollout Phases

1. Deploy migration `20260414120000_branch_isolation_hardening`.
2. Backfill missing `users.branch_id` for restricted roles.
3. Deploy backend middleware/auth/staff changes.
4. Deploy frontend branch-lock changes (`team-switcher`, auth context).
5. Monitor branch denial metrics and audit events for 24-48h.
6. Remove any legacy branch-optional backend paths.

## Verification Commands

- Backend compile:
  - `npm run build`
- Frontend compile:
  - `npm run build`

Note: lint baselines currently include many pre-existing unrelated errors. Scope verification should focus on compile success and branch-isolation behavior.
