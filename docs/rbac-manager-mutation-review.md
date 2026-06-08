# Manager Mutation Review

**Scope:** Every `POST`, `PATCH`, `DELETE` handler in `apps/qoondeeye-pharmacyDB/src/**/*.controller.ts`.

**BranchMiddleware rule (simplified):** Mutations allowed when ANY of:
- `isBranchSuperUser` (role `admin` or `owner`, or `canViewAllBranches`)
- `cashierPosMutation` (cashier on POS/sales/voucher/transaction paths)
- `pharmacistPosMutation` (pharmacist on `/api/pos/*`)
- `transferOperationalMutation` (stock transfer operational routes)

Otherwise → **403** `"Access denied: CRUD requires admin/manager"` (message is misleading — manager is **not** exempt).

**Additional controller checks:** Some endpoints add role checks beyond middleware.

Legend: **Manager?** = Can a user with role `manager` execute today?

---

## Auth & platform (no tenant branch context)

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST /auth/*` | N/A | Public / pre-tenant auth |
| `POST/PATCH/DELETE /tenants/*` | N/A | System tenant admin |
| `POST/PATCH/DELETE /system-users/*` | N/A | System scope |
| `POST/PATCH/DELETE /domains/*` | N/A | System scope |

---

## Staff & roles

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST/PATCH/DELETE /staff/*` | **No** | Blocked by middleware (`!isBranchSuperUser`) |
| `POST/PATCH/DELETE /roles/*` | **No** | Blocked by middleware |

*Note: Phase 1 adds `manage_users` PermissionGuard — manager still blocked by middleware before guard runs.*

---

## Products & UOMs

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST/PATCH /products/*` | **No** | Middleware block |
| `DELETE /products/:id` | **No** | Middleware block + `delete_product` guard |
| `POST/PATCH /uoms/*` | **No** | Middleware block + `edit_product` guard |
| `POST/PATCH /products/:id/uoms/*` | **No** | Middleware block + `edit_product` guard |
| Product supplier links | **No** | Middleware block |

---

## Pricing & offers

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `/pricing/*` mutations | **No** | Middleware block + pricing permission guards |
| `/price-groups/*` mutations | **No** | Middleware block |
| `/offers/*` mutations | **No** | Middleware block |

*Managers are seeded `manage_pricing` / `manage_offers` in DB but cannot reach mutations due to middleware.*

---

## Suppliers & customers

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST/PATCH /suppliers/*` | **No** | Middleware block + `assertSupplierMutationRole` (admin/owner) |
| `DELETE /suppliers/:id` | **No** | Same + `delete_supplier` guard |
| `POST/PATCH /customers/*` | **No** | Middleware block |
| `DELETE /customers/:id` | **No** | Middleware block + `delete_customer` guard |
| `POST /customers/:id/repayments` | **No** | Middleware block (credit guard on handler) |

---

## Purchases & vendors

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST/PATCH /purchases/*` | **No** | Middleware block |
| Purchase workflow posts (receive, post-invoice, etc.) | **No** | Middleware block |
| `DELETE /purchases/:id` | **No** | Middleware block + `delete_purchase` guard |

---

## Sales & POS

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST/PATCH/DELETE /sales/*` | **No** | Middleware block (not POS cashier path) |
| `POST /transactions/*` | **Yes** (cashier) | Cashier POS mutation exception |
| `POST /pos-sessions/*` | **Yes** (cashier/pharmacist) | POS mutation exceptions |
| `POST /return-vouchers/*` | **Yes** (cashier) | POS-related paths |

---

## Inventory transfers

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST/PATCH /transfers/*` (operational) | **Yes** | `transferOperationalMutation` exempt |
| Transfer repair endpoints | **No** | Requires admin/owner/super_admin in controller |

---

## Accounting

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST /accounting/journal-entries` | **No** | Middleware + `post_journal` |
| `POST /accounting/period/approve|reopen` | **No** | Middleware + period permissions |
| COA mutations | **No** | Middleware + `manage_accounting_configuration` |
| Consolidation mutations | **No** | Middleware + consolidation permissions |
| `POST /accounting/supplier-payments` etc. | **No** | Middleware block |

---

## Branches & configuration

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `POST/PATCH/DELETE /branches/*` | **No** | Middleware block |
| Lock date PATCH | **No** | Middleware + `change_lock_date` when field set |
| `POST/PATCH/DELETE /categories/*` | **No** | Middleware block |
| `POST/PATCH/DELETE /expenses/*` | **No** | Middleware block |

---

## Import center

| Endpoint | Manager? | Why |
|----------|----------|-----|
| Import job mutations | **No** | Middleware block |
| *Exception:* manager has `import_products` in DB | — | Still blocked at middleware |

---

## Audit

| Endpoint | Manager? | Why |
|----------|----------|-----|
| `GET /audit/verify` | **Yes** (read) | GET allowed for all roles |
| `GET /audit/export` | **Yes** (read) | GET — but now requires `export_audit_package` via guard |

---

## Summary

| Category | Manager can mutate? |
|----------|---------------------|
| POS / cashier paths | Yes (cashier role, not manager) |
| Stock transfer operations | Yes (all tenant roles on operational routes) |
| General ERP CRUD | **No** |
| Seeded manager permissions (pricing, import, users) | **No** (middleware prevents mutations) |

## Recommendation for Phase 2

1. Decide which manager actions should be allowed (pricing, staff, imports, etc.).
2. Align `BranchMiddleware` with that decision — either add manager to mutation gate or document permissions as read-only for manager.
3. Fix misleading error message: `"CRUD requires admin/manager"` → accurate text.

**No behavior changed in Phase 1.**
