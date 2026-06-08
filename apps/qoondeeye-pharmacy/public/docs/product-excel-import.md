# Product catalog Excel import

## Status

**Available** at Inventory → Products → Import.

Catalog-only: creates/updates products, categories, and UOM conversions. Does **not** change inventory quantities, batches, or accounting.

For stock balances use **Opening stock import**.

## Required columns

`item_no`, `name`, `category_path`

## Base unit

Use `base_uom` for the base stock unit (e.g. `PCS`, `TAB`). The legacy `unit` column is still accepted as an alias for `base_uom`.

## Optional UOM columns

`purchase_uom`, `sales_uom`, `pos_uom`, `strip_factor`, `box_factor`, `carton_factor`, `pcs_price`, `strip_price`, `box_price`, `pcs_barcode`, `strip_barcode`, `box_barcode`

Conversion factors express how many base units are in each pack (e.g. `strip_factor: 10` means 1 strip = 10 PCS).

## Optional product columns

`barcode`, `generic_name`, `strength`, `formulation`, `description`

## Removed columns (use other imports)

Do not include `opening_qty`, `branch_code`, `opening_date`, `cost_price`, `batch_number`, `expiry_date`, `list_price`, `reorder_level`, or `supplier_name` in product files — the upload will be rejected.

Set reorder levels and supplier links in the product UI or via purchase/opening stock imports.

## No automatic inventory rows

Product Import does **not** create `inventory` records. That is intentional (same as Dynamics, SAP, Odoo catalog import). Stock appears after Opening Stock Import, Purchase Import, or other inventory transactions.

## Old templates (v1 combined file)

If your file still has `opening_qty`, `branch_code`, `cost_price`, `batch_number`, `expiry_date`, or `opening_date`, upload will fail with directions to the correct import. Download template v2 from the import screen (Instructions sheet shows `Template version: 2.0.0`, `Template type: product_catalog`).

## API

- `GET /api/imports/product-import/template`
- `POST /api/imports/product-import/jobs`
