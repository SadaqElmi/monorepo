-- CreateTable
CREATE TABLE "tenant_user_lookup" (
    "email" VARCHAR(255) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "schema_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "tenant_user_lookup_pkey" PRIMARY KEY ("email")
);

-- AddForeignKey
ALTER TABLE "tenant_user_lookup" ADD CONSTRAINT "tenant_user_lookup_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
