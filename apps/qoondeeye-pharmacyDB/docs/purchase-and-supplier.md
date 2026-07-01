# Purchase & Supplier — Domain References

This document describes how **suppliers** (vendors) and **purchases** (vendor bills) work across the PharmCare ERP stack: database schema, backend services, accounting, and frontend UI.

## Terminology

| UI label           | Database / API                      | Notes                             |
| ------------------ | ----------------------------------- | --------------------------------- |
| **Vendors** (nav)  | `suppliers` table, `/api/suppliers` | Supplier master data              |
| **Bills** (nav)    | `purchases` table, `/api/purchases` | Purchase orders / vendor invoices |
| **Payments** (nav) | `supplier_payments` table           | AP payments to suppliers          |

Purchases are **branch-scoped**. Suppliers are **tenant-wide** (shared across branches).

---

## Supplier

### Purpose

A supplier is a vendor you buy inventory from. Suppliers are linked to:

- **Products** — optional default supplier on a product (`products.supplier_id`)
- **Purchases** — every bill can reference a supplier (`purchases.supplier_id`)
- **Journal lines** — AP entries tag the supplier as accounting partner (`partner_kind = 'supplier'`)

### Database schema

Table: `suppliers` (tenant schema, e.g. `tenant_template`)

| Column       | Type         | Description       |
| ------------ | ------------ | ----------------- |
| `id`         | UUID         | Primary key       |
| `name`       | VARCHAR(255) | Supplier name     |
| `phone`      | VARCHAR(50)  | Phone             |
| `email`      | VARCHAR(255) | Email             |
| `address`    | TEXT         | Address           |
| `created_at` | TIMESTAMP    | Created timestamp |

Prisma model: `apps/qoondeeye-pharmacyDB/prisma/schema.prisma` → `Supplier`

### API — `/api/suppliers`

| Method   | Path                 | Auth / scope        | Description                         |
| -------- | -------------------- | ------------------- | ----------------------------------- |
| `GET`    | `/api/suppliers`     | Tenant (`X-Tenant`) | List all suppliers, ordered by name |
| `GET`    | `/api/suppliers/:id` | Tenant              | Get one supplier                    |
| `POST`   | `/api/suppliers`     | Admin or owner only | Create supplier                     |
| `PATCH`  | `/api/suppliers/:id` | Admin or owner only | Update supplier                     |
| `DELETE` | `/api/suppliers/:id` | Admin or owner only | Delete supplier                     |

**Backend:** `SuppliersController` → `SuppliersService`  
**Frontend client:** `apps/qoondeeye-pharmacy/lib/services/suppliers.ts`

### Create / update payload

All fields optional:

```json
{
  "name": "ABC Pharma Ltd",
  "phone": "+252...",
  "email": "orders@abc.com",
  "address": "Mogadishu"
}
```

### Frontend UI

| Route                | Component                                                        |
| -------------------- | ---------------------------------------------------------------- |
| `/vendors/suppliers` | `suppliers-client.tsx` — list, search, create/edit sheet, delete |
| Legacy redirect      | `/suppliers` → vendors area                                      |

Mutation (create/update/delete) requires **admin or owner** role (`hasGlobalBranchAccess`).

---

## Purchase (Vendor Bill)

### Purpose

A purchase records goods ordered or received from a supplier. It drives:

1. **Inventory** — receiving creates `batches` and increases stock
2. **Accounting** — posting invoice creates journal entries (Inventory ↔ Cash or AP)
3. **Supplier AP balance** — when `on_credit = true`, credits Accounts Payable tagged to the supplier

### Database schema — `purchases`

| Column                | Type          | Description                               |
| --------------------- | ------------- | ----------------------------------------- |
| `id`                  | UUID          | Primary key                               |
| `supplier_id`         | UUID          | FK → `suppliers` (optional)               |
| `branch_id`           | UUID          | FK → `branches`                           |
| `invoice_number`      | VARCHAR(100)  | Legacy / synced invoice number            |
| `supplier_invoice_no` | VARCHAR(100)  | Supplier's invoice number                 |
| `purchase_order_no`   | VARCHAR(100)  | Internal PO number                        |
| `total_amount`        | NUMERIC(12,2) | Header total                              |
| `purchase_date`       | DATE          | Document date                             |
| `order_date`          | DATE          | Order date                                |
| `posting_date`        | DATE          | Accounting posting date                   |
| `due_date`            | DATE          | Payment due date                          |
| `status`              | VARCHAR(32)   | Workflow status (see below)               |
| `notes`               | TEXT          | Header notes                              |
| `on_credit`           | BOOLEAN       | `true` → credit AP; `false` → credit Cash |
| `released_at`         | TIMESTAMP     | When released from draft                  |
| `received_at`         | TIMESTAMP     | When stock received                       |
| `invoiced_at`         | TIMESTAMP     | When accounting posted                    |
| `created_at`          | TIMESTAMP     | Created timestamp                         |

