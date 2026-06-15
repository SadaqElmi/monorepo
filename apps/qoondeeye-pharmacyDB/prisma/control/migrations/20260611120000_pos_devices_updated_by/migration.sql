ALTER TABLE "public"."pos_devices"
  ADD COLUMN IF NOT EXISTS "updated_by_user_id" UUID NULL;
