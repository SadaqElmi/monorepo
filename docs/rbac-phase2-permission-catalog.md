# RBAC Phase 2 — Permission Catalog

Canonical source: `apps/qoondeeye-pharmacyDB/src/common/security/permission-catalog.ts`

Frontend mirror: `apps/qoondeeye-pharmacy/lib/permissions.ts` (`ALL_PERMISSIONS` must match backend codes — verified by `permission-catalog.spec.ts`).

## Groups

| Group ID | Label |
|----------|-------|
| inventory | Inventory |
| purchasing | Purchasing |
| sales | Sales |
| accounting | Accounting |
| administration | Administration |
| imports | Imports |
| customer_credit | Customer Credit |
| pricing | Pricing & Offers |
| audit | Audit |
| consolidation | Consolidation |

## Phase 2 additions (CRUD + ops)

Products/inventory: `view_products`, `adjust_inventory`, `transfer_inventory`, `approve_transfer`

Purchasing: `view_suppliers`, `create_supplier`, `edit_supplier`, `view_purchases`, `create_purchase`, `edit_purchase`, `receive_purchase`, `post_purchase_invoice`

Sales: `view_sales`, `create_sale`, `refund_sale`, `void_sale`

Staff/roles: `view_staff`, `create_staff`, `edit_staff`, `delete_staff`, `view_roles`, `create_role`, `edit_role`, `delete_role`, `assign_role`

Customers: `view_customers`, `create_customer`, `edit_customer`

Expenses: `view_expenses`, `create_expense`, `edit_expense`, `delete_expense`

Administration: `edit_branch`

## Seeding

`ensureRbacPhase2Permissions` in `tenant.service.ts` inserts new codes and grants:

- **admin** — all permissions (cross join)
- **manager** — inventory, purchasing views/mutations, transfer approval, staff/roles view
- **cashier** — `view_products`, `create_sale`, `view_sales`
- **pharmacist** — POS-related subset (see tenant patch)

System roles are flagged via `ensureRolesV2Columns` (`is_system_role = true` for admin, manager, cashier, pharmacist, auditor, accountant, finance_manager).
