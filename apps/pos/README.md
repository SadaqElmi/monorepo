# PharmaCare POS App

Next.js POS frontend for cashier and receipt workflows.

## Local setup

1. Copy env defaults:

```bash
cp .env.example .env.local
```

2. Start dev server:

From the **repository root**:

```bash
pnpm dev:pos
```

Or from this app directory:

```bash
pnpm dev
```

POS runs on `http://localhost:3001`.

## POS terminal setup and cashier login

1. Manager provisions the terminal in the ERP dashboard (`Configuration → POS Terminals`).
2. POS first-time setup: server URL (`https://api.qoondeeye.online`), optional tenant code, terminal username, and setup password.
3. Daily cashier login: Staff ID + PIN only (device binding is stored locally after setup).

Use **Reconfigure terminal** on the idle launcher to clear local binding and run setup again after a manager reset/revoke in the dashboard.

Legacy PIN login without device binding and manager email login on POS have been retired.
