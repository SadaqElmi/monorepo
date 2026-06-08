import { ProductsStatCard } from "./products-stat-card";

export type ProductsIntroAndStatsProps = {
  tenantSlug: string;
  totalCount: number;
};

export function ProductsIntroAndStats({
  tenantSlug,
  totalCount,
}: ProductsIntroAndStatsProps) {
  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Product Inventory
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage, track and update your pharmacy stock levels.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground md:self-auto">
          <span className="uppercase tracking-wide">Tenant</span>
          <span className="h-1 w-1 rounded-full bg-emerald-500" />
          <span className="font-medium text-foreground/80">
            {tenantSlug || "Not set"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProductsStatCard
          label="Total Products"
          value={totalCount.toLocaleString()}
          tone="primary"
          hint="Synced from catalog"
        />
        <ProductsStatCard
          label="Low Stock"
          value="—"
          tone="warning"
          hint="Requires stock tracking"
        />
        <ProductsStatCard
          label="Expired Items"
          value="—"
          tone="destructive"
          hint="Requires batch tracking"
        />
        <ProductsStatCard
          label="Stock Value"
          value="—"
          tone="info"
          hint="Requires pricing"
        />
      </div>
    </>
  );
}
