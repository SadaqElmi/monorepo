// Env is loaded via `node -r ./load-env.cjs` in package.json scripts (before this file runs).
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url:
      process.env['CONTROL_DATABASE_URL'] ?? process.env['DATABASE_URL'],
  },
});
