# RBAC Phase 1 — Frontend Protection Matrix

Redirect target when denied: `/dashboard`. Admin role bypass matches backend `PermissionGuard`.

## Route protection

| Route | Permission | Mechanism |
|-------|------------|-----------|
| `/configuration/staff` | `manage_users` | `requireServerPermission` in page |
| `/staff` | `manage_users` | Guard before redirect to `/configuration/staff` |
| `/configuration/roles` | `manage_users` | `requireServerPermission` in page |
| `/roles` | `manage_users` | Guard before redirect |
| `/sales/pricing-management` | `manage_pricing` | Layout guard |
| `/inventory/pricing-management` | `manage_pricing` | Guard before redirect |
| `/sales/price-groups` | `manage_price_groups` | Layout guard |
| `/inventory/configuration/price-groups` | `manage_price_groups` | Guard before redirect |
| `/sales/offer-lists` | `manage_offers` | Layout guard |
| `/accounting/audit-trail` | `view_audit_logs` | Page guard |
| `/accounting/journal-audit` | `view_audit_logs` | Page guard |
| `/accounting/configuration/*` | `manage_accounting_configuration` | Layout + per-page guards |

## Navigation filtering

Updated in `lib/erp-nav-config.ts`:

- Configuration → Staff & users: `manage_users`
- Configuration → Roles: `manage_users`
- Sales → Pricing, Price Groups, Offers: existing permission fields
- Import Center, Transaction Register: unchanged (already gated)

## Permission catalog

`lib/permissions.ts` — `ALL_PERMISSIONS` expanded to **33 keys** (full backend catalog):

- Product/import/report/pricing/staff permissions (original 13)
- Consolidation suite (5)
- Audit/disclosure (3)
- Customer credit (4)
- Import cleanup (1)
- Phase 1 delete + accounting actions (8)

Role editor and staff matrix use `PERMISSION_FULL_LABEL`, `PERMISSION_SHORT_LABEL`, and `PERMISSION_DESCRIPTIONS`.

## Pre-existing frontend guards (unchanged)

| Route | Permission |
|-------|------------|
| `/administration/import-center` | `view_import_center` |
| `/sales/transaction-register` | `view_transaction_register` |
| Chart of accounts (client) | `manage_accounting_configuration` |
