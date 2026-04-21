# Branch Isolation Contract

## Role Policy
- `admin` / `owner`: global branch visibility (can read all, mutate selected branch).
- `manager`: branch-assigned user (single-branch reads/writes).
- `staff`: branch-assigned user (single-branch reads, restricted writes).
- `cashier`: branch-assigned user (single-branch POS/sale mutations only).

## Auth Context
- JWT payload is tenant-bound and validated against `X-Tenant`.
- Request branch context is derived server-side by `BranchMiddleware`.
- Request fields:
  - `req.branchId`: effective mutation branch.
  - `req.allowedBranchIds`: allowed query scope.
  - `req.userId`: authenticated user id.
  - `req.userRole`: normalized role.

## Non-Negotiable Rules
- Backend never trusts branch from client for restricted users.
- Restricted roles must have a persisted `users.branch_id`.
- Any branch mismatch raises `403`.
- Denials are written to `audit_logs` as `branch_access_denied`.

## Login Contract
- `assignedBranchId`: immutable user branch for restricted roles.
- `allowedBranchIds`: server-authoritative branch scope for current user.
- `defaultBranchId`: initial branch context (same as `assignedBranchId` for restricted users).

## Suppliers (tenant master data)
- **Read** (`GET /suppliers`): any authenticated tenant user (tenant-wide catalog).
- **Write** (`POST` / `PATCH` / `DELETE`): **admin** or **owner** only; branch-assigned roles cannot mutate shared supplier records.

## Reconciliation
- **POST `/reconciliation/run`**: checks are limited to `req.allowedBranchIds` from `BranchMiddleware` (cron / nightly jobs omit this and scan all branches).
- **GET `/reconciliation/logs`**: when the request has branch scope, results are filtered to logs whose `metadata` references `branch_id`, `from_branch_id`, or `to_branch_id` within that scope, plus `type = 'system'` rows.
