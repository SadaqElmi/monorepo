# Keep in sync with the root ../../Dockerfile.
# Use this file when Dokploy "Build path" is set to `apps/qoondeeye-pharmacyDB`.
# Docker context must still be the monorepo root: set Docker Context Path to `.` (clone root).
FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/qoondeeye-pharmacyDB ./apps/qoondeeye-pharmacyDB

RUN pnpm install --frozen-lockfile --filter backend...

WORKDIR /app/apps/qoondeeye-pharmacyDB

RUN pnpm prisma generate
RUN pnpm run build

EXPOSE 5555

CMD ["pnpm", "run", "start:prod"]
