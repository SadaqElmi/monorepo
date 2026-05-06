# Docker and Dokploy (qoondeeye-pharmacyDB)

The image is built with **pnpm** using the **repository root** lockfile (`pnpm-lock.yaml`). The Dockerfile lives under this app so paths stay easy to find, but Docker **build context** must be the monorepo root.

## Build locally

From the **repository root**:

```bash
docker build -f apps/qoondeeye-pharmacyDB/Dockerfile .
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

## Dokploy

| Setting | Value |
| -------- | ----- |
| Build path / context | **Repository root** (the folder that contains `pnpm-lock.yaml` and `pnpm-workspace.yaml`) |
| Dockerfile path | **`apps/qoondeeye-pharmacyDB/Dockerfile`** |

Do not set the build path to only `apps/qoondeeye-pharmacyDB` alone: the Dockerfile needs the root lockfile and workspace files copied into the image.

## Runtime environment

Set at least:

- **`DATABASE_URL`** — PostgreSQL connection string for Prisma
- **`JWT_SECRET`** (and any other secrets your deployment uses)
- **`PORT`** — optional; defaults to **5555** in code if unset
- **`CORS_ORIGIN`** — optional; comma-separated origins if not using defaults in code

The container entrypoint is **`node dist/main.js`** (production). Run database migrations as a separate deploy step unless you add your own entrypoint script.
