/**
 * Idempotent: upserts public.super_admins (SystemUser).
 * Requires SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (same DB URL vars as prisma.config).
 */

//$env:SUPER_ADMIN_EMAIL="admin@gmail.com"; $env:SUPER_ADMIN_PASSWORD="admin123"; pnpm run db:ensure-super-admin
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import {
  createPgPool,
  createPrismaPgFromPool,
  resolveDatabaseUrl,
} from '../src/prisma/create-pg-adapter';

const url = resolveDatabaseUrl();
const email = process.env.SUPER_ADMIN_EMAIL?.trim();
const password = process.env.SUPER_ADMIN_PASSWORD?.trim();

async function main() {
  if (!url) {
    throw new Error(
      'Set DATABASE_URL or DATABASE_URL_STAGING / DATABASE_URL_LOCAL (see prisma.config.ts)',
    );
  }
  if (!email || !password) {
    throw new Error(
      'Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD for this script.',
    );
  }

  const pool = createPgPool(url);
  const adapter = createPrismaPgFromPool(pool);
  const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });
  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.systemUser.upsert({
      where: { email },
      create: {
        email,
        password: hash,
        role: 'super_admin',
      },
      update: {
        password: hash,
        role: 'super_admin',
      },
    });
    console.log('Super admin upserted:', user.email, user.id);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
