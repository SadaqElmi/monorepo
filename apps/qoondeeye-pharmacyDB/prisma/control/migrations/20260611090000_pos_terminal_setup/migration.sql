-- POS terminal setup: dashboard-provisioned terminals with username/password activation

ALTER TABLE "public"."pos_devices"
  ADD COLUMN IF NOT EXISTS "terminal_username" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "setup_password_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "binding_status" VARCHAR(20) NOT NULL DEFAULT 'unbound',
  ADD COLUMN IF NOT EXISTS "device_fingerprint" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "last_setup_attempt_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;

ALTER TABLE "public"."pos_devices"
  ALTER COLUMN "device_secret_hash" DROP NOT NULL;

ALTER TABLE "public"."pos_devices"
  ALTER COLUMN "bound_at" DROP NOT NULL,
  ALTER COLUMN "bound_at" DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS "pos_devices_terminal_username_key"
  ON "public"."pos_devices"("terminal_username")
  WHERE "terminal_username" IS NOT NULL;

-- Backfill legacy enrolled devices
UPDATE "public"."pos_devices"
SET
  "terminal_username" = COALESCE("terminal_username", "device_code"),
  "binding_status" = CASE
    WHEN "device_secret_hash" IS NOT NULL AND trim("device_secret_hash") <> '' THEN 'bound'
    ELSE 'unbound'
  END
WHERE "terminal_username" IS NULL OR "binding_status" = 'unbound';