### Database schema — `purchase_items`

| Column                 | Type          | Description                         |
| ---------------------- | ------------- | ----------------------------------- |
| `id`                   | UUID          | Primary key                         |
| `purchase_id`          | UUID          | FK → `purchases` (CASCADE delete)   |
| `branch_id`            | UUID          | Branch                              |
| `product_id`           | UUID          | FK → `products`                     |
| `batch_id`             | UUID          | FK → `batches` (set on receive)     |
| `quantity`             | INTEGER       | Ordered quantity                    |
| `quantity_received`    | INTEGER       | Received quantity (0 until receive) |
| `cost_price`           | NUMERIC(10,2) | Unit cost                           |
| `selling_price`        | NUMERIC(10,2) | Unit selling price                  |
| `expiry_date`          | DATE          | Line expiry (pharmacy)              |
| `line_discount`        | NUMERIC(12,2) | Line discount                       |
| `tax_amount`           | NUMERIC(12,2) | Line tax                            |
| `line_notes`           | TEXT          | Line notes                          |
| `planned_batch_number` | VARCHAR(100)  | Batch number before receive         |
| `planned_expiry_date`  | DATE          | Expiry before receive               |

**Line total formula:** `qty × cost_price − line_discount + tax_amount`  
Header `total_amount` uses provided value if > 0, otherwise sum of line totals.

### Purchase workflow & statuses

Defined in `purchase-workflow.types.ts`:

| Status               | Editable? | Inventory posted? | Invoice posted? | Description                               |
| -------------------- | --------- | ----------------- | --------------- | ----------------------------------------- |
| `draft`              | Yes       | No                | No              | Initial state; lines can be edited        |
| `released`           | Yes       | No                | No              | PO sent / approved                        |
| `partially_received` | No        | Partial           | No              | Reserved for partial receive (future)     |
| `received`           | No        | Yes               | No              | Batches created, stock increased          |
| `invoiced`           | No        | Yes               | Yes             | Journal entry posted                      |
| `closed`             | No        | Yes               | Yes             | Final state                               |
| `cancelled`          | —         | —                 | —               | Deleted; stock/journal reversed if posted |

#### Workflow transitions

```
                    ┌─────────┐
                    │  draft  │
                    └────┬────┘
                         │ release
                         ▼
                    ┌──────────┐
                    │ released │
                    └────┬─────┘
                         │ receive
                         ▼
                    ┌──────────┐
                    │ received │
                    └────┬─────┘
                         │ post-invoice
                         ▼
                    ┌──────────┐
                    │ invoiced │
                    └────┬─────┘
                         │ close
                         ▼
                    ┌──────────┐
                    │  closed  │
                    └──────────┘

cancel (from most states) → reverses stock + journal, deletes purchase
```

**Create modes** (`workflow` field on POST):

| Mode                  | Behavior                                                  |
| --------------------- | --------------------------------------------------------- |
| `immediate` (default) | draft → receive → post-invoice → close in one transaction |
| `draft`               | Stops at `draft`; user advances manually via actions      |

**Tenant setting:** `tenant_settings.invoice_before_receive`

- `false` (default): must **receive** before **post-invoice**
- `true`: allows invoicing before receive

### Receive (inventory)

On receive (`POST /api/purchases/:id/receive`):

1. For each line with `quantity > 0`:
   - Creates a `batches` row (batch number, expiry, cost, selling price)
   - Sets `purchase_items.batch_id` and `quantity_received`
   - Calls `inventoryService.increaseStock`
2. Sets purchase `status = 'received'`, `received_at = now()`

**Pharmacy rules** (`businessType = 'pharmacy'`):

- `batch_number` required → error `PHARMACY_BATCH_REQUIRED`
- `expiry_date` required → error `PHARMACY_EXPIRY_REQUIRED`

### Post invoice (accounting)

On post-invoice (`POST /api/purchases/:id/post-invoice`):

Journal entry (`source_type = 'purchase'`):

| Account                      | Debit          | Credit         |
| ---------------------------- | -------------- | -------------- |
| Inventory                    | `total_amount` |                |
| Cash **or** Accounts Payable |                | `total_amount` |

- `on_credit = false` → credit **Cash**
- `on_credit = true` → credit **Accounts Payable**, partner = supplier

Both lines tag `partner_kind = 'supplier'` and `partner_id = supplier_id` when supplier is set.

### Cancel

`POST /api/purchases/:id/cancel`:

1. If invoiced/closed → reverse purchase journal
2. If received/invoiced/closed/partially_received → revert stock from batches
3. Delete all `purchase_items` and the `purchases` row

