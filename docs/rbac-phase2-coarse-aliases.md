# RBAC Phase 2 — Coarse Permission Aliases

Guards and frontend route checks expand legacy coarse permissions to granular codes before evaluating access.

## Alias map

| Coarse code | Implies |
|-------------|---------|
| `manage_users` | `view_staff`, `create_staff`, `edit_staff`, `delete_staff`, `view_roles`, `create_role`, `edit_role`, `delete_role`, `assign_role` |
| `manage_pricing` | `view_products`, `edit_product`, `manage_pricing` |
| `manage_price_groups` | `manage_price_groups` |
| `manage_offers` | `manage_offers` |
| `manage_accounting_configuration` | `manage_accounting_configuration`, `view_reports` |

## Implementation

- Backend: `expandPermissionCodes()` / `hasEffectivePermission()` in `permission-catalog.ts`; used by `PermissionGuard` and `assertHasPermission`.
- Frontend: `getEffectivePermissions()` / `hasEffectivePermission()` in `lib/permissions.ts`; used by `requireServerPermission()` and `filterErpNavModulesForUser()`.

## Migration for tenants

Existing roles that only have `manage_users` automatically satisfy granular staff/role guards without re-saving roles. New custom roles should use granular codes in the role editor; `manage_users` remains valid as a legacy alias.

Admin role bypass in guards is unchanged (planned removal in a later phase).
