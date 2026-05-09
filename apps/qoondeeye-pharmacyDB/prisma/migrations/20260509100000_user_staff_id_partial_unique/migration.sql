-- staff_id + partial unique live on legacy "users" in older migrations; canonical template table is "User".
-- Match runtime Prisma model User.staffId without a full UNIQUE (duplicates allowed for NULL/blank per partial index).

ALTER TABLE "tenant_template"."User"
  ADD COLUMN IF NOT EXISTS "staff_id" VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS "User_staff_id_unique_not_null"
  ON "tenant_template"."User"("staff_id")
  WHERE "staff_id" IS NOT NULL AND BTRIM("staff_id") <> '';
