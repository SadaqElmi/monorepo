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

## Dokploy

| Setting | Value |
| -------- | ----- |
| Docker File | **`Dockerfile`** (recommended — matches Dokploy’s default when the field is empty on older installs) |
| Docker Context Path | **`.`** |

Git integration: leave **Build Path** empty so the clone root contains `pnpm-lock.yaml` and this `Dockerfile`.

If you still see `docker buildx build requires 1 argument`, upgrade Dokploy (older releases mishandled an empty Dockerfile name) or ensure **Docker File** is not blank and **Build Path** is not set to a subdirectory unless you intentionally build from there.

The context must be the repository root (where `pnpm-lock.yaml` and `pnpm-workspace.yaml` live). Do not use only `apps/qoondeeye-pharmacyDB` as context unless you change the Dockerfile layout to match.

## Runtime environment

Set at least:

- **`DATABASE_URL`** — PostgreSQL connection string for Prisma
- **`JWT_SECRET`** (and any other secrets your deployment uses)
- **`PORT`** — optional; defaults to **5555** in code if unset
- **`CORS_ORIGIN`** — optional; comma-separated origins if not using defaults in code

The container entrypoint is **`node dist/main.js`** (production). Run database migrations as a separate deploy step unless you add your own entrypoint script.
