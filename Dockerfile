# Build from the monorepo root (clone root), not from apps/qoondeeye-pharmacyDB.
# Example: docker build .
# Dokploy: Docker File = Dockerfile (or leave default), Docker Context Path = .
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
