-- Roles metadata columns required by RolesService (description, active, is_system_role).

ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "is_system_role" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "roles"
SET "is_system_role" = TRUE
WHERE lower(name) IN (
  'admin',
  'manager',
  'cashier',
  'pharmacist',
  'auditor',
  'accountant',
  'finance_manager'
);
