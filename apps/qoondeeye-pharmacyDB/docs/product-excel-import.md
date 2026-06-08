# Product Excel import — column reference

Operator-facing copy: `qoondeeye-pharmacy/public/docs/product-excel-import.md`.

Implementation:

- `src/import/import-parser.service.ts` — `PRODUCT_IMPORT_HEADERS`
- `src/import/handlers/product-import.handler.ts`
- `src/import/import-template.service.ts`

## Required headers

`item_no`, `name`, `category_path`

## Base unit

`base_uom` (preferred) or legacy `unit`

## Optional UOM headers

`purchase_uom`, `sales_uom`, `pos_uom`, `strip_factor`, `box_factor`, `carton_factor`, `pcs_price`, `strip_price`, `box_price`, `pcs_barcode`, `strip_barcode`, `box_barcode`

## Optional product headers

`barcode`, `generic_name`, `strength`, `formulation`, `description`

## API

- `GET /api/imports/product-import/template`
- `POST /api/imports/product-import/jobs` (`import_type`: product)
