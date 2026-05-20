FROM node:22-alpine

WORKDIR /app

RUN corepack enable

RUN apk add --no-cache openssl

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/qoondeeye-pharmacyDB ./apps/qoondeeye-pharmacyDB
COPY packages/validation ./packages/validation

RUN pnpm install --frozen-lockfile --filter backend...

WORKDIR /app/apps/qoondeeye-pharmacyDB

RUN pnpm prisma generate
RUN pnpm run build

EXPOSE 10000

CMD ["pnpm", "run", "start:prod"]
