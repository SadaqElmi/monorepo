import type { Branch, Category, InventoryEntry, Product } from "@/lib/api";

export const ITEMS_TABLE_PAGE_SIZE = 10;

const CATEGORY_BADGE_STYLES = [
  "border-transparent bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200",
  "border-transparent bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  "border-transparent bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
  "border-transparent bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  "border-transparent bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  "border-transparent bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
];

export function categoryBadgeClass(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h + name.charCodeAt(i) * (i + 1)) % 997;
  }
  return CATEGORY_BADGE_STYLES[h % CATEGORY_BADGE_STYLES.length]!;
}

export type StockStatus = "in_stock" | "low" | "out";

export function stockStatus(qty: number, reorder: number): StockStatus {
  if (qty <= 0) return "out";
  if (qty <= reorder) return "low";
  return "in_stock";
}

/** Dot separator (items index page). */
export function formatStrengthForm(p: Product) {
  const s = p.strength?.trim();
  const f = p.formulation?.trim();
  if (s && f) return `${s} · ${f}`;
  return s || f || "—";
}

/** Slash separator (items-by-location mock). */
export function formatStrengthFormSlash(p: Product) {
  const s = p.strength?.trim();
  const f = p.formulation?.trim();
  if (s && f) return `${s} / ${f}`;
  return s || f || "—";
}

function productCategoryId(p: Product): string | null {
  const snake = (p as Product & { category_id?: string | null }).category_id;
  return p.categoryId ?? snake ?? p.category?.id ?? null;
}

/** Category name: joined categoryName from catalog API, then categories map, then nested. */
export function resolveCategoryLabel(
  p: Product,
  categoryMap: Map<string, string>,
): string {
  const joined = p.categoryName?.trim();
  if (joined) return joined;

  const id = productCategoryId(p);
  if (id) {
    const fromMap = categoryMap.get(id);
    if (fromMap) return fromMap;
  }
  const nested = p.category?.name?.trim();
  if (nested) return nested;
  return "—";
}

function productMatchesCategoryFilter(
  p: Product,
  categoryFilter: string,
): boolean {
  if (categoryFilter === "__all__") return true;
  const id = productCategoryId(p);
  return id === categoryFilter;
}

export type InventoryFlatRow = {
  key: string;
  productId: string;
  branchId: string;
  branchName: string;
  name: string;
  genericName: string | null;
  categoryLabel: string;
  strengthForm: string;
  unit: string | null;
  barcode: string;
  itemNo: string;
  qty: number;
  reorder: number;
  status: StockStatus;
};

/** One row per product; quantity summed across selected branches (items index page). */
export type ProductAggregateRow = {
  key: string;
  productId: string;
  name: string;
  categoryLabel: string;
  strengthForm: string;
  unit: string | null;
  itemNo: string;
  qty: number;
  reorder: number;
  status: StockStatus;
};

export function buildInvLookup(inventory: InventoryEntry[]) {
  const m = new Map<string, { qty: number; reorder: number }>();
  for (const row of inventory) {
    if (row.product_id && row.branch_id) {
      m.set(`${row.product_id}:${row.branch_id}`, {
        qty: row.quantity,
        reorder: row.reorder_level,
      });
    }
  }
  return m;
}

export function branchIdsForGrid(
  branchFilter: string,
  branches: Branch[],
): string[] {
  if (branchFilter !== "__all__") return [branchFilter];
  return branches.map((b) => b.id);
}

function defaultItemNo(p: Product) {
  const s = p.sku?.trim();
  if (s) return s.length > 12 ? s.slice(0, 12).toUpperCase() : s.toUpperCase();
  return p.id.slice(0, 8).toUpperCase();
}

export function emeraldItemNo(p: Product) {
  const skuPart = p.sku?.trim()
    ? p.sku.trim().slice(0, 8).toUpperCase()
    : p.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `#EZ-${skuPart}`;
}