### Purchase refunds

Table: `purchase_refunds` (created via accounting schema extension)

| Column                           | Type          |
| -------------------------------- | ------------- |
| `id`, `branch_id`, `purchase_id` | UUID          |
| `amount`                         | NUMERIC(14,2) |
| `refund_date`                    | DATE          |
| `on_credit`                      | BOOLEAN       |
| `notes`                          | TEXT          |

`POST /api/purchases/:id/refunds` — financial credit without deleting the purchase. Posts `purchase_refund` journal (reverse of purchase AP/cash effect).

---

## API — `/api/purchases`

All endpoints require tenant context (`X-Tenant`) and branch access (`x-branch-id`).

| Method   | Path                                                | Description                                                |
| -------- | --------------------------------------------------- | ---------------------------------------------------------- |
| `GET`    | `/api/purchases`                                    | List purchases for allowed branches                        |
| `GET`    | `/api/purchases?page=&limit=`                       | Paginated list                                             |
| `GET`    | `/api/purchases/line-pricing-by-product`            | Last purchase pricing per product (for bill form defaults) |
| `GET`    | `/api/purchases/line-pricing-by-product?productId=` | Pricing for one product                                    |
| `GET`    | `/api/purchases/:id`                                | Purchase with line items                                   |
| `POST`   | `/api/purchases`                                    | Create (immediate or draft)                                |
| `PATCH`  | `/api/purchases/:id`                                | Update (draft/released only)                               |
| `DELETE` | `/api/purchases/:id`                                | Delete draft purchase                                      |
| `DELETE` | `/api/purchases/:id/items`                          | Remove all lines                                           |
| `POST`   | `/api/purchases/:id/release`                        | draft → released                                           |
| `POST`   | `/api/purchases/:id/receive`                        | draft/released → received                                  |
| `POST`   | `/api/purchases/:id/post-invoice`                   | received → invoiced                                        |
| `POST`   | `/api/purchases/:id/close`                          | invoiced → closed                                          |
| `POST`   | `/api/purchases/:id/cancel`                         | Cancel and reverse                                         |
| `POST`   | `/api/purchases/:id/refunds`                        | Record supplier credit/refund                              |

**Backend:** `PurchasesController` → `PurchasesService` + `PurchasesWorkflowService`  
**Frontend client:** `apps/qoondeeye-pharmacy/lib/services/purchases.ts`

### Create purchase payload

```json
{
  "workflow": "immediate",
  "supplierId": "uuid",
  "branchId": "uuid",
  "supplierInvoiceNo": "INV-2026-001",
  "purchaseOrderNo": "PO-100",
  "purchaseDate": "2026-06-05",
  "orderDate": "2026-06-01",
  "postingDate": "2026-06-05",
  "dueDate": "2026-07-05",
  "notes": "Monthly restock",
  "onCredit": true,
  "totalAmount": 1500.0,
  "items": [
    {
      "productId": "uuid",
      "quantity": 100,
      "batchNumber": "BATCH-A1",
      "costPrice": 10.0,
      "sellingPrice": 15.0,
      "expiryDate": "2027-12-31",
      "lineDiscount": 0,
      "taxAmount": 0,
      "lineNotes": ""
    }
  ]
}
```

Validation: `packages/validation/src/purchases.ts` (synced with Nest DTOs).

---

## Supplier Payments

### Purpose

Records cash/bank payments **to** suppliers, reducing Accounts Payable.

### Database — `supplier_payments`

| Column           | Type            |
| ---------------- | --------------- |
| `id`             | UUID            |
| `branch_id`      | UUID (required) |
| `supplier_id`    | UUID (required) |
| `amount`         | NUMERIC(14,2)   |
| `payment_date`   | DATE            |
| `reference`      | VARCHAR(255)    |
| `notes`          | TEXT            |
| `payment_method` | VARCHAR(50)     |
| `created_at`     | TIMESTAMP       |

### Accounting entry (`source_type = 'ap_payment'`)

| Account                     | Debit  | Credit |
| --------------------------- | ------ | ------ |
| Accounts Payable            | amount |        |
| Cash / Bank / Card clearing |        | amount |

Payment method determines credit account (cash vs bank vs card).

### API — `/api/accounting/supplier-payments`

| Method | Path                                                 | Description              |
| ------ | ---------------------------------------------------- | ------------------------ |
| `GET`  | `/api/accounting/supplier-payments?branchId=&limit=` | Recent payments          |
| `POST` | `/api/accounting/supplier-payments`                  | Record payment + journal |

**Backend:** `SupplierPaymentsService`  
**Frontend:** `lib/services/accounting.ts` → `getSupplierPayments`, `createSupplierPayment`

### Frontend UI

