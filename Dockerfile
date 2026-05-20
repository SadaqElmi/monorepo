FROM node:22-alpine

WORKDIR /app

RUN corepack enable

RUN apk add --no-cache openssl

COPY . .

RUN pnpm install --frozen-lockfile --filter backend...

RUN pnpm --filter backend exec prisma generate

RUN pnpm --filter backend build

EXPOSE 10000

CMD ["pnpm", "--filter", "backend", "run", "start:prod"]
