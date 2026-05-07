FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install

RUN pnpm --filter backend prisma generate

RUN apk add --no-cache openssl

RUN pnpm --filter backend build

EXPOSE 5555

CMD ["pnpm", "--filter", "backend", "run", "start:prod"]
