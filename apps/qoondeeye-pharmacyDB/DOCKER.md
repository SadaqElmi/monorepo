# Docker and Dokploy (qoondeeye-pharmacyDB)

The image is built with **pnpm** using the **repository root** lockfile (`pnpm-lock.yaml`). The Dockerfile is **`Dockerfile`** at the repository root; Docker **build context** must be the monorepo root.

## Build locally

From the **repository root**:

```bash
docker build .
```

## Run with Postgres (compose)

From the **repository root**:

```bash
docker compose -f apps/qoondeeye-pharmacyDB/docker-compose.yml up --build
```

API listens on port **5555** by default (see `PORT` in [`src/main.ts`](./src/main.ts)). Compose maps `5555:5555` and sets `DATABASE_URL` for the `db` service.

Apply migrations separately when needed (e.g. one-off job or CI):

```bash
pnpm --filter ./apps/qoondeeye-pharmacyDB exec prisma migrate deploy
```

## Render

Use the repo root **`render.yaml`** (Blueprint) or match these dashboard settings:

| Setting | Value |
| -------- | ----- |
| **Root Directory** | **empty** (repo root). Never `apps/qoondeeye-pharmacyDB` — Render will not send `pnpm-workspace.yaml` or `packages/` to Docker. |
| **Dockerfile Path** | **`Dockerfile`** (at repo root) |
| **Docker Build Context** | **`.`** (repo root) |

If the build log shows `transferring context: 3.70kB` and `COPY ... not found`, the root directory or Docker context is wrong.

Recommended: connect the repo as a [Blueprint](https://render.com/docs/infrastructure-as-code) so `render.yaml` applies `dockerContext: .` and `dockerfilePath: ./Dockerfile` automatically.

## Dokploy

| Setting | Value |
| -------- | ----- |
| Docker File | **`Dockerfile`** (default). If your app uses **Build path** = `apps/qoondeeye-pharmacyDB`, that path is also valid — the same image is defined in this folder. |
| Docker Context Path | **`.`** (the **clone root**, so `pnpm-lock.yaml` and `apps/` are in the build context) |

Git **Build path**: either **empty** (uses the root `Dockerfile`) or **`apps/qoondeeye-pharmacyDB`** (uses `apps/qoondeeye-pharmacyDB/Dockerfile`). In both cases, keep **Docker Context Path** = **`.`** so the context is the monorepo root, not the app directory alone.

If you still see `docker buildx build requires 1 argument`, upgrade Dokploy (older releases mishandled an empty Dockerfile name) or ensure **Docker File** is not blank and **Build Path** is not set to a subdirectory unless you intentionally build from there.

The context must be the repository root (where `pnpm-lock.yaml` and `pnpm-workspace.yaml` live). Do not use only `apps/qoondeeye-pharmacyDB` as context unless you change the Dockerfile layout to match.

## Runtime environment

Set at least:

- **`DATABASE_URL`** — PostgreSQL connection string for Prisma
- **`JWT_SECRET`** (and any other secrets your deployment uses)
- **`PORT`** — optional; defaults to **5555** in code if unset

### CORS (`CORS_ORIGIN`)

The API enables **credentialed** CORS (`Access-Control-Allow-Credentials: true`). Browser clients (main ERP app and standalone POS app) call `fetch` with `credentials: "include"`, so allowed origins must be **explicit** (not `*`).

- **`CORS_ORIGIN`** — **Set this in any deployed environment** that serves a browser UI on a different origin than the API (e.g. Vercel → `api.qoondeeye.online`). Comma-separated list, no spaces required (spaces after commas are trimmed).

  Example:

  ```text
  CORS_ORIGIN=https://your-erp.vercel.app,https://your-pos.vercel.app,https://app.example.com
  ```

  Include **every** origin users hit: production URL, custom domains, and each Vercel **preview** URL you care about (previews are separate origins unless you use a stable alias).

- **When `CORS_ORIGIN` is unset** — the server falls back to local development only: `http://localhost:3000` (main Next app, default port) and `http://localhost:3001` (POS `next dev` script). That default is **not** suitable for production.

At startup the process logs: `CORS allowed origins: …` so you can confirm the parsed list.

**Redeploy or restart** the API after changing `CORS_ORIGIN`.

### Verify CORS after deploy

From a shell (use `curl.exe` on Windows so headers match real curl):

```bash
curl.exe -sI -X OPTIONS "https://api.qoondeeye.online/api/auth/login" \
  -H "Origin: https://your-frontend.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

Expect `204` or `200` and headers including `access-control-allow-origin` echoing that origin and `access-control-allow-credentials: true`.

The container entrypoint is **`node dist/main.js`** (production). Run database migrations as a separate deploy step unless you add your own entrypoint script.