export function computeFlatRows(
  products: Product[],
  categories: Category[],
  branches: Branch[],
  invLookup: Map<string, { qty: number; reorder: number }>,
  categoryFilter: string,
  branchFilter: string,
  statusFilter: string,
  query: string,
  strengthFormatter: (p: Product) => string = formatStrengthForm,
  itemNoFormatter: (p: Product) => string = defaultItemNo,
): InventoryFlatRow[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const branchMap = new Map(branches.map((b) => [b.id, b.name ?? "Branch"]));
  const bIds = branchIdsForGrid(branchFilter, branches);
  const q = query.trim().toLowerCase();
  const rows: InventoryFlatRow[] = [];

  const productCandidates = products.filter((p) => {
    if (!productMatchesCategoryFilter(p, categoryFilter)) return false;
    if (!q) return true;
    const cat = resolveCategoryLabel(p, categoryMap);
    const hay = [p.name, p.sku, p.genericName, p.id, p.description, cat]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  for (const p of productCandidates) {
    for (const bid of bIds) {
      const cell = invLookup.get(`${p.id}:${bid}`);
      const qty = cell?.qty ?? 0;
      const reorder = cell?.reorder ?? 10;
      const status = stockStatus(qty, reorder);
      if (statusFilter !== "__all__" && status !== statusFilter) continue;

      const categoryLabel = resolveCategoryLabel(p, categoryMap);
      const branchName = branchMap.get(bid) ?? bid;

      rows.push({
        key: `${p.id}:${bid}`,
        productId: p.id,
        branchId: bid,
        branchName,
        name: p.name,
        genericName: p.genericName ?? null,
        categoryLabel,
        strengthForm: strengthFormatter(p),
        unit: p.unit ?? null,
        barcode: p.sku ?? "—",
        itemNo: itemNoFormatter(p),
        qty,
        reorder,
        status,
      });
    }
  }

  return rows.sort((a, b) => {
    const n = a.name.localeCompare(b.name);
    if (n !== 0) return n;
    return a.branchName.localeCompare(b.branchName);
  });
}

export function computeProductAggregateRows(
  products: Product[],
  categories: Category[],
  branches: Branch[],
  invLookup: Map<string, { qty: number; reorder: number }>,
  categoryFilter: string,
  branchFilter: string,
  statusFilter: string,
  query: string,
  strengthFormatter: (p: Product) => string = formatStrengthForm,
  itemNoFormatter: (p: Product) => string = defaultItemNo,
): ProductAggregateRow[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const bIds = branchIdsForGrid(branchFilter, branches);
  const q = query.trim().toLowerCase();
  const rows: ProductAggregateRow[] = [];

  const productCandidates = products.filter((p) => {
    if (!productMatchesCategoryFilter(p, categoryFilter)) return false;
    if (!q) return true;
    const cat = resolveCategoryLabel(p, categoryMap);
    const hay = [p.name, p.sku, p.genericName, p.id, p.description, cat]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  for (const p of productCandidates) {
    let qty = 0;
    const reorders: number[] = [];
    for (const bid of bIds) {
      const cell = invLookup.get(`${p.id}:${bid}`);
      if (cell) {
        qty += cell.qty;
        reorders.push(cell.reorder);
      }
    }
    const reorder =
      reorders.length > 0 ? Math.min(...reorders) : 10;
    const status = stockStatus(qty, reorder);
    if (statusFilter !== "__all__" && status !== statusFilter) continue;

    const categoryLabel = resolveCategoryLabel(p, categoryMap);

    rows.push({
      key: p.id,
      productId: p.id,
      name: p.name,
      categoryLabel,
      strengthForm: strengthFormatter(p),
      unit: p.unit ?? null,
      itemNo: itemNoFormatter(p),
      qty,
      reorder,
      status,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function computeInventoryKpis(
  products: Product[],
  branches: Branch[],
  branchFilter: string,
  invLookup: Map<string, { qty: number; reorder: number }>,
) {
  const bIds = branchIdsForGrid(branchFilter, branches);
  let low = 0;
  let out = 0;
  for (const p of products) {
    for (const bid of bIds) {
      const cell = invLookup.get(`${p.id}:${bid}`);
      const qty = cell?.qty ?? 0;
      const reorder = cell?.reorder ?? 10;
      const s = stockStatus(qty, reorder);
      if (s === "low") low++;
      if (s === "out") out++;
    }
  }
  return {
    totalSkus: products.length,
    low,
    out,
    branchCount: branches.length,
  };
}
