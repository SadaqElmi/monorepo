# Admin Bypass Audit & Phase 2 Migration Plan

Document all places where `admin` (or equivalent super-role) bypasses permission enforcement.

---

## 1. PermissionGuard admin bypass

**File:** `apps/qoondeeye-pharmacyDB/src/common/security/permission.guard.ts`

```typescript
if (role === 'admin') {
  return true;
}
```

**Impact:** Any `@RequirePermissions` check passes for tenant role `admin` regardless of `req.permissionCodes` or DB grants.

**Risk:** Admin users without seeded permissions still access all guarded endpoints. Masks misconfigured role_permissions.

**Phase 2:** Remove bypass after verifying every admin role has full permission set in DB; use integration tests per endpoint.

---

## 2. BranchMiddleware permission fallback

**File:** `apps/qoondeeye-pharmacyDB/src/common/middleware/branch.middleware.ts` (~line 736)

When `req.permissionCodes` is empty after DB load:
- `admin` and `manager` receive `ALL_ACCOUNTING_PERMISSIONS` as fallback.

**Impact:** Admin/manager may pass accounting PermissionGuard checks even without explicit DB grants for consolidation/audit permissions.

**Phase 2:** Remove fallback; require JWT to carry permissions from DB only.

---

## 3. Accounting controller hardcoded roles

**File:** `apps/qoondeeye-pharmacyDB/src/accounting/accounting.controller.ts`

- `isAccountingSuperRole()` — `admin`, `owner`, `super_admin`
- Used for sensitive COA operations beyond PermissionGuard

**Impact:** Owner bypasses permission codes for some accounting flows.

**Phase 2:** Replace with explicit permissions; grant owner role appropriate codes in DB.

---

## 4. Sales discount policy

**File:** `apps/qoondeeye-pharmacyDB/src/sales/sales.service.ts` (~line 134)

```typescript
if (role === 'admin') return; // skip discount validation
```

**Impact:** Admin can apply any discount without policy limits.

**Phase 2:** Optional permission e.g. `override_discount_limit` instead of role check.

---

## 5. Supplier mutation role check

**File:** `apps/qoondeeye-pharmacyDB/src/suppliers/suppliers.controller.ts`

`assertSupplierMutationRole` — admin/owner only for create/patch (delete now uses `delete_supplier` permission).

**Impact:** Parallel authorization path outside PermissionGuard.

**Phase 2:** Replace with `manage_suppliers` permission (new) or reuse existing pattern.

---

## 6. Repair / reconciliation controllers

**Files:**
- `reconciliation/reconciliation.controller.ts`
- `transfers/transfer-repair.controller.ts`

Upstream role check: `super_admin`, `admin`, or `owner`.

**Impact:** Platform/branch super-users only; not permission-based.

**Phase 2:** Dedicated repair permissions for controlled access.

---

## 7. Frontend admin bypass

**Files:**
- `lib/auth-server.ts` — `requireServerPermission` allows `role === 'admin'`
- Import Center, Transaction Register pages — same pattern
- Chart of accounts client — admin/manager/owner fallback when permissions empty

**Impact:** Admin can access protected routes without permission cookie entries.

**Phase 2:** Remove admin fallback from `requireServerPermission`; rely on cookie permissions only.

---

## 8. Navigation empty-permissions fallback

**File:** `apps/qoondeeye-pharmacy/lib/erp-nav-config.ts`

```typescript
if (!perms.size) return base; // show all nav items
```

**Impact:** Users with empty permissions array see all links including gated ones (route guards still block).

**Phase 2:** Default deny — hide permission-gated nav when permissions unknown.

---

## Phase 2 migration sequence

1. **Audit DB grants** — Ensure admin role has all permission codes via `role_permissions` for every tenant.
2. **Verify JWT** — Login flow populates `permissions` claim from DB for all roles.
3. **Remove PermissionGuard admin bypass** — Run API test suite; fix failures by granting permissions not by restoring bypass.
4. **Remove middleware ALL_ACCOUNTING_PERMISSIONS fallback** — Same verification.
5. **Remove frontend admin bypass** — Users must re-login after role changes.
6. **Replace hardcoded role checks** — One domain at a time (suppliers, accounting super-role, repair endpoints).
7. **Fix manager middleware gate** — Align with business policy (see manager mutation review).

---

## Phase 3 (out of scope)

- Branch-scoped permissions
- New roles (owner, finance_manager normalization)
- Permission inheritance / role templates

**Phase 1 leaves all bypasses intact — documentation only.**
