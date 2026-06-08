const pg = require("pg");

const SCHEMA = process.env.QA_TENANT_SCHEMA ?? "test";
const DRY_RUN = process.argv.includes("--dry-run");

const c = new pg.Client({
  connectionString:
    process.env.DATABASE_URL_LOCAL ??
    "postgresql://postgres:sadaq123@localhost:5432/QoondeeyeDB",
});

async function count(label, sql, params = []) {
  const { rows } = await c.query(sql, params);
  console.log(`${label}: ${rows[0].n}`);
  return Number(rows[0].n);
}

async function run() {
  await c.connect();
  console.log(`Schema: ${SCHEMA}${DRY_RUN ? " (dry run)" : ""}`);

  await count("products", `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".products`);
  await count(
    "product_categories",
    `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".product_categories`,
  );
  await count("inventory", `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".inventory`);
  await count("batches", `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".batches`);
  await count(
    "opening_stock_entries",
    `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".opening_stock_entries`,
  );
  await count(
    "import_jobs",
    `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".import_jobs`,
  );
  await count(
    "import_job_rows",
    `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".import_job_rows`,
  );
  await count(
    "suppliers",
    `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".suppliers`,
  );
  await count(
    "purchases",
    `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".purchases`,
  );
  await count(
    "sale_items (product-linked)",
    `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".sale_items WHERE product_id IS NOT NULL`,
  );
  await count(
    "purchase_items (product-linked)",
    `SELECT COUNT(*)::int AS n FROM "${SCHEMA}".purchase_items WHERE product_id IS NOT NULL`,
  );

  if (DRY_RUN) {
    console.log("Dry run only — no deletes executed.");
    await c.end();
    return;
  }

  await c.query("BEGIN");
  try {
    // 1) Opening-stock GL journals (original + reversal)
    const { rows: oseJournalIds } = await c.query(
      `SELECT DISTINCT je.id::text AS id
       FROM "${SCHEMA}".journal_entries je
       WHERE je.source_type IN (
         'product_import_opening_stock',
         'product_import_opening_stock_reversal'
       )
       OR je.id IN (
         SELECT journal_entry_id FROM "${SCHEMA}".opening_stock_entries
         WHERE journal_entry_id IS NOT NULL
       )
       OR je.id IN (
         SELECT reversal_journal_entry_id FROM "${SCHEMA}".opening_stock_entries
         WHERE reversal_journal_entry_id IS NOT NULL
       )`,
    );
    const journalIds = oseJournalIds.map((r) => r.id);
    if (journalIds.length) {
      await c.query(
        `UPDATE "${SCHEMA}".opening_stock_entries
         SET journal_entry_id = NULL, reversal_journal_entry_id = NULL
         WHERE journal_entry_id = ANY($1::uuid[])
            OR reversal_journal_entry_id = ANY($1::uuid[])`,
        [journalIds],
      );
      await c.query(
        `DELETE FROM "${SCHEMA}".journal_lines
         WHERE journal_entry_id = ANY($1::uuid[])`,
        [journalIds],
      );
      const delJe = await c.query(
        `DELETE FROM "${SCHEMA}".journal_entries
         WHERE id = ANY($1::uuid[])`,
        [journalIds],
      );
      console.log(`deleted journal_entries (opening stock): ${delJe.rowCount}`);
    }

    // 2) Transaction line items blocking product delete
    const delSaleItems = await c.query(
      `DELETE FROM "${SCHEMA}".sale_items WHERE product_id IS NOT NULL`,
    );
    console.log(`deleted sale_items: ${delSaleItems.rowCount}`);

    const delSaleReturnItems = await c.query(
      `DELETE FROM "${SCHEMA}".sale_return_items WHERE product_id IS NOT NULL`,
    );
    console.log(`deleted sale_return_items: ${delSaleReturnItems.rowCount}`);

    const delPurchaseItems = await c.query(
      `DELETE FROM "${SCHEMA}".purchase_items WHERE product_id IS NOT NULL`,
    );
    console.log(`deleted purchase_items (product-linked): ${delPurchaseItems.rowCount}`);

    const delAllPurchaseItems = await c.query(
      `DELETE FROM "${SCHEMA}".purchase_items`,
    );
    console.log(`deleted purchase_items (all): ${delAllPurchaseItems.rowCount}`);

    const delPurchases = await c.query(`DELETE FROM "${SCHEMA}".purchases`);
    console.log(`deleted purchases: ${delPurchases.rowCount}`);

    const delTransferItems = await c.query(
      `DELETE FROM "${SCHEMA}".stock_transfer_items WHERE product_id IS NOT NULL`,
    );
    console.log(`deleted stock_transfer_items: ${delTransferItems.rowCount}`);

    // 3) Opening stock + import jobs
    const delOse = await c.query(
      `DELETE FROM "${SCHEMA}".opening_stock_entries`,
    );
    console.log(`deleted opening_stock_entries: ${delOse.rowCount}`);

    const delJobs = await c.query(`DELETE FROM "${SCHEMA}".import_jobs`);
    console.log(`deleted import_jobs (cascades rows): ${delJobs.rowCount}`);

    // 4) Inventory + batches
    const delInv = await c.query(`DELETE FROM "${SCHEMA}".inventory`);
    console.log(`deleted inventory: ${delInv.rowCount}`);

    const delBatches = await c.query(`DELETE FROM "${SCHEMA}".batches`);
    console.log(`deleted batches: ${delBatches.rowCount}`);

    // 5) Category GL map + products + categories
    await c.query(
      `DELETE FROM "${SCHEMA}".product_category_gl_map`,
    ).catch(() => {});

    const delProducts = await c.query(`DELETE FROM "${SCHEMA}".products`);
    console.log(`deleted products: ${delProducts.rowCount}`);

    const delCats = await c.query(
      `DELETE FROM "${SCHEMA}".product_categories`,
    );
    console.log(`deleted product_categories: ${delCats.rowCount}`);

    await c.query(
      `DELETE FROM "${SCHEMA}".supplier_payments`,
    ).catch(() => {});

    const delSuppliers = await c.query(`DELETE FROM "${SCHEMA}".suppliers`);
    console.log(`deleted suppliers: ${delSuppliers.rowCount}`);

    await c.query("COMMIT");
    console.log("Cleanup committed (products, categories, inventory, batches, import/opening stock, suppliers).");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
