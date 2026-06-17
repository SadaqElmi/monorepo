# POS terminal rollout runbook

Production POS uses the **standalone app** (`apps/pos`, e.g. `https://pos.qoondeeye.online`) with the **shared API** (`https://api.qoondeeye.online`). The ERP embedded `/pos` route redirects to the standalone app.

## Deploy order

1. **Backend** (`apps/qoondeeye-pharmacyDB`)
   - Apply control DB migrations (`pos_devices` indexes, `updated_by_user_id`, `pos_control_audit_events`).
   - Run tenant migrations (`pos_shift_extensions`): `pnpm tenant:migrate:all`
   - Set environment variables:
     - `JWT_CASHIER_EXPIRES_IN=28800` (8h)
     - `POS_RATE_LIMIT_REDIS_REQUIRED=true` (production)
     - `POS_SETUP_REQUIRE_TENANT_CODE=true` (after POS app rollout)
     - Redis URL configured and reachable
   - Deploy API to `api.qoondeeye.online`.

2. **ERP dashboard** (`apps/qoondeeye-pharmacy`)
   - Set `NEXT_PUBLIC_POS_APP_URL=https://pos.qoondeeye.online`.
   - Deploy; verify **Configuration → POS Terminals** list pagination/filters and terminal activity page.
   - Verify **Accounting → POS Shifts** report and variance approval.
   - Verify **Accounting → Audit trail** filter **POS auth only** and `GET /api/audit/pos` (global POS audit).

3. **Standalone POS** (`apps/pos`)
   - Set `NEXT_PUBLIC_API_URL=https://api.qoondeeye.online`.
   - Deploy to `pos.qoondeeye.online`.

## Per-tenant provisioning

1. Manager signs in to ERP → **Configuration → POS Terminals**.
2. Create terminal: display name, branch, username (globally unique, e.g. `hayatpos01`), setup password.
3. On each physical register, open the standalone POS app.
4. **First-time setup:** server URL `https://api.qoondeeye.online`, **tenant code** (e.g. `hayat`), terminal username, setup password.
5. **Daily use:** Staff ID + PIN only (all roles, including managers).
6. **Open shift:** cashier enters opening cash before sales.
7. **Shift lock:** supervisor can pause/resume from register; close shift posts cash count via POS close-shift flow.

## Reset / revoke

| Scenario | Action |
|----------|--------|
| Lost device / stolen terminal | ERP → **Revoke binding** on the terminal |
| Re-provision same hardware | ERP → **Reset password**, then POS → **Clear binding & start over** → setup again |
| Decommission register | ERP → **Deactivate** terminal |
| Reactivate register | ERP → **Reactivate** or edit status to active |
| Cashier forgot to close shift | ERP → **Accounting → POS Shifts** → **Close shift** (links to POS statement) or manager force-close on statement |

## Smoke test (per tenant)

- [ ] Create terminal in ERP (verify created-by shown)
- [ ] POS setup with tenant code succeeds and stores device credential
- [ ] `/staff-login` redirects to setup when device not bound
- [ ] Cashier staff login returns JWT with `authMode: device_pin`
- [ ] Open shift dialog records opening cash
- [ ] Complete a test sale
- [ ] Z-report closes session
- [ ] Pause/resume shift from register (paused overlay blocks sales)
- [ ] ERP **POS Shifts** lists open/closed shifts; approve variance when needed
- [ ] ERP terminal activity page shows sessions, audit trail, and login failure tabs
- [ ] `GET /api/audit/pos` returns merged control + tenant events (no secrets in payload)

## 48-hour monitoring

Watch structured logs and audit rows for:

- `pos_auth_lockout_triggered` / `pos_auth_lockout_active` (vectors: `setup`, `setup_ip`, `staff_pin`, `device_credential`)
- Spikes in `pos_staff_login_failure` or `pos_terminal_setup_failure`
- HTTP 429 on `/api/auth/staff-login` or `/api/auth/pos/setup`
- `TENANT_TERMINAL_MISMATCH` on setup

Alert if failure rate exceeds baseline for any tenant or terminal username.

## Rollback

- Set `POS_SETUP_REQUIRE_TENANT_CODE=false` if old POS builds lack tenant code field.
- Set `POS_RATE_LIMIT_REDIS_REQUIRED=false` only if Redis outage blocks all POS auth (dev/staging).
- Point `NEXT_PUBLIC_POS_APP_URL` to a known-good POS build.
- Terminals already bound continue to work if API is backward compatible.
- Do not re-enable legacy manager email login or `pin-login` without device credential.

## Staged rollout (recommended)

1. Deploy backend + ERP with env flags off (`POS_SETUP_REQUIRE_TENANT_CODE=false`).
2. Deploy POS app with required tenant code UI.
3. Smoke test one tenant (hayat or aman).
4. Flip `POS_SETUP_REQUIRE_TENANT_CODE=true` and `POS_RATE_LIMIT_REDIS_REQUIRED=true`.
5. Run `migrate-all-tenants.ts` for shift schema on all active tenants.
6. Monitor 48 hours per runbook.
