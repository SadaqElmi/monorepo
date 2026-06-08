# RBAC Phase 2 — Backend Endpoint Matrix (superset)

| Controller | Method | Permission |
|------------|--------|------------|
| products | GET* | `view_products` |
| products | POST | `create_product` |
| products | PATCH | `edit_product` |
| products | DELETE | `delete_product` |
| categories | GET | `view_products` |
| categories | POST/PATCH/DELETE | `edit_product` |
| inventory | GET* | `view_products` |
| suppliers | GET | `view_suppliers` |
| suppliers | POST | `create_supplier` |
| suppliers | PATCH | `edit_supplier` |
| suppliers | DELETE | `delete_supplier` |
| customers | GET | `view_customers` (+ credit perms on credit routes) |
| customers | POST | `create_customer` |
| customers | PATCH | `edit_customer` |
| customers | DELETE | `delete_customer` |
| purchases | GET | `view_purchases` |
| purchases | POST | `create_purchase` |
| purchases | PATCH | `edit_purchase` |
| purchases | workflow | `receive_purchase`, `post_purchase_invoice`, `delete_purchase` |
| sales | GET | `view_sales` |
| sales | POST | `create_sale` |
| sales | void | `void_sale` |
| sale-returns | GET | `view_sales` |
| sale-returns | POST/PATCH/DELETE | `refund_sale` |
| transfers | operational | `transfer_inventory` |
| transfers | approve/reject | `approve_transfer` |
| expenses | GET | `view_expenses` |
| expenses | POST | `create_expense` |
| expenses | PATCH | `edit_expense` |
| expenses | DELETE | `delete_expense` |
| expense-categories | GET | `view_expenses` |
| expense-categories | mutations | `manage_accounting_configuration` |
| branches | GET | (open — branch scope only) |
| branches | POST/PATCH/DELETE | `edit_branch` |
| branches | lock date PATCH field | `change_lock_date` (inline assert) |
| roles | GET | `view_roles` |
| roles | POST/clone | `create_role` |
| roles | PATCH | `edit_role` |
| roles | DELETE | `delete_role` |
| staff | GET | `view_staff` |
| staff | POST | `create_staff` |
| staff | PATCH | `edit_staff` (+ `assign_role` for role changes) |
| staff | DELETE | `delete_staff` |

Phase 1 controllers (accounting, audit, pricing, offers, UOMs, imports, consolidation) retain their existing guards.

Branch middleware no longer blocks mutations by role; unguarded routes are a security gap — priority controllers above are guarded in Phase 2.
