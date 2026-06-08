# RBAC Phase 1 — Backend Protection Matrix

Global prefix: `/api`. All routes pass through `BranchMiddleware` unless noted.

| Endpoint | Method | Permission | Controller | Notes |
|----------|--------|------------|------------|-------|
| `/audit/verify` | GET | `view_audit_logs` | `audit.controller.ts` | PermissionGuard |
| `/audit/export` | GET | `export_audit_package` | `audit.controller.ts` | PermissionGuard |
| `/staff` | GET/POST | `manage_users` | `staff.controller.ts` | Class-level guard |
| `/staff/:id` | GET/PATCH/DELETE | `manage_users` | `staff.controller.ts` | Class-level guard |
| `/roles` | GET/POST | `manage_users` | `roles.controller.ts` | Class-level guard |
| `/roles/:id` | PATCH/DELETE | `manage_users` | `roles.controller.ts` | Class-level guard |
| `/pricing/*` | GET/PATCH/POST | `manage_pricing` | `pricing.controller.ts` | Class-level guard |
| `/price-groups/*` | GET/POST/PATCH | `manage_price_groups` | `pricing.controller.ts` | Class-level guard |
| `/offers/*` | GET/POST/PATCH | `manage_offers` | `offers.controller.ts` | Includes enable/disable/resolve |
| `/uoms/*` | GET/POST/PATCH | `edit_product` | `uoms.controller.ts` | Global UOM definitions |
| `/products/:id/uoms/*` | GET/POST/PATCH | `edit_product` | `uoms.controller.ts` | Product UOM links |
| `/products/:id` | DELETE | `delete_product` | `products.controller.ts` | Method-level guard |
| `/suppliers/:id` | DELETE | `delete_supplier` | `suppliers.controller.ts` | Replaces role check on delete only |
| `/customers/:id` | DELETE | `delete_customer` | `customers.controller.ts` | Method-level guard |
| `/purchases/:id` | DELETE | `delete_purchase` | `purchases.controller.ts` | Method-level guard |
| `/accounting/journal-entries` | POST | `post_journal` | `accounting.controller.ts` | Manual journal posting |
| `/accounting/period/approve` | POST | `close_period` | `accounting.controller.ts` | Maps spec `period/close` |
| `/accounting/period/reopen` | POST | `reopen_period` | `accounting.controller.ts` | |
| `/branches/:id` | PATCH | `change_lock_date` | `branches.controller.ts` | Only when `accountingLockDate` in body |

## Pre-existing guarded endpoints (unchanged)

| Area | Permission examples |
|------|---------------------|
| Accounting COA | `manage_accounting_configuration` |
| Financial reports / consolidation | `run_consolidation`, `reverse_consolidation`, etc. |
| Import jobs | `import_products`, `import_opening_stock`, `cleanup_import_products` |
| Customer credit | `view_customer_credit`, `create_customer_credit_sale`, etc. |
| Transaction register | `view_transaction_register` |
| Audit package (reports) | `export_audit_package` on `/reports/audit-package` |

## Not guarded in Phase 1 (intentional)

| Endpoint | Reason |
|----------|--------|
| `POST /accounting/journal-entries/reverse` | **Does not exist** — documented N/A; seed `reverse_journal` for future use |
| Product create/patch | Out of Phase 1 scope |
| Supplier create/patch | Still uses `assertSupplierMutationRole` (admin/owner) |
| Most ERP mutations | Still gated by BranchMiddleware role rules |

## Affected controllers (Phase 1 changes)

1. `accounting/audit.controller.ts`
2. `staff/staff.controller.ts`
3. `roles/roles.controller.ts`
4. `pricing/pricing.controller.ts` (both controllers)
5. `offers/offers.controller.ts`
6. `uoms/uoms.controller.ts`
7. `products/products.controller.ts`
8. `suppliers/suppliers.controller.ts`
9. `customers/customers.controller.ts`
10. `purchases/purchases.controller.ts`
11. `accounting/accounting.controller.ts`
12. `branches/branches.controller.ts`

## New permissions added

```
delete_supplier, delete_customer, delete_purchase,
post_journal, reverse_journal, close_period, reopen_period, change_lock_date
```

## Seeded role grants

All 8 new permissions → **admin** role only (existing tenants via `ensureRbacPhase1Permissions`; new tenants via provision seed + admin CROSS JOIN).
