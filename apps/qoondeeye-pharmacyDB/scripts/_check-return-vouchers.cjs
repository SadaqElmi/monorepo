const { PrismaClient } = require('@prisma/client');

async function main() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:sadaq123@localhost:5432/QoondeeyeDB';
  const p = new PrismaClient();
  try {
    const rows = await p.$queryRawUnsafe(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_name IN ('return_vouchers', 'ReturnVoucher')
         AND table_schema IN ('wakiil', 'test')
       ORDER BY 1, 2`,
    );
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
