# PharmaCare POS App

Next.js POS frontend for cashier and receipt workflows.

## Local setup

1. Copy env defaults:

```bash
cp .env.example .env.local
```

2. Start dev server:

```bash
npm run dev
```

POS runs on `http://localhost:3001`.

## Device-bound login modes

`NEXT_PUBLIC_POS_DEVICE_LOGIN_MODE` controls cashier login UI behavior:

- `legacy`: tenant + PIN only (old flow)
- `dual` (default): prefer device-bound `cashierId + PIN`, allow legacy fallback when device is not bound
- `device`: require device enrollment, then `cashierId + PIN` only

## POS rollout checklist (tenant + PIN -> device-bound cashier login)

1. Deploy backend migration and auth endpoints (`/api/auth/pos/enroll`, `/api/auth/cashier-login`, `/api/auth/pos/revoke`).
2. Keep frontend + backend in `dual` mode.
3. Pilot enroll a few pharmacy devices using manager credentials.
4. Validate revoke/rebind flow at least once per pilot tenant.
5. Add pilot tenants to backend `POS_DEVICE_ENFORCED_TENANTS` when ready.
6. Switch global mode to `device` after all active tenants are enrolled.
