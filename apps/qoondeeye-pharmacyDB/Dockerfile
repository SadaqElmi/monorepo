# Build from the monorepo root (pnpm lockfile lives at the repo root):
#   docker build -f apps/qoondeeye-pharmacyDB/Dockerfile .

FROM node:20-bookworm-slim AS builder

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/qoondeeye-pharmacyDB ./apps/qoondeeye-pharmacyDB

RUN pnpm install --frozen-lockfile --filter ./apps/qoondeeye-pharmacyDB

WORKDIR /repo/apps/qoondeeye-pharmacyDB
RUN pnpm run build

WORKDIR /repo
RUN pnpm --filter ./apps/qoondeeye-pharmacyDB deploy /deploy/app --prod --legacy

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /deploy/app ./

USER nestjs

EXPOSE 5555

CMD ["node", "dist/main.js"]
