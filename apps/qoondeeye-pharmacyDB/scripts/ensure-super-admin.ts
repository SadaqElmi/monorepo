/**
 * Idempotent: upserts public.super_admins (SystemUser).
 * Requires SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (same DB URL vars as prisma.config).
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const url =
  process.env.DATABASE_URL_STAGING ?? process.env.DATABASE_URL_LOCAL;
const email = process.env.SUPER_ADMIN_EMAIL?.trim();
const password = process.env.SUPER_ADMIN_PASSWORD;

async function main() {
  if (!url) {
    throw new Error(
      'Set DATABASE_URL_STAGING or DATABASE_URL_LOCAL (see prisma.config.ts)',
    );
  }
  if (!email || !password) {
    throw new Error(
      'Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD for this script.',
    );
  }

  const adapter = new PrismaPg({ connectionString: url });
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
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