| Route                           | Component                        |
| ------------------------------- | -------------------------------- |
| `/vendors/supplier-payments`    | `supplier-payments-client.tsx`   |
| `/accounting/supplier-payments` | Redirect / alias to vendors area |

---

## Frontend routes & components

### Navigation (`erp-nav-config.ts`)

Under **Vendors**:

| Label    | Route                        |
| -------- | ---------------------------- |
| Bills    | `/vendors/bills`             |
| Vendors  | `/vendors/suppliers`         |
| Refunds  | `/vendors/returns`           |
| Payments | `/vendors/supplier-payments` |

### Key components

| File                                                                    | Role                                 |
| ----------------------------------------------------------------------- | ------------------------------------ |
| `components/features/bills/bills-page.tsx`                              | Bills list                           |
| `components/features/bills/purchase-document-client.tsx`                | Create/edit/view purchase document   |
| `components/features/bills/product-search-input.tsx`                    | Product picker on bill lines         |
| `components/features/bills/purchase-line-defaults.ts`                   | Default cost/sell from last purchase |
| `app/(pharmacy)/vendors/bills/new/page.tsx`                             | New bill                             |
| `app/(pharmacy)/vendors/bills/[purchaseId]/page.tsx`                    | View/edit bill                       |
| `app/(pharmacy)/vendors/suppliers/suppliers-client.tsx`                 | Supplier CRUD                        |
| `app/(pharmacy)/vendors/supplier-payments/supplier-payments-client.tsx` | AP payments                          |

### Line pricing helper

`GET /api/purchases/line-pricing-by-product` returns per-product:

- Last `cost_price`, `selling_price`
- `batch_number`, `expiry_date`
- `supplier_id`, `supplier_name`

Used when adding products to a new bill to pre-fill pricing from the most recent purchase (or batch/opening stock).

---

## Entity relationships

```
Supplier ─────┬─────< Product (optional default supplier)
              │
              ├─────< Purchase (vendor bill)
              │            │
              │            └─────< PurchaseItem ──> Product
              │                      │
              │                      └──> Batch (on receive)
              │
              ├─────< SupplierPayment
              │
              └──> Journal lines (partner_kind = supplier)

Purchase ──> Journal (source_type = purchase, on post-invoice)
Purchase ──> PurchaseRefund (financial credit)
```

---

## Permissions

| Permission         | UI effect                        |
| ------------------ | -------------------------------- |
| Admin / owner role | Create, update, delete suppliers |

Branch middleware restricts purchases and payments to branches the user can access.

---

## Key source files

### Backend (`qoondeeye-pharmacyDB`)

| Area                 | Path                                                            |
| -------------------- | --------------------------------------------------------------- |
| Prisma models        | `prisma/schema.prisma`                                          |
| Purchase workflow    | `src/purchases/purchases-workflow.service.ts`                   |
| Purchase CRUD        | `src/purchases/purchases.service.ts`                            |
| Purchase API         | `src/purchases/purchases.controller.ts`                         |
| Workflow types       | `src/purchases/purchase-workflow.types.ts`                      |
| Supplier API         | `src/suppliers/suppliers.service.ts`, `suppliers.controller.ts` |
| Accounting posting   | `src/accounting/accounting-posting.service.ts`                  |
| Supplier payments    | `src/accounting/supplier-payments.service.ts`                   |
| Migration (workflow) | `prisma/migrations/20260604120000_purchase_workflow/`           |

### Frontend (`qoondeeye-pharmacy`)

| Area                | Path                                                       |
| ------------------- | ---------------------------------------------------------- |
| Purchase API client | `lib/services/purchases.ts`                                |
| Supplier API client | `lib/services/suppliers.ts`                                |
| Validation          | `lib/validation.ts` → `@repo/validation` purchases schemas |
| Routes              | `lib/routes.ts`, `lib/erp-nav-config.ts`                   |
| Endpoints           | `lib/services/endpoints.ts`                                |

### Shared validation

`packages/validation/src/purchases.ts` — must stay in sync with Nest DTOs.

---

## Business rules summary

1. **Suppliers** are tenant-wide; only admin/owner can mutate them.
2. **Purchases** are branch-scoped; user must have branch access.
3. **Draft/released** purchases are editable; received+ are not.
4. **Pharmacy receive** requires batch number and expiry on every line.
5. **`on_credit`** on purchase controls Cash vs AP on invoice posting.
6. **Accounting lock dates** block receive, post-invoice, and supplier payments on closed periods.
7. **Immediate workflow** is the POS-style path: one-shot receive + invoice + close.
8. **Cancel** fully reverses inventory and accounting, then deletes the purchase.
9. **Supplier payments** are independent of individual purchases — they reduce overall AP balance per supplier (partner tagging on journal lines enables supplier statements).
