-- Catalog list performance indexes (tenant_template). Live tenant schemas mirrored in TenantService.applyTenantSchemaPatches.

CREATE INDEX IF NOT EXISTS "Product_created_at_idx" ON "tenant_template"."Product"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "Product_category_id_idx" ON "tenant_template"."Product"("category_id");
CREATE INDEX IF NOT EXISTS "Product_branch_id_created_at_idx" ON "tenant_template"."Product"("branch_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "Inventory_branch_id_idx" ON "tenant_template"."Inventory"("branch_id");

CREATE INDEX IF NOT EXISTS "ProductCategory_branch_id_name_idx" ON "tenant_template"."ProductCategory"("branch_id", "name");
