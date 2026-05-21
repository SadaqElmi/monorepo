# Keep in sync with the root ../../Dockerfile.
# Render: use repo-root Dockerfile + dockerContext `.` (see ../../render.yaml). Do not set
# Render "Root Directory" to this folder — COPY paths below require the monorepo root.
# Dokploy: Build path may be `apps/qoondeeye-pharmacyDB` but Docker Context Path must be s`.`.
FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/qoondeeye-pharmacyDB ./apps/qoondeeye-pharmacyDB
COPY packages/validation ./packages/validation
COPY packages/typescript-config ./packages/typescript-config

RUN pnpm install --frozen-lockfile --filter backend...

WORKDIR /app/apps/qoondeeye-pharmacyDB

RUN pnpm prisma generate
RUN pnpm run build

EXPOSE 5555

CMD ["pnpm", "run", "start:prod"]
