# RBAC Phase 2 — Frontend Route & Nav Matrix

## Server route guards

| Route | Permission |
|-------|------------|
| `/configuration/staff` | `view_staff` (alias: `manage_users`) |
| `/configuration/roles` | `view_roles` (alias: `manage_users`) |

`requireServerPermission()` expands coarse aliases and keeps admin bypass.

## Navigation (`erp-nav-config.ts`)

Permission-gated nav items use `getEffectivePermissions()`. **Default deny:** when the session has no permissions loaded, items with a `permission` field are hidden (admin still sees all gated items).

Examples:

| Nav item | Permission |
|----------|------------|
| Products | `view_products` |
| Vendor bills | `view_purchases` |
| Suppliers | `view_suppliers` |
| Expenses | `view_expenses` |
| Stock transfers | `transfer_inventory` |
| Staff & users | `view_staff` |
| Roles | `view_roles` |
| Accounting dashboard | `view_reports` |

## Role editor UX

- Grouped permission matrix by module
- Search, clone, deactivate, system-role badges
- Staff page: read-only grouped permissions for selected role; no inline role permission editing
