/**
 * Smoke checklist for import workflows (run against a dev tenant with auth).
 *
 * 1. Product catalog: GET /api/imports/product-import/template
 * 2. Opening stock: GET /api/imports/opening-stock-import/template
 *
 * Upload → validate → preview → confirm → commit for each type.
 * Verify product import does not create inventory rows with qty > 0.
 * Verify opening stock creates opening_stock_entries.
 */
console.log('See script comments for manual E2E steps');
