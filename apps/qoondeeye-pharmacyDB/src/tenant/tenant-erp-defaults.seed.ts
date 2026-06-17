import { PrismaClient } from '@prisma/client';
import {
  createPgPool,
  createPrismaPgFromPool,
} from '../prisma/create-pg-adapter';
import { ChartOfAccountsSeedService } from '../accounting/chart-of-accounts-seed.service';
import { JournalBooksSeedService } from '../accounting/journal-books-seed.service';

/** Idempotent ERP defaults for a dedicated tenant database after migrate. */
export async function seedTenantErpDefaults(databaseUrl: string): Promise<void> {
  const pool = createPgPool(databaseUrl, { max: 2 });
  const client = new PrismaClient({
    adapter: createPrismaPgFromPool(pool),
    log: [{ emit: 'stdout', level: 'error' }],
  });
  const coaSeed = new ChartOfAccountsSeedService();
  const booksSeed = new JournalBooksSeedService();

  try {
    await client.$connect();
    await client.$executeRawUnsafe(`
      INSERT INTO tenant_settings (business_type, import_policies, invoice_before_receive)
      SELECT 'pharmacy', '{}'::jsonb, FALSE
      WHERE NOT EXISTS (SELECT 1 FROM tenant_settings)
    `);

    const branches = await client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM branches ORDER BY created_at ASC`,
    );
    for (const branch of branches) {
      await client.$transaction(async (tx) => {
        await coaSeed.ensureAccountsForBranch(tx, branch.id);
        await booksSeed.ensureBooksForBranch(tx, branch.id);
      });
    }
  } finally {
    await client.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}
